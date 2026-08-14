// call.jsx / Live video call
//
// Two people, one room, relay only. The transport strip is not decoration: it
// reports what the connection actually negotiated, because a call that quietly
// falls back to peer to peer UDP will be blocked on Etisalat and du and the
// only symptom would be a call that never connects.

const { useState, useEffect, useRef, useCallback } = React;

function callApi() {
  return window.__lifeos;
}

const QUALITY_LABEL = {
  excellent: 'Strong',
  good: 'Good',
  poor: 'Weak',
  lost: 'Lost',
  unknown: 'Checking',
};

const QUALITY_COLOR = {
  excellent: 'var(--teal)',
  good: 'var(--teal)',
  poor: 'var(--gold)',
  lost: 'var(--terracotta)',
  unknown: 'var(--muted)',
};

function QualityDot({ quality }) {
  const bars = { excellent: 3, good: 2, poor: 1, lost: 0, unknown: 0 }[quality] ?? 0;
  const color = QUALITY_COLOR[quality];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
      {[4, 8, 12].map((height, index) => (
        <span
          key={height}
          style={{
            width: 3, height,
            borderRadius: 1,
            background: index < bars ? color : 'rgba(255,255,255,0.28)',
          }}
        />
      ))}
    </span>
  );
}

function VideoSurface({ element, muted, mirrored, style }) {
  const holder = useRef(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    node.replaceChildren();
    if (!element) return;

    element.autoplay = true;
    element.playsInline = true;
    element.muted = Boolean(muted);
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.objectFit = 'cover';
    if (mirrored) element.style.transform = 'scaleX(-1)';
    node.appendChild(element);

    return () => {
      node.replaceChildren();
    };
  }, [element, muted, mirrored]);

  return <div ref={holder} style={{ width: '100%', height: '100%', ...style }} />;
}

function TransportStrip({ report }) {
  const api = callApi();
  if (!report) return null;

  const transport = report.worst;
  const ok = report.compliant;
  const description = api.ice.describeTransport(transport);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 12,
      background: ok ? 'rgba(42, 110, 107, 0.14)' : 'rgba(196, 113, 74, 0.14)',
      fontSize: 12, lineHeight: 1.4,
    }}>
      <span style={{ fontSize: 13 }}>{ok ? '🔒' : '⚠️'}</span>
      <span style={{ flex: 1, color: 'var(--dark)' }}>
        {description}
        {!ok && transport !== 'unknown' && (
          <span style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>
            This route can be blocked on Etisalat and du.
          </span>
        )}
      </span>
    </div>
  );
}

function ControlButton({ onClick, active, danger, label, icon }) {
  const background = danger
    ? 'var(--terracotta)'
    : active
      ? 'rgba(255,255,255,0.92)'
      : 'rgba(255,255,255,0.18)';
  const color = danger ? '#fff' : active ? 'var(--dark)' : '#fff';

  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 56, height: 56, borderRadius: '50%',
        background, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', cursor: 'pointer',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
      }}
    >
      <AnimatedIcon name={icon} size={22} play={0} />
    </button>
  );
}

function CallScreen({ onBack, onRecordInstead }) {
  const api = callApi();
  const callRef = useRef(null);
  const degradationRef = useRef(api?.call.newDegradationState());

  const [state, setState] = useState('idle');
  const [detail, setDetail] = useState('');
  const [quality, setQuality] = useState('unknown');
  const [transport, setTransport] = useState(null);
  const [localEl, setLocalEl] = useState(null);
  const [remoteEl, setRemoteEl] = useState(null);
  const [remoteAudioEl, setRemoteAudioEl] = useState(null);
  const [participants, setParticipants] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [suggestNote, setSuggestNote] = useState(false);

  const configured = api?.call.isConfigured() ?? false;
  const configProblem = configured ? null : api?.call.validateServerUrl(api.call.serverUrl());

  const hangUp = useCallback(async () => {
    await callRef.current?.disconnect();
    callRef.current = null;
    api?.net.setBusy(false);
    setState('ended');
  }, [api]);

  useEffect(() => () => { void callRef.current?.disconnect(); api?.net.setBusy(false); }, [api]);

  async function join() {
    if (callRef.current) return;
    setDetail('');
    setSuggestNote(false);
    degradationRef.current = api.call.newDegradationState();
    // Keeps a service worker update from reloading the page mid-call.
    api.net.setBusy(true);

    try {
      callRef.current = await api.call.startCall({
        onState: (next, why) => {
          setState(next);
          if (why) setDetail(why);
          if (next === 'ended' || next === 'failed') api.net.setBusy(false);
        },
        onQuality: next => {
          setQuality(next);
          const result = api.call.trackDegradation(degradationRef.current, next, Date.now());
          degradationRef.current = result.state;
          if (result.suggest) {
            setSuggestNote(true);
            void api.native.notifyHaptic('warning');
          }
        },
        onRemoteTrack: setRemoteEl,
        onRemoteAudio: setRemoteAudioEl,
        onLocalTrack: setLocalEl,
        onParticipantCount: setParticipants,
        onTransport: setTransport,
      });
      void api.native.tap('medium');
    } catch (err) {
      callRef.current = null;
      api.net.setBusy(false);
      setState('failed');
      setDetail(err?.message || 'Could not connect');
    }
  }

  async function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    await callRef.current?.setMicEnabled(next);
    void api.native.tap('light');
  }

  async function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    await callRef.current?.setCameraEnabled(next);
    void api.native.tap('light');
  }

  const live = state === 'connected' || state === 'reconnecting';
  const busy = state === 'requesting' || state === 'connecting';

  return (
    <ModulePage
      title="Call"
      subtitle={live ? (participants > 0 ? 'Connected' : 'Waiting for them to join') : 'Two of us'}
      icon="Video"
      onBack={() => { void hangUp(); onBack(); }}
    >
      {!configured && (
        <Card padding="16px" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Calling is not set up</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            {configProblem && !configProblem.ok
              ? configProblem.reason
              : 'No LiveKit URL is configured.'}
            {' '}Set VITE_LIVEKIT_URL, then add the key and secret on the server. See docs/CALLS.md.
          </div>
        </Card>
      )}

      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: '#000',
        aspectRatio: '3 / 4',
        maxHeight: '58dvh',
        marginBottom: 14,
      }}>
        {remoteEl ? (
          <VideoSurface element={remoteEl} />
        ) : (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: 'rgba(255,255,255,0.65)', fontSize: 13, padding: 24, textAlign: 'center',
          }}>
            {busy && 'Connecting'}
            {live && participants === 0 && 'Waiting for them to join'}
            {!busy && !live && 'Not in a call'}
          </div>
        )}

        {localEl && cameraOn && (
          <div style={{
            position: 'absolute', right: 12, bottom: 12,
            width: 96, height: 128, borderRadius: 14,
            overflow: 'hidden', background: '#111',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}>
            <VideoSurface element={localEl} muted mirrored />
          </div>
        )}

        {live && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            padding: '6px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 600,
          }}>
            <QualityDot quality={quality} />
            {QUALITY_LABEL[quality]}
            {state === 'reconnecting' && (
              <span style={{ fontWeight: 500, opacity: 0.8 }}>Reconnecting</span>
            )}
          </div>
        )}
      </div>

      {live && <div style={{ marginBottom: 14 }}><TransportStrip report={transport} /></div>}

      {suggestNote && (
        <Card padding="16px" style={{ marginBottom: 14 }} accent="var(--gold)">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            Call quality is poor
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
            The connection has been weak for a while. A video note will get
            through where this will not, and she can watch it whenever.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => { void hangUp(); onRecordInstead(); }}>
              Send a video note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestNote(false)}>
              Stay on the call
            </Button>
          </div>
        </Card>
      )}

      {state === 'failed' && (
        <Card padding="16px" style={{ marginBottom: 14 }} accent="var(--terracotta)">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>The call did not connect</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
            {detail || 'Something went wrong.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={join}>Try again</Button>
            <Button size="sm" variant="ghost" onClick={onRecordInstead}>Send a video note</Button>
          </div>
        </Card>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '4px 0 8px',
      }}>
        {live ? (
          <>
            <ControlButton
              onClick={toggleMic}
              active={!micOn}
              label={micOn ? 'Mute' : 'Unmute'}
              icon={micOn ? 'Mic' : 'MicOff'}
            />
            <ControlButton
              onClick={() => { void hangUp(); }}
              danger
              label="End call"
              icon="PhoneOff"
            />
            <ControlButton
              onClick={toggleCamera}
              active={!cameraOn}
              label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
              icon={cameraOn ? 'VideoIcon' : 'VideoOff'}
            />
          </>
        ) : (
          <Button onClick={join} disabled={busy || !configured} full>
            {busy ? 'Connecting' : 'Start the call'}
          </Button>
        )}
      </div>

      {remoteAudioEl && (
        <div style={{ display: 'none' }} aria-hidden="true">
          <VideoSurface element={remoteAudioEl} />
        </div>
      )}

      {!live && (
        <div style={{
          fontSize: 12, color: 'var(--muted)',
          marginTop: 14, lineHeight: 1.5, textAlign: 'center',
        }}>
          Calls relay over TLS on port 443 so they look like ordinary web
          traffic. Slower than a direct connection, and far more likely to work.
        </div>
      )}
    </ModulePage>
  );
}

Object.assign(window, { CallScreen });
