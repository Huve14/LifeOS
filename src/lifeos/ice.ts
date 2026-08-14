// ICE transport inspection.
//
// The UAE blocks WhatsApp and FaceTime calling with DPI on Etisalat and du, so
// this call has to relay over TURN on TCP 443 and present as ordinary HTTPS.
// It is not enough to configure that and hope: this module reads back what the
// connection actually negotiated, so the call screen can say plainly whether
// the media is going over a TLS relay or has quietly fallen through to
// something that will be blocked.
//
// The peer connections belong to livekit-client, and reaching into its
// internals would break on any upgrade. Instead the constructor is wrapped for
// the duration of a call and the instances it creates are tracked. That is
// purely diagnostic and touches nothing about how the connection behaves.

export type CandidatePair = {
  localType: string;
  remoteType: string;
  protocol: string;
  /** 'tls', 'tcp' or 'udp' on a relay candidate; undefined otherwise. */
  relayProtocol?: string;
  port?: number;
  address?: string;
};

export type Transport =
  | 'relay-tls-443'
  | 'relay-tls'
  | 'relay-tcp'
  | 'relay-udp'
  | 'direct'
  | 'unknown';

/**
 * relay-tls-443 is the only classification that satisfies the constraint.
 * Everything below it is reported honestly rather than rounded up.
 */
export function classifyTransport(pair: CandidatePair | null): Transport {
  if (!pair) return 'unknown';

  if (pair.localType !== 'relay') {
    return pair.localType ? 'direct' : 'unknown';
  }

  const relay = (pair.relayProtocol ?? '').toLowerCase();
  if (relay === 'tls') return pair.port === 443 ? 'relay-tls-443' : 'relay-tls';
  if (relay === 'tcp') return 'relay-tcp';
  if (relay === 'udp') return 'relay-udp';

  // No relayProtocol reported. Fall back to the pair's own protocol, which at
  // least distinguishes a TCP relay from a UDP one.
  if (pair.protocol === 'tcp') return 'relay-tcp';
  if (pair.protocol === 'udp') return 'relay-udp';
  return 'unknown';
}

/** Would this transport survive DPI that blocks calling protocols? */
export function meetsPolicy(transport: Transport): boolean {
  return transport === 'relay-tls-443';
}

export function describeTransport(transport: Transport): string {
  switch (transport) {
    case 'relay-tls-443':
      return 'Relayed over TLS on port 443';
    case 'relay-tls':
      return 'Relayed over TLS, but not on port 443';
    case 'relay-tcp':
      return 'Relayed over plain TCP';
    case 'relay-udp':
      return 'Relayed over UDP';
    case 'direct':
      return 'Direct peer to peer';
    default:
      return 'Not established yet';
  }
}

// ---------- Peer connection probe ----------

const tracked = new Set<RTCPeerConnection>();
let original: typeof RTCPeerConnection | null = null;

export function installPeerConnectionProbe(): void {
  if (original || typeof window === 'undefined' || !window.RTCPeerConnection) return;

  original = window.RTCPeerConnection;
  const Base = original;

  function Wrapped(this: unknown, config?: RTCConfiguration) {
    const pc = new Base(config);
    tracked.add(pc);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'closed') tracked.delete(pc);
    });
    return pc;
  }

  Wrapped.prototype = Base.prototype;
  window.RTCPeerConnection = Wrapped as unknown as typeof RTCPeerConnection;
}

export function removePeerConnectionProbe(): void {
  if (!original || typeof window === 'undefined') return;
  window.RTCPeerConnection = original;
  original = null;
  tracked.clear();
}

/** Reads the nominated pair out of a stats report. Exported for testing. */
export function pairFromStats(report: Map<string, Record<string, unknown>>): CandidatePair | null {
  let selected: Record<string, unknown> | null = null;

  for (const entry of report.values()) {
    if (entry.type !== 'candidate-pair') continue;
    const nominated = entry.nominated === true || entry.selected === true;
    if (entry.state === 'succeeded' && (nominated || !selected)) {
      selected = entry;
      if (nominated) break;
    }
  }

  if (!selected) return null;

  const local = report.get(String(selected.localCandidateId));
  const remote = report.get(String(selected.remoteCandidateId));
  if (!local) return null;

  return {
    localType: String(local.candidateType ?? ''),
    remoteType: String(remote?.candidateType ?? ''),
    protocol: String(local.protocol ?? ''),
    relayProtocol: local.relayProtocol ? String(local.relayProtocol) : undefined,
    port: typeof local.port === 'number' ? local.port : undefined,
    address: local.address ? String(local.address) : undefined,
  };
}

export type TransportReport = {
  pairs: CandidatePair[];
  transports: Transport[];
  /** The weakest link, since one unprotected path is enough to be blocked. */
  worst: Transport;
  compliant: boolean;
};

const RANK: Record<Transport, number> = {
  'relay-tls-443': 0,
  'relay-tls': 1,
  'relay-tcp': 2,
  'relay-udp': 3,
  direct: 4,
  unknown: 5,
};

export async function inspectTransport(): Promise<TransportReport> {
  const pairs: CandidatePair[] = [];

  for (const pc of tracked) {
    if (pc.connectionState === 'closed') continue;
    try {
      const stats = await pc.getStats();
      const report = new Map<string, Record<string, unknown>>();
      stats.forEach((value, key) => report.set(key, value as Record<string, unknown>));
      const pair = pairFromStats(report);
      if (pair) pairs.push(pair);
    } catch {
      // A connection can close mid-inspection. Skip it.
    }
  }

  const transports = pairs.map(classifyTransport);
  const worst = transports.length
    ? transports.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b))
    : 'unknown';

  return {
    pairs,
    transports,
    worst,
    compliant: transports.length > 0 && transports.every(meetsPolicy),
  };
}
