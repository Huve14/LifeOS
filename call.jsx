// call.jsx / Live video call
//
// A small group, one room, with a responsive participant grid and a transport
// strip that reports the encrypted route LiveKit actually negotiated.

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
    element.style.transform = mirrored ? 'scaleX(-1)' : '';
    node.appendChild(element);

    return () => {
      node.replaceChildren();
    };
  }, [element, muted, mirrored]);

  return <div ref={holder} style={{ width: '100%', height: '100%', ...style }} />;
}

function AudioSurface({ element }) {
  const holder = useRef(null);

  useEffect(() => {
    const node = holder.current;
    if (!node) return;
    node.replaceChildren();
    if (!element) return;

    element.autoplay = true;
    element.muted = false;
    element.setAttribute('playsinline', 'true');
    node.appendChild(element);

    return () => {
      node.replaceChildren();
    };
  }, [element]);

  // Do not use display:none here. WebKit may suspend a remote media element
  // that is removed from layout; this keeps it mounted without making it visible.
  return <div ref={holder} className="call-audio-mount" aria-hidden="true" />;
}

function participantInitials(name) {
  const parts = String(name || 'Guest').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
}

function ParticipantTile({ participant, lastRow = false, localCameraFacing = 'user' }) {
  const showVideo = participant.cameraOn && participant.videoElement;
  const label = participant.isLocal ? `${participant.name} (You)` : participant.name;

  return (
    <div className={`call-participant-tile${participant.speaking ? ' is-speaking' : ''}${lastRow ? ' is-last-row' : ''}`}>
      {showVideo ? (
        <VideoSurface
          element={participant.videoElement}
          muted={participant.isLocal}
          mirrored={participant.isLocal && localCameraFacing === 'user'}
        />
      ) : (
        <div className="call-participant-placeholder">
          <div className="call-participant-avatar">{participantInitials(participant.name)}</div>
          <span>{participant.cameraOn ? 'Connecting video…' : 'Camera off'}</span>
        </div>
      )}
      <div className="call-participant-name">
        <span>{label}</span>
        {!participant.microphoneOn && (
          <span className="call-participant-muted" title="Microphone muted" aria-label="Microphone muted">
            <AnimatedIcon name="MicOff" size={14} play={0} />
          </span>
        )}
      </div>
    </div>
  );
}

function asVideoElement(element) {
  return element?.tagName === 'VIDEO' ? element : null;
}

/** Prefer the person speaking, then another caller, and use the local camera
 * only when nobody else has video. Native browser PiP can float one actual
 * video track; the in-app full-screen control still shows the complete grid. */
function pickPictureInPictureVideo(participants) {
  const candidates = [
    ...participants.filter(participant => !participant.isLocal && participant.speaking && participant.cameraOn),
    ...participants.filter(participant => !participant.isLocal && participant.cameraOn),
    ...participants.filter(participant => participant.isLocal && participant.cameraOn),
  ];
  return candidates.map(participant => asVideoElement(participant.videoElement)).find(Boolean) || null;
}

function supportsWebKitPictureInPicture(video) {
  return Boolean(
    video
    && typeof video.webkitSupportsPresentationMode === 'function'
    && video.webkitSupportsPresentationMode('picture-in-picture')
    && typeof video.webkitSetPresentationMode === 'function',
  );
}

async function closePictureInPicture(video) {
  if (document.pictureInPictureElement && document.exitPictureInPicture) {
    await document.exitPictureInPicture();
    return;
  }
  if (video?.webkitPresentationMode === 'picture-in-picture') {
    video.webkitSetPresentationMode('inline');
  }
}

function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function exitDocumentFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
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
      background: ok ? 'rgba(129, 206, 235, 0.20)' : 'rgba(246, 209, 16, 0.18)',
      fontSize: 12, lineHeight: 1.4,
    }}>
      <span style={{ fontSize: 13 }}>{ok ? '🔒' : '⚠️'}</span>
      <span style={{ flex: 1, color: 'var(--dark)' }}>
        {description}
        {!ok && transport !== 'unknown' && (
          <span style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>
            This route may not work on a restricted network.
          </span>
        )}
      </span>
    </div>
  );
}

function ControlButton({ onClick, active, danger, disabled = false, label, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active ? 'true' : 'false'}
      aria-label={label}
      title={label}
      className={`call-control-button${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
    >
      <AnimatedIcon name={icon} size={22} play={0} />
    </button>
  );
}

async function copyCallText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function CallScreen({
  onBack,
  onRecordInstead,
  launch = { id: 0, mode: 'video' },
  onLaunchHandled,
  inviteToken = '',
  guestName = '',
  standalone = false,
}) {
  const api = callApi();
  const previewGroupCall = import.meta.env.DEV
    && new URLSearchParams(window.location.search).has('preview-call');
  const callRef = useRef(null);
  const callStageRef = useRef(null);
  const callDockRef = useRef(null);
  const dockDragRef = useRef(null);
  const pipVideoRef = useRef(null);
  const launchHandledRef = useRef(0);
  const degradationRef = useRef(api?.call.newDegradationState());

  const [state, setState] = useState(previewGroupCall ? 'connected' : 'idle');
  const [callMode, setCallMode] = useState(launch.mode === 'audio' ? 'audio' : 'video');
  const [detail, setDetail] = useState('');
  const [quality, setQuality] = useState('unknown');
  const [transport, setTransport] = useState(null);
  const [participants, setParticipants] = useState(() => previewGroupCall ? [
    { identity: 'preview-local', name: 'You', isLocal: true, videoElement: null, audioElement: null, cameraOn: false, microphoneOn: true, speaking: false },
    { identity: 'preview-alex', name: 'Alex', isLocal: false, videoElement: null, audioElement: null, cameraOn: false, microphoneOn: true, speaking: true },
    { identity: 'preview-family', name: 'Mum', isLocal: false, videoElement: null, audioElement: null, cameraOn: false, microphoneOn: true, speaking: false },
    { identity: 'preview-friend', name: 'Aisha', isLocal: false, videoElement: null, audioElement: null, cameraOn: false, microphoneOn: false, speaking: false },
  ] : []);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(launch.mode !== 'audio');
  const [cameraFacing, setCameraFacing] = useState('user');
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [pipStatus, setPipStatus] = useState('');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [soundUnlocking, setSoundUnlocking] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [dockPosition, setDockPosition] = useState(null);
  const [suggestNote, setSuggestNote] = useState(false);
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [handleInput, setHandleInput] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [inviteStatus, setInviteStatus] = useState('');
  const [createdInvite, setCreatedInvite] = useState(null);

  const configured = api?.call.isConfigured() ?? false;
  const configProblem = configured ? null : api?.call.validateServerUrl(api.call.serverUrl());
  const fullscreen = nativeFullscreen || focusMode;
  const live = state === 'connected' || state === 'reconnecting';
  const busy = state === 'requesting' || state === 'connecting';
  const pipVideo = pickPictureInPictureVideo(participants);

  const clampDock = useCallback((x, y) => {
    const stage = callStageRef.current;
    const dock = callDockRef.current;
    if (!stage || !dock) return null;

    const bounds = { width: stage.clientWidth, height: stage.clientHeight };
    const bar = { width: dock.offsetWidth, height: dock.offsetHeight };
    if (api?.call.clampFloatingBarPosition) {
      return api.call.clampFloatingBarPosition({ x, y }, bounds, bar, 12);
    }

    return {
      x: Math.max(12, Math.min(x, Math.max(12, bounds.width - bar.width - 12))),
      y: Math.max(12, Math.min(y, Math.max(12, bounds.height - bar.height - 12))),
    };
  }, [api]);

  function beginDockDrag(event) {
    const stage = callStageRef.current;
    const dock = callDockRef.current;
    if (!stage || !dock) return;

    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    dockDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - dockRect.left,
      offsetY: event.clientY - dockRect.top,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDockPosition(clampDock(dockRect.left - stageRect.left, dockRect.top - stageRect.top));
  }

  function moveDock(event) {
    const drag = dockDragRef.current;
    const stage = callStageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;

    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    setDockPosition(clampDock(
      event.clientX - stageRect.left - drag.offsetX,
      event.clientY - stageRect.top - drag.offsetY,
    ));
  }

  function endDockDrag(event) {
    if (dockDragRef.current?.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function moveDockWithKeyboard(event) {
    if (event.key === 'Home') {
      event.preventDefault();
      setDockPosition(null);
      return;
    }

    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;

    const stage = callStageRef.current;
    const dock = callDockRef.current;
    if (!stage || !dock) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    const current = dockPosition || {
      x: dockRect.left - stageRect.left,
      y: dockRect.top - stageRect.top,
    };
    const step = event.shiftKey ? 48 : 18;
    setDockPosition(clampDock(
      current.x + (direction[0] * step),
      current.y + (direction[1] * step),
    ));
  }

  const leaveFullscreen = useCallback(async () => {
    setFocusMode(false);
    if (currentFullscreenElement()) {
      try {
        await exitDocumentFullscreen();
      } catch {
        // The browser may already be leaving fullscreen via Escape or a swipe.
      }
    }
    setNativeFullscreen(false);
  }, []);

  const hangUp = useCallback(async () => {
    const activeCall = callRef.current;
    callRef.current = null;
    try {
      await closePictureInPicture(pipVideoRef.current);
    } catch {
      // The operating system may have already dismissed its floating player.
    }
    pipVideoRef.current = null;
    await activeCall?.disconnect();
    await leaveFullscreen();
    api?.net.setBusy(false);
    setParticipants([]);
    setSoundBlocked(false);
    setTransport(null);
    setQuality('unknown');
    setDockPosition(null);
    setPipActive(false);
    setPipStatus('');
    setState('ended');
  }, [api, leaveFullscreen]);

  useEffect(() => () => {
    void closePictureInPicture(pipVideoRef.current).catch(() => {});
    void callRef.current?.disconnect();
    api?.net.setBusy(false);
  }, [api]);

  useEffect(() => {
    const updateFullscreen = () => setNativeFullscreen(Boolean(currentFullscreenElement()));
    document.addEventListener('fullscreenchange', updateFullscreen);
    document.addEventListener('webkitfullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      document.removeEventListener('webkitfullscreenchange', updateFullscreen);
    };
  }, []);

  useEffect(() => {
    const videos = [...new Set(participants
      .map(participant => asVideoElement(participant.videoElement))
      .filter(Boolean))];

    const entered = event => {
      pipVideoRef.current = event.currentTarget;
      setPipActive(true);
      setPipStatus('Picture in Picture is on. You can open another app while the call continues.');
    };
    const left = event => {
      if (pipVideoRef.current === event.currentTarget) pipVideoRef.current = null;
      setPipActive(false);
      setPipStatus('');
    };
    const webkitChanged = event => {
      if (event.currentTarget.webkitPresentationMode === 'picture-in-picture') entered(event);
      else left(event);
    };

    videos.forEach(video => {
      video.addEventListener('enterpictureinpicture', entered);
      video.addEventListener('leavepictureinpicture', left);
      video.addEventListener('webkitpresentationmodechanged', webkitChanged);
    });
    return () => videos.forEach(video => {
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
      video.removeEventListener('webkitpresentationmodechanged', webkitChanged);
    });
  }, [participants]);

  useEffect(() => {
    if (!pipStatus || pipActive) return undefined;
    const timer = window.setTimeout(() => setPipStatus(''), 4500);
    return () => window.clearTimeout(timer);
  }, [pipStatus, pipActive]);

  useEffect(() => {
    document.body.classList.toggle('call-fullscreen-open', fullscreen);
    return () => document.body.classList.remove('call-fullscreen-open');
  }, [fullscreen]);

  useEffect(() => {
    const active = busy || live;
    document.body.classList.toggle('call-live-open', active);
    return () => document.body.classList.remove('call-live-open');
  }, [busy, live]);

  useEffect(() => {
    if (standalone || !window.__suvedaCalls) return undefined;
    let cancelled = false;

    async function loadPeople() {
      const [nextProfile, nextContacts] = await Promise.all([
        window.__suvedaCalls.profile(),
        window.__suvedaCalls.contacts(),
      ]);
      if (!cancelled) {
        setProfile(nextProfile);
        setContacts(nextContacts);
      }
    }

    void loadPeople();
    return () => { cancelled = true; };
  }, [standalone]);

  useEffect(() => {
    if (!launch?.id || launchHandledRef.current === launch.id) return;
    launchHandledRef.current = launch.id;
    onLaunchHandled?.();
    void join(launch.mode === 'audio' ? 'audio' : 'video', inviteToken);
  }, [launch?.id]);

  async function join(mode = callMode, token = inviteToken) {
    if (callRef.current) return;
    const nextMode = mode === 'audio' ? 'audio' : 'video';
    setCallMode(nextMode);
    setMicOn(true);
    setCameraOn(nextMode === 'video');
    setCameraFacing('user');
    setCameraSwitching(false);
    setPipActive(false);
    setPipStatus('');
    pipVideoRef.current = null;
    setParticipants([]);
    setSoundBlocked(false);
    setSoundUnlocking(false);
    setTransport(null);
    setQuality('unknown');
    setDetail('');
    setDockPosition(null);
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
        onParticipants: setParticipants,
        onAudioPlaybackBlocked: setSoundBlocked,
        onTransport: setTransport,
      }, {
        mode: nextMode,
        inviteToken: token || undefined,
        guestName: guestName || profile?.display_name || undefined,
      });
      void api.native.tap('medium');
    } catch (err) {
      callRef.current = null;
      api.net.setBusy(false);
      setState('failed');
      setDetail(api.call.friendlyCallError(err));
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
    if (next) setCallMode('video');
    void api.native.tap('light');
  }

  async function switchCamera() {
    if (!callRef.current || !cameraOn || cameraSwitching) return;
    const requested = api.call.nextCameraFacingMode(cameraFacing);
    setCameraSwitching(true);
    setPipStatus('');
    try {
      const actual = await callRef.current.switchCamera(requested);
      setCameraFacing(actual);
      setPipStatus(actual === 'environment' ? 'Back camera is on.' : 'Front camera is on.');
      void api.native.tap('medium');
    } catch (error) {
      setPipStatus(api.call.friendlyCallError(error));
      void api.native.notifyHaptic('warning');
    } finally {
      setCameraSwitching(false);
    }
  }

  async function togglePictureInPicture() {
    if (pipActive || document.pictureInPictureElement) {
      try {
        await closePictureInPicture(pipVideoRef.current);
        pipVideoRef.current = null;
        setPipActive(false);
        setPipStatus('');
      } catch (error) {
        setPipStatus(api.call.friendlyCallError(error));
      }
      return;
    }

    const video = pipVideo;
    if (!video) {
      setPipStatus('Turn on a camera, then try Picture in Picture again.');
      return;
    }

    try {
      pipVideoRef.current = video;
      // iPhone/iPad Safari exposes Apple’s presentation-mode API. Desktop
      // Chrome and compatible Android browsers use the standard API below.
      // Both calls stay directly inside the user’s tap, as browsers require.
      if (supportsWebKitPictureInPicture(video)) {
        video.webkitSetPresentationMode('picture-in-picture');
      } else if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
      } else {
        throw new Error('Picture in Picture is not available in this browser.');
      }
      setPipActive(true);
      setPipStatus('Picture in Picture is on. You can open another app while the call continues.');
      void api.native.tap('medium');
    } catch (error) {
      pipVideoRef.current = null;
      setPipActive(false);
      const message = error instanceof Error ? error.message : '';
      setPipStatus(message.includes('not available')
        ? message
        : 'Picture in Picture was blocked. Tap the control again and allow it when your device asks.');
    }
  }

  async function enableSound() {
    if (!callRef.current || soundUnlocking) return;
    setSoundUnlocking(true);
    try {
      await callRef.current.startAudio();
      setSoundBlocked(false);
      setDetail('');
      void api.native.tap('light');
    } catch {
      setSoundBlocked(true);
      setDetail('Sound is still blocked. Check this site’s speaker permission, then tap again.');
    } finally {
      setSoundUnlocking(false);
    }
  }

  async function toggleFullscreen() {
    if (fullscreen) {
      await leaveFullscreen();
      return;
    }

    const stage = callStageRef.current;
    const request = stage?.requestFullscreen || stage?.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(stage);
        setNativeFullscreen(true);
        return;
      } catch {
        // iPhone Safari and older embedded webviews do not allow element
        // fullscreen. Focus mode below still fills the usable screen.
      }
    }
    setFocusMode(true);
  }

  async function addContact(event) {
    event.preventDefault();
    setContactStatus('Adding…');
    try {
      const added = await window.__suvedaCalls.addContact(handleInput);
      const nextContacts = await window.__suvedaCalls.contacts();
      setContacts(nextContacts);
      setHandleInput('');
      setContactStatus(`${added.display_name} is ready to call.`);
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : 'That person could not be added.');
    }
  }

  async function createInvite(mode, targetHandle = '') {
    if (!window.__suvedaCalls) return;
    setInviteStatus('Creating a private link…');
    try {
      const invite = await window.__suvedaCalls.createInvite(mode, targetHandle || undefined);
      const url = new URL(`/join/${invite.invite_token}`, window.location.origin);
      url.searchParams.set('mode', invite.invite_mode);
      const next = { ...invite, url: url.toString(), token: invite.invite_token, mode: invite.invite_mode };
      setCreatedInvite(next);
      await copyCallText(next.url);
      setInviteStatus('Link copied — it works in any browser for 24 hours.');
      void api.native.tap('medium');
    } catch (error) {
      setInviteStatus(error instanceof Error ? error.message : 'The link could not be created.');
    }
  }

  async function shareInvite() {
    if (!createdInvite) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my Life OS call',
          text: `Join my private ${createdInvite.mode} call`,
          url: createdInvite.url,
        });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyCallText(createdInvite.url);
    setInviteStatus('Link copied.');
  }

  async function disableInvite() {
    if (!createdInvite?.invite_id || !window.__suvedaCalls) return;
    const disabled = await window.__suvedaCalls.revokeInvite(createdInvite.invite_id);
    if (disabled) {
      setCreatedInvite(null);
      setInviteStatus('That link has been disabled.');
    } else {
      setInviteStatus('The link could not be disabled. Try again.');
    }
  }

  const remoteCount = participants.filter(participant => !participant.isLocal).length;
  const gridColumns = api?.call.callGridColumns(participants.length || 1) || 1;
  const gridRows = Math.ceil(Math.max(1, participants.length) / gridColumns);
  const lastRowStart = Math.max(
    0,
    participants.length - (participants.length % gridColumns || gridColumns),
  );

  useEffect(() => {
    if (!live) return undefined;

    const keepDockInsideStage = () => {
      setDockPosition(current => {
        if (!current) return current;
        return clampDock(current.x, current.y) || current;
      });
    };
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(keepDockInsideStage)
      : null;
    if (callStageRef.current) observer?.observe(callStageRef.current);
    if (callDockRef.current) observer?.observe(callDockRef.current);
    window.addEventListener('resize', keepDockInsideStage);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', keepDockInsideStage);
    };
  }, [live, clampDock]);

  return (
    <div className={`call-screen${busy || live ? ' is-active' : ''}`}>
      <ModulePage
        title="Calls"
        subtitle={live
          ? (remoteCount > 0
            ? `${remoteCount + 1} ${remoteCount === 1 ? 'person' : 'people'} in the room`
            : 'Waiting for others to join')
          : (standalone ? 'Private browser call' : 'Group calls from anywhere')}
        icon="Video"
        onBack={() => { void hangUp(); onBack?.(); }}
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

      {!busy && !live && state !== 'failed' && (
        <Card padding="24px" style={{
          maxWidth: 560, margin: '0 auto 16px', textAlign: 'center',
          background: 'radial-gradient(circle at 50% 0%, rgba(129, 206, 235, 0.32), transparent 58%), var(--white)',
        }}>
          <div style={{
            width: 76, height: 76, margin: '2px auto 16px', borderRadius: 26,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, var(--honey), var(--blue))',
            color: '#17272D', boxShadow: '0 12px 28px rgba(45, 114, 139, 0.18)',
          }}>
            <AnimatedIcon name="Phone" size={32} play={0} />
          </div>
          <h2 style={{ fontSize: 22, marginBottom: 7 }}>
            {standalone ? 'Rejoin the private call' : 'Call your people'}
          </h2>
          <p style={{
            maxWidth: 390, margin: '0 auto 20px', color: 'var(--muted)',
            fontSize: 13, lineHeight: 1.55,
          }}>
            {standalone
              ? 'Use the private link again. Audio uses less data when the connection is weak.'
              : 'Start a group call now, or make one browser link that everyone can use.'}
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
            gap: 10,
          }}>
            <Button onClick={() => join('video')} disabled={!configured} full>
              Video call
            </Button>
            <Button onClick={() => join('audio')} disabled={!configured} variant="ghost" full>
              Audio call
            </Button>
          </div>
          {!standalone && (
            <button type="button" className="call-video-note-option" onClick={onRecordInstead}>
              <span className="call-video-note-icon"><AnimatedIcon name="Video" size={21} play={0} /></span>
              <span className="call-video-note-copy">
                <strong>Send a video note</strong>
                <small>Record a message they can watch whenever they are ready.</small>
              </span>
              <span className="call-video-note-arrow" aria-hidden="true">›</span>
            </button>
          )}
          {state === 'ended' && (
            <div style={{ marginTop: 12, color: 'var(--muted)', fontSize: 11 }}>Call ended</div>
          )}
        </Card>
      )}

      {!standalone && !busy && !live && state !== 'failed' && (
        <Card padding="20px" style={{ maxWidth: 700, margin: '0 auto 16px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 12,
            alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Invite someone</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                Everyone appears in the call grid. Guests can join in Safari, Chrome, or any modern browser — no app or account needed.
              </div>
            </div>
            {profile?.handle && (
              <button
                onClick={() => { void copyCallText(profile.handle); setContactStatus('Your Life OS ID was copied.'); }}
                style={{
                  border: '1px solid var(--line)', borderRadius: 999, padding: '8px 12px',
                  background: 'var(--butter)', color: 'var(--dark)', fontSize: 12,
                  fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                aria-label="Copy your Life OS ID"
              >
                Your ID: @{profile.handle}
              </button>
            )}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
            gap: 10, marginBottom: 14,
          }}>
            <Button onClick={() => createInvite('audio')} disabled={!configured} full>
              Create audio link
            </Button>
            <Button onClick={() => createInvite('video')} disabled={!configured} variant="ghost" full>
              Create video link
            </Button>
          </div>

          {createdInvite && (
            <div style={{
              padding: 12, borderRadius: 14, background: 'rgba(129, 206, 235, 0.14)',
              border: '1px solid rgba(129, 206, 235, 0.42)', marginBottom: 14,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                {createdInvite.mode === 'audio' ? 'Audio' : 'Video'} link · expires in 24 hours
              </div>
              <div style={{
                fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', lineHeight: 1.45,
                padding: '9px 10px', borderRadius: 10, background: 'var(--white)', marginBottom: 10,
              }}>
                {createdInvite.url}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" onClick={shareInvite}>Share or copy</Button>
                <Button size="sm" variant="ghost" onClick={() => join(createdInvite.mode, createdInvite.token)}>
                  Start this call
                </Button>
                <Button size="sm" variant="ghost" onClick={disableInvite}>
                  Disable link
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={addContact} style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
            paddingTop: 14, borderTop: '1px solid var(--line)',
          }}>
            <input
              value={handleInput}
              onChange={event => setHandleInput(event.target.value)}
              placeholder="Add by Life OS ID, e.g. @name_ab12cd34ef"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Life OS ID"
              style={{
                minWidth: 0, border: '1px solid var(--line)', borderRadius: 12,
                padding: '11px 12px', background: 'var(--white)', color: 'var(--dark)',
                font: 'inherit', fontSize: 12,
              }}
            />
            <Button size="sm" type="submit" disabled={!handleInput.trim()}>Add</Button>
          </form>

          {contacts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {contacts.map(contact => (
                <button
                  key={contact.user_id}
                  onClick={() => createInvite('audio', contact.handle)}
                  title={`Create an audio link for @${contact.handle}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    border: '1px solid var(--line)', borderRadius: 999,
                    padding: '8px 11px', background: 'var(--white)', color: 'var(--dark)',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    background: 'var(--sky)', fontWeight: 800,
                  }}>{contact.display_name?.[0]?.toUpperCase() || '?'}</span>
                  <span><strong>{contact.display_name}</strong> · @{contact.handle}</span>
                </button>
              ))}
            </div>
          )}

          {(inviteStatus || contactStatus) && (
            <div role="status" style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
              {inviteStatus || contactStatus}
            </div>
          )}
        </Card>
      )}

      {(busy || live) && (
        <div
          ref={callStageRef}
          className={`call-stage${focusMode ? ' call-stage--focus' : ''}`}
          data-count={participants.length || 1}
        >
          {participants.length > 0 ? (
            <div
              className="call-participant-grid"
              style={{
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
              }}
            >
              {participants.map((participant, index) => (
                <ParticipantTile
                  key={participant.identity}
                  participant={participant}
                  lastRow={index >= lastRowStart}
                  localCameraFacing={cameraFacing}
                />
              ))}
            </div>
          ) : (
            <div className="call-stage-waiting">
              <div className="call-stage-waiting-icon">{callMode === 'audio' ? '☎' : '♡'}</div>
              <strong style={{ fontSize: 17 }}>
                {busy
                  ? (state === 'requesting' ? 'Checking your call access…' : 'Connecting securely…')
                  : 'You’re in — waiting for others'}
              </strong>
              <span>
                {busy
                  ? 'This usually takes a few seconds.'
                  : (inviteToken
                    ? 'Anyone with the same private link can join you here.'
                    : 'Others can tap Call or open your invitation link to join this room.')}
              </span>
            </div>
          )}

          {live && (
            <>
              <div className="call-quality-pill">
                <QualityDot quality={quality} />
                {QUALITY_LABEL[quality]}
                {state === 'reconnecting' && (
                  <span style={{ fontWeight: 500, opacity: 0.8 }}>Reconnecting</span>
                )}
              </div>

              {soundBlocked && (
                <button
                  type="button"
                  className="call-sound-unlock"
                  onClick={enableSound}
                  disabled={soundUnlocking}
                >
                  <AnimatedIcon name="Volume2" size={18} play={0} />
                  {soundUnlocking ? 'Starting sound…' : 'Tap to hear everyone'}
                </button>
              )}

              {pipStatus && (
                <div className="call-feature-status" role="status" aria-live="polite">
                  {pipStatus}
                </div>
              )}

              <div
                ref={callDockRef}
                className={`call-controls${dockPosition ? ' is-positioned' : ''}`}
                style={dockPosition ? {
                  left: dockPosition.x,
                  top: dockPosition.y,
                  right: 'auto',
                  bottom: 'auto',
                } : undefined}
                role="toolbar"
                aria-label="Call controls"
              >
                <button
                  type="button"
                  className="call-controls-grip"
                  onPointerDown={beginDockDrag}
                  onPointerMove={moveDock}
                  onPointerUp={endDockDrag}
                  onPointerCancel={endDockDrag}
                  onDoubleClick={() => setDockPosition(null)}
                  onKeyDown={moveDockWithKeyboard}
                  aria-label="Move call controls. Use arrow keys to move or Home to reset."
                  title="Drag to move · double-click to reset"
                >
                  <span aria-hidden="true" className="call-controls-grip-dots">
                    <i /><i /><i /><i /><i /><i />
                  </span>
                </button>
                <ControlButton
                  onClick={toggleMic}
                  active={!micOn}
                  label={micOn ? 'Mute' : 'Unmute'}
                  icon={micOn ? 'Mic' : 'MicOff'}
                />
                <ControlButton
                  onClick={toggleCamera}
                  active={!cameraOn}
                  label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  icon={cameraOn ? 'VideoIcon' : 'VideoOff'}
                />
                <ControlButton
                  onClick={switchCamera}
                  active={cameraSwitching}
                  disabled={!cameraOn || cameraSwitching}
                  label={cameraSwitching
                    ? 'Switching camera'
                    : (cameraFacing === 'user' ? 'Switch to back camera' : 'Switch to front camera')}
                  icon="SwitchCamera"
                />
                <ControlButton
                  onClick={togglePictureInPicture}
                  active={pipActive}
                  disabled={!pipActive && !pipVideo}
                  label={pipActive ? 'Exit Picture in Picture' : 'Use Picture in Picture'}
                  icon="PictureInPicture2"
                />
                <ControlButton
                  onClick={toggleFullscreen}
                  label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
                  icon={fullscreen ? 'Minimize2' : 'Maximize2'}
                />
                <ControlButton
                  onClick={() => { void hangUp(); }}
                  danger
                  label="End call"
                  icon="PhoneOff"
                />
              </div>
            </>
          )}

          <div className="call-audio-layer" aria-hidden="true">
            {participants.filter(participant => !participant.isLocal && participant.audioElement).map(participant => (
              <AudioSurface key={participant.identity} element={participant.audioElement} />
            ))}
          </div>
        </div>
      )}

      {soundBlocked && live && detail && (
        <div role="status" className="call-sound-detail">
          {detail}
        </div>
      )}

      {live && (
        <div className="call-live-meta" style={{ marginBottom: 14 }}>
          <TransportStrip report={transport} />
          {remoteCount > 0 && (
            <div className="call-room-count">
              {remoteCount + 1} {remoteCount === 1 ? 'person' : 'people'} connected
            </div>
          )}
        </div>
      )}

      {suggestNote && !standalone && (
        <Card padding="16px" style={{ marginBottom: 14 }} accent="var(--gold)">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            Call quality is poor
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>
            The connection has been weak for a while. A video note will get
            through where this will not, and she can watch it whenever.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => { void hangUp(); onRecordInstead?.(); }}>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => join(callMode)}>Try again</Button>
            {callMode === 'video' && (
              <Button size="sm" variant="ghost" onClick={() => join('audio')}>Try audio instead</Button>
            )}
            {!standalone && (
              <Button size="sm" variant="ghost" onClick={onRecordInstead}>Send a video note</Button>
            )}
          </div>
        </Card>
      )}

      {!live && (
        <div style={{
          fontSize: 12, color: 'var(--muted)',
          marginTop: 14, lineHeight: 1.5, textAlign: 'center',
        }}>
          Calls choose the best encrypted LiveKit route available, with TURN/TLS
          on port 443 as the restricted-network fallback. Audio mode uses less data on weak mobile connections.
        </div>
      )}
      </ModulePage>
    </div>
  );
}

function GuestCallScreen({ inviteToken, initialMode = 'audio' }) {
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  if (joining) {
    return (
      <div className="app" style={{
        minHeight: '100dvh', background: 'var(--cream)', color: 'var(--dark)',
        backgroundImage:
          'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.16) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.24) 0%, transparent 50%)',
      }}>
        <CallScreen
          standalone
          inviteToken={inviteToken}
          guestName={name.trim()}
          launch={{ id: 1, mode: initialMode }}
          onBack={() => setJoining(false)}
        />
      </div>
    );
  }

  return (
    <div className="app" style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      padding: 'clamp(18px, 5vw, 48px)', background: 'var(--cream)', color: 'var(--dark)',
      backgroundImage:
        'radial-gradient(at 15% 5%, rgba(246, 209, 16, 0.22) 0%, transparent 38%),' +
        'radial-gradient(at 95% 90%, rgba(129, 206, 235, 0.34) 0%, transparent 52%)',
    }}>
      <main style={{ width: 'min(100%, 480px)' }}>
        <Card padding="clamp(22px, 6vw, 38px)" style={{ textAlign: 'center' }}>
          <div style={{
            width: 76, height: 76, margin: '0 auto 18px', borderRadius: 26,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(135deg, var(--honey), var(--blue))',
            color: '#17272D', boxShadow: '0 12px 28px rgba(45, 114, 139, 0.18)',
          }}>
            <AnimatedIcon name={initialMode === 'audio' ? 'Phone' : 'Video'} size={32} play={0} />
          </div>
          <div style={{
            color: 'var(--muted)', fontSize: 11, fontWeight: 800,
            letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 8,
          }}>Life OS private call</div>
          <h1 style={{ fontSize: 'clamp(24px, 7vw, 34px)', marginBottom: 8 }}>
            You’ve been invited
          </h1>
          <p style={{
            color: 'var(--muted)', lineHeight: 1.6, fontSize: 13,
            maxWidth: 360, margin: '0 auto 22px',
          }}>
            Join this {initialMode} call from your browser. You do not need the Life OS app or an account.
          </p>
          <form onSubmit={event => {
            event.preventDefault();
            if (name.trim()) setJoining(true);
          }}>
            <label style={{ display: 'block', textAlign: 'left', fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
              Your name
            </label>
            <input
              value={name}
              onChange={event => setName(event.target.value.slice(0, 60))}
              placeholder="How should we show your name?"
              autoComplete="name"
              autoFocus
              style={{
                width: '100%', border: '1px solid var(--line)', borderRadius: 13,
                padding: '13px 14px', background: 'var(--white)', color: 'var(--dark)',
                font: 'inherit', fontSize: 14, marginBottom: 12,
              }}
            />
            <Button type="submit" disabled={!name.trim()} full>
              Join {initialMode} call
            </Button>
          </form>
          <div style={{ marginTop: 16, color: 'var(--muted)', fontSize: 11, lineHeight: 1.5 }}>
            🔒 The link expires automatically and only opens this call room.
          </div>
        </Card>
      </main>
    </div>
  );
}

Object.assign(window, { CallScreen, GuestCallScreen });
