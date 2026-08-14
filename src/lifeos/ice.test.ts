import { describe, it, expect } from 'vitest';
import {
  classifyTransport,
  describeTransport,
  meetsPolicy,
  pairFromStats,
  type CandidatePair,
} from './ice';

function pair(overrides: Partial<CandidatePair> = {}): CandidatePair {
  return {
    localType: 'relay',
    remoteType: 'relay',
    protocol: 'tcp',
    relayProtocol: 'tls',
    port: 443,
    ...overrides,
  };
}

describe('classifyTransport', () => {
  it('recognises the TCP 443 fallback', () => {
    expect(classifyTransport(pair())).toBe('relay-tls-443');
  });

  it('keeps a TLS relay on another port distinct', () => {
    expect(classifyTransport(pair({ port: 5349 }))).toBe('relay-tls');
  });

  it('separates a plain TCP relay from a TLS one', () => {
    expect(classifyTransport(pair({ relayProtocol: 'tcp', port: 3478 }))).toBe('relay-tcp');
  });

  it('recognises a UDP relay', () => {
    expect(classifyTransport(pair({ relayProtocol: 'udp', protocol: 'udp' }))).toBe('relay-udp');
  });

  it('recognises a direct route to the LiveKit media edge', () => {
    expect(classifyTransport(pair({ localType: 'host', relayProtocol: undefined }))).toBe('direct');
    expect(classifyTransport(pair({ localType: 'srflx', relayProtocol: undefined }))).toBe('direct');
  });

  it('falls back to the pair protocol when relayProtocol is missing', () => {
    expect(classifyTransport(pair({ relayProtocol: undefined, protocol: 'tcp' }))).toBe('relay-tcp');
    expect(classifyTransport(pair({ relayProtocol: undefined, protocol: 'udp' }))).toBe('relay-udp');
  });

  it('is unknown before anything is established', () => {
    expect(classifyTransport(null)).toBe('unknown');
    expect(classifyTransport(pair({ localType: '' }))).toBe('unknown');
  });

  it('is case insensitive about the relay protocol', () => {
    expect(classifyTransport(pair({ relayProtocol: 'TLS' }))).toBe('relay-tls-443');
  });
});

describe('meetsPolicy', () => {
  it('accepts every established LiveKit route', () => {
    for (const transport of ['relay-tls-443', 'relay-tls', 'relay-tcp', 'relay-udp', 'direct'] as const) {
      expect(meetsPolicy(transport)).toBe(true);
    }
  });

  it('rejects an unknown route while ICE is still connecting', () => {
    expect(meetsPolicy('unknown')).toBe(false);
  });
});

describe('describeTransport', () => {
  it('names each case in plain words', () => {
    expect(describeTransport('relay-tls-443')).toBe('Secure TURN/TLS fallback on port 443');
    expect(describeTransport('direct')).toBe('Direct encrypted route to LiveKit');
    expect(describeTransport('unknown')).toBe('Finding the best media route…');
  });
});

describe('pairFromStats', () => {
  function stats(entries: Array<[string, Record<string, unknown>]>) {
    return new Map(entries);
  }

  it('reads the nominated pair and its local candidate', () => {
    const report = stats([
      ['cp1', {
        type: 'candidate-pair',
        state: 'succeeded',
        nominated: true,
        localCandidateId: 'lc1',
        remoteCandidateId: 'rc1',
      }],
      ['lc1', {
        type: 'local-candidate',
        candidateType: 'relay',
        protocol: 'tcp',
        relayProtocol: 'tls',
        port: 443,
        address: '10.0.0.1',
      }],
      ['rc1', { type: 'remote-candidate', candidateType: 'relay' }],
    ]);

    expect(pairFromStats(report)).toEqual({
      localType: 'relay',
      remoteType: 'relay',
      protocol: 'tcp',
      relayProtocol: 'tls',
      port: 443,
      address: '10.0.0.1',
    });
  });

  it('prefers the nominated pair over another succeeded one', () => {
    const report = stats([
      ['cp1', {
        type: 'candidate-pair', state: 'succeeded', nominated: false,
        localCandidateId: 'host', remoteCandidateId: 'r',
      }],
      ['cp2', {
        type: 'candidate-pair', state: 'succeeded', nominated: true,
        localCandidateId: 'relay', remoteCandidateId: 'r',
      }],
      ['host', { candidateType: 'host', protocol: 'udp' }],
      ['relay', { candidateType: 'relay', protocol: 'tcp', relayProtocol: 'tls', port: 443 }],
      ['r', { candidateType: 'relay' }],
    ]);

    expect(pairFromStats(report)?.localType).toBe('relay');
  });

  it('ignores pairs that have not succeeded', () => {
    const report = stats([
      ['cp1', {
        type: 'candidate-pair', state: 'in-progress', nominated: false,
        localCandidateId: 'lc1', remoteCandidateId: 'rc1',
      }],
      ['lc1', { candidateType: 'relay' }],
    ]);
    expect(pairFromStats(report)).toBeNull();
  });

  it('returns null on an empty report', () => {
    expect(pairFromStats(stats([]))).toBeNull();
  });

  it('returns null when the local candidate is missing', () => {
    const report = stats([
      ['cp1', {
        type: 'candidate-pair', state: 'succeeded', nominated: true,
        localCandidateId: 'gone', remoteCandidateId: 'rc1',
      }],
    ]);
    expect(pairFromStats(report)).toBeNull();
  });
});
