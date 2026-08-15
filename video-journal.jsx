// video-journal.jsx / Async video journal
//
// Record a short clip any time; it lands in a shared timeline both of us can
// see, grouped by day, with both clocks on every entry. Clips persist. Nothing
// here is ephemeral.
//
// The write path is queue first: a recording is stored locally before any
// network call, so a dropped connection delays a clip rather than losing it.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

const MIN_SECONDS = 15;
const MAX_SECONDS = 120;

function lifeos() {
  return window.__lifeos;
}

// ---------- Shared store ----------
// The timeline and the nav badge both read this, so a refresh fetches once.

const journalStore = {
  notes: [],
  views: {},
  pending: [],
  status: 'idle', // idle | loading | ready | denied | error
  error: '',
  listeners: new Set(),

  emit() {
    this.listeners.forEach(fn => { try { fn(); } catch { /* keep going */ } });
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  async load() {
    const api = lifeos();
    if (!api) return;
    if (this.status === 'idle') this.status = 'loading';
    this.emit();

    try {
      const ready = await api.spaces.hasSpace();
      if (!ready) {
        this.status = 'denied';
        this.emit();
        return;
      }
      const [notes, views] = await Promise.all([
        api.videoNotes.listVideoNotes(),
        api.videoNotes.loadMyViews(),
      ]);
      this.notes = notes;
      this.views = views;
      this.status = 'ready';
      this.error = '';
    } catch (err) {
      this.status = 'error';
      this.error = err?.message || 'Could not load the timeline';
    }
    this.emit();
  },

  setPending(entries) {
    this.pending = entries.filter(e => e.kind === 'video-note');
    this.emit();
  },

  unwatched() {
    const api = lifeos();
    if (!api) return 0;
    return api.videoNotes.unwatchedCount(this.notes, this.views);
  },

  markWatchedLocally(noteId, seconds, completed) {
    this.views = {
      ...this.views,
      [noteId]: { note_id: noteId, watched_seconds: seconds, completed },
    };
    this.emit();
  },
};

let journalWired = false;

function wireJournalStore() {
  if (journalWired) return;
  const api = lifeos();
  if (!api) return;
  journalWired = true;

  api.videoNotes.subscribeVideoNotes(() => { void journalStore.load(); });
  api.outbox.subscribeOutbox(entries => journalStore.setPending(entries));
}

function useJournal() {
  const [, force] = useState(0);

  useEffect(() => {
    wireJournalStore();
    const unsub = journalStore.subscribe(() => force(n => n + 1));
    if (journalStore.status === 'idle') void journalStore.load();
    return unsub;
  }, []);

  return journalStore;
}

// Used by the bottom nav to show a dot when something is waiting.
function useUnwatchedCount() {
  const store = useJournal();
  return store.unwatched();
}

// ---------- Signed URL cache ----------

const urlCache = new Map();

function useSignedUrl(path, kind) {
  const [url, setUrl] = useState(() => urlCache.get(path) || null);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const cached = urlCache.get(path);
    if (cached) { setUrl(cached); return; }

    let cancelled = false;
    const api = lifeos();
    const fetcher = kind === 'poster' ? api?.videoNotes.posterUrl : api?.videoNotes.playbackUrl;
    if (!fetcher) return;

    fetcher(path).then(next => {
      if (cancelled || !next) return;
      urlCache.set(path, next);
      setUrl(next);
    }, () => {});

    return () => { cancelled = true; };
  }, [path, kind]);

  const refresh = useCallback(() => {
    urlCache.delete(path);
    setUrl(null);
  }, [path]);

  return [url, refresh];
}

// ---------- Recorder ----------

function RecorderSheet({ open, onClose }) {
  const api = lifeos();
  const previewRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const clientIdRef = useRef(null);

  const [phase, setPhase] = useState('setup'); // setup | ready | recording | review
  const [facing, setFacing] = useState('user');
  const [elapsed, setElapsed] = useState(0);
  // The recorder's onstop closure is created once, at the start of the take, so
  // the running time has to reach it through a ref rather than through state.
  const elapsedRef = useRef(0);
  // Bumped when we need a fresh camera after the stream was released.
  const [cameraNonce, setCameraNonce] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [reviewUrl, setReviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  // Declared before the camera effect so the ref is current when it runs.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* already stopping */ }
    }
    recorderRef.current = null;
    stopTracks();
    api?.net.setBusy(false);
  }, [api, stopTracks]);

  // Open the camera when the sheet opens, when the camera is flipped, and when
  // a new take starts after the last stream was released. Deliberately not
  // keyed on phase: re-running this mid-take would stop the very tracks the
  // recorder is reading from.
  useEffect(() => {
    if (!open) return;
    // Reopening on an unsent take keeps the review; no camera needed for it.
    if (phaseRef.current === 'review') return;

    let cancelled = false;

    async function openCamera() {
      if (!api?.recording.supportsRecording()) {
        setError('This browser cannot record video. Try Safari or Chrome.');
        return;
      }
      try {
        stopTracks();
        const stream = await navigator.mediaDevices.getUserMedia(
          api.recording.captureConstraints(facing),
        );
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
          await previewRef.current.play().catch(() => {});
        }
        setError('');
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        if (err?.name === 'NotAllowedError') {
          setError('Camera and microphone access is blocked. Allow it in your browser settings, then try again.');
        } else if (err?.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(err?.message || 'Could not start the camera');
        }
      }
    }

    void openCamera();
    return () => { cancelled = true; };
  }, [open, facing, cameraNonce, api, stopTracks]);

  // Always release the camera when the sheet closes.
  useEffect(() => {
    if (!open) teardown();
  }, [open, teardown]);

  useEffect(() => teardown, [teardown]);

  const finish = useCallback(async (mimeType) => {
    clearInterval(timerRef.current);
    timerRef.current = null;

    // Grab the poster from the live preview before the tracks go away.
    let poster = null;
    if (previewRef.current) {
      poster = await api.recording.posterFromVideo(previewRef.current).catch(() => null);
    }

    const settings = streamRef.current?.getVideoTracks()[0]?.getSettings?.() || {};
    const blob = new Blob(chunksRef.current, { type: api.recording.baseMime(mimeType) });
    chunksRef.current = [];
    stopTracks();
    api.net.setBusy(false);

    setResult({
      blob,
      poster,
      mimeType,
      width: settings.width ?? null,
      height: settings.height ?? null,
      seconds: elapsedRef.current,
    });
    setReviewUrl(URL.createObjectURL(blob));
    setPhase('review');
  }, [api, stopTracks]);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = api.recording.pickMimeType();
    if (!mimeType) {
      setError('This browser cannot record video.');
      return;
    }

    clientIdRef.current = api.recording.newClientId();
    chunksRef.current = [];

    let recorder;
    try {
      recorder = new MediaRecorder(stream, api.recording.recorderOptions(mimeType));
    } catch {
      // Some devices reject the bitrate hints. Fall back to defaults.
      recorder = new MediaRecorder(stream, { mimeType });
    }

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => { void finish(mimeType); };

    recorderRef.current = recorder;
    recorder.start(1000);
    api.net.setBusy(true);
    void api.native.tap('medium');

    elapsedRef.current = 0;
    setElapsed(0);
    setPhase('recording');

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      elapsedRef.current = seconds;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stopRecording();
    }, 100);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    void api.native.tap('light');
    try { recorder.stop(); } catch { /* already stopped */ }
  }

  function resetToSetup() {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    setResult(null);
    setCaption('');
    setElapsed(0);
    elapsedRef.current = 0;
    setPhase('setup');
  }

  function discard() {
    resetToSetup();
    // The previous take released the camera, so ask for a fresh one.
    setCameraNonce(n => n + 1);
  }

  async function send() {
    if (!result || sending) return;
    setSending(true);
    try {
      await api.videoNotes.queueVideoNote({
        blob: result.blob,
        poster: result.poster,
        durationSeconds: result.seconds,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        caption: caption.trim(),
        clientId: clientIdRef.current,
      });
      void api.native.notifyHaptic('success');
      resetToSetup();
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not save the recording');
    }
    setSending(false);
  }

  const canStop = elapsed >= MIN_SECONDS;
  const progress = Math.min(1, elapsed / MAX_SECONDS);
  const remaining = Math.max(0, MAX_SECONDS - elapsed);
  const sizeHint = result ? api.time.formatBytes(result.blob.size) : '';
  const tooBig = result ? !api.recording.isWithinSizeBudget(result.blob.size) : false;

  return (
    <Sheet open={open} onClose={phase === 'recording' ? () => {} : onClose} title="Record a note">
      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, fontWeight: 500, marginBottom: 14,
        }}>{error}</div>
      )}

      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: '#000',
        aspectRatio: '9 / 16',
        maxHeight: '52dvh',
        margin: '0 auto 14px',
        width: '100%',
      }}>
        {phase === 'review' && reviewUrl ? (
          <video
            src={reviewUrl}
            controls
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <video
            ref={previewRef}
            muted
            playsInline
            autoPlay
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: facing === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
        )}

        {phase === 'recording' && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            padding: '6px 12px', borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: '#A84242',
              animation: 'fade-in 0.8s ease-in-out infinite alternate',
            }} />
            {api.time.formatDuration(elapsed)}
            <span style={{ fontWeight: 500, opacity: 0.75 }}>
              {api.time.formatDuration(remaining)} left
            </span>
          </div>
        )}
      </div>

      {phase === 'recording' && (
        <div style={{ marginBottom: 14 }}>
          <ProgressBar
            value={Math.round(progress * 100)}
            total={100}
            color={canStop ? 'var(--teal)' : 'var(--gold)'}
            height={6}
          />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            {canStop
              ? 'Long enough to send whenever you are ready.'
              : `Keep going for ${Math.ceil(MIN_SECONDS - elapsed)} more seconds.`}
          </div>
        </div>
      )}

      {phase === 'review' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {api.time.formatDuration(result?.seconds || 0)} · {sizeHint}
          </div>
          {tooBig && (
            <div style={{
              background: '#fffbeb', color: '#92400e',
              padding: '10px 14px', borderRadius: 12, fontSize: 13,
            }}>
              This clip is above the 15 MB target. It will still send, but it may
              be slow on a weak connection.
            </div>
          )}
          <input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Add a note (optional)"
            maxLength={280}
            style={{
              width: '100%', padding: '12px 14px',
              border: '1px solid var(--line)', borderRadius: 12,
              fontSize: 15, fontFamily: 'inherit',
              background: 'var(--cream)', color: 'var(--dark)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={discard} full>Record again</Button>
            <Button onClick={send} full disabled={sending}>
              {sending ? 'Saving' : 'Send'}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 22, paddingTop: 4,
        }}>
          <button
            onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
            disabled={phase === 'recording'}
            style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '1px solid var(--line)', background: 'var(--white)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: phase === 'recording' ? 0.35 : 1,
              boxShadow: 'var(--shadow)',
            }}
            aria-label="Switch camera"
          >
            <AnimatedIcon name="SwitchCamera" size={20} />
          </button>

          {phase === 'recording' ? (
            <button
              onClick={stopRecording}
              disabled={!canStop}
              style={{
                width: 76, height: 76, borderRadius: '50%',
                background: canStop ? '#A84242' : 'var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-lg)',
                cursor: canStop ? 'pointer' : 'not-allowed',
              }}
              aria-label="Stop recording"
            >
              <span style={{ width: 26, height: 26, borderRadius: 6, background: '#fff' }} />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={phase !== 'ready'}
              style={{
                width: 76, height: 76, borderRadius: '50%',
                background: 'var(--white)',
                border: '3px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-lg)',
                opacity: phase === 'ready' ? 1 : 0.4,
              }}
              aria-label="Start recording"
            >
              <span style={{
                width: 54, height: 54, borderRadius: '50%',
                background: '#A84242',
              }} />
            </button>
          )}

          <div style={{ width: 48 }} />
        </div>
      )}

      {phase !== 'review' && (
        <div style={{
          textAlign: 'center', fontSize: 12, color: 'var(--muted)',
          marginTop: 14, lineHeight: 1.5,
        }}>
          Between {MIN_SECONDS} seconds and {MAX_SECONDS / 60} minutes.
          It saves to this device first, then uploads.
        </div>
      )}
    </Sheet>
  );
}

// ---------- Player ----------

function PlayerSheet({ note, open, onClose }) {
  const api = lifeos();
  const videoRef = useRef(null);
  const lastSaveRef = useRef(0);
  const [url, refreshUrl] = useSignedUrl(note?.storage_path, 'video');
  const [failed, setFailed] = useState(false);
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    if (!note) return;
    let cancelled = false;
    api?.spaces.displayNameFor(note.author_id).then(name => {
      if (!cancelled) setAuthorName(name);
    });
    return () => { cancelled = true; };
  }, [note, api]);

  useEffect(() => { setFailed(false); }, [note?.id]);

  const view = note ? journalStore.views[note.id] : null;

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !view) return;
    const resumeAt = Number(view.watched_seconds) || 0;
    // Only resume if they stopped somewhere in the middle.
    if (resumeAt > 2 && resumeAt < note.duration_seconds - 2) {
      video.currentTime = resumeAt;
    }
  }

  function onTimeUpdate() {
    const video = videoRef.current;
    if (!video || !note) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 5000) return;
    lastSaveRef.current = now;
    journalStore.markWatchedLocally(note.id, video.currentTime, false);
    void api.videoNotes.recordProgress(note.id, video.currentTime, false);
  }

  function onEnded() {
    if (!note) return;
    journalStore.markWatchedLocally(note.id, note.duration_seconds, true);
    void api.videoNotes.recordProgress(note.id, note.duration_seconds, true);
  }

  function retry() {
    setFailed(false);
    refreshUrl();
  }

  if (!note) return null;

  return (
    <Sheet open={open} onClose={onClose} title={authorName || 'Video note'}>
      <div style={{
        borderRadius: 'var(--radius)', overflow: 'hidden',
        background: '#000', marginBottom: 14,
        aspectRatio: '9 / 16', maxHeight: '58dvh',
      }}>
        {failed ? (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            color: '#fff', padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 14 }}>This clip did not load.</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Usually the connection. Your place in it is saved.
            </div>
            <Button size="sm" variant="glass" onClick={retry}>Try again</Button>
          </div>
        ) : url ? (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13,
          }}>Loading</div>
        )}
      </div>

      {note.caption && (
        <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>{note.caption}</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        {api.time.formatDualClock(note.recorded_at)}
      </div>
    </Sheet>
  );
}

// ---------- Timeline cards ----------

function PosterThumb({ path, unwatched }) {
  const [url] = useSignedUrl(path, 'poster');
  return (
    <div style={{
      position: 'relative',
      width: 72, height: 96, borderRadius: 14,
      overflow: 'hidden', flexShrink: 0,
      background: 'var(--sand)',
    }}>
      {url && (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.18)',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--dark)', fontSize: 12, paddingLeft: 2,
        }}>▶</span>
      </div>
      {unwatched && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          width: 10, height: 10, borderRadius: '50%',
          background: 'var(--honey)',
          border: '2px solid #fff',
        }} />
      )}
    </div>
  );
}

function NoteCard({ note, unwatched, authorName, onOpen, onDelete, isMine }) {
  const api = lifeos();
  return (
    <Card padding="12px" onClick={() => onOpen(note)} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <PosterThumb path={note.poster_path} unwatched={unwatched} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: unwatched ? 'var(--terracotta)' : 'var(--dark)',
            }}>{authorName}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {api.time.formatDuration(note.duration_seconds)}
            </span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            {api.time.formatDualClock(note.recorded_at)}
          </div>

          {note.caption && (
            <div style={{
              fontSize: 13, lineHeight: 1.4, marginTop: 6,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{note.caption}</div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', gap: 8 }}>
            {unwatched && <Badge status="pending" size="sm">New</Badge>}
            {isMine && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(note); }}
                style={{
                  marginLeft: 'auto', fontSize: 11, color: 'var(--muted)',
                  fontFamily: 'inherit', background: 'none', border: 'none',
                  cursor: 'pointer', opacity: 0.6, padding: 4,
                }}
              >Delete</button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PendingCard({ entry }) {
  const api = lifeos();
  const failed = entry.status === 'failed';
  const uploading = entry.status === 'uploading';

  return (
    <Card
      padding="12px"
      style={{ marginBottom: 10, borderStyle: 'dashed' }}
      accent={failed ? 'var(--terracotta)' : 'var(--gold)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {failed ? 'Not sent yet' : uploading ? 'Uploading' : 'Waiting for a connection'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>
          {api.time.formatDuration(entry.meta.durationSeconds)} · {api.time.formatBytes(entry.size)}
        </span>
      </div>

      {uploading && (
        <ProgressBar value={Math.round(entry.progress * 100)} total={100} height={6} color="var(--teal)" />
      )}

      {failed && (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          {entry.lastError || 'The upload did not complete.'} It is saved on this
          device, so nothing is lost.
        </div>
      )}

      {!uploading && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Button size="sm" onClick={() => api.sync.retryEntry(entry.id)}>Try again</Button>
          <Button size="sm" variant="ghost" onClick={() => api.sync.discardEntry(entry.id)}>
            Discard
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------- Screen ----------

function VideoJournalScreen({ onBack }) {
  const api = lifeos();
  const store = useJournal();
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [names, setNames] = useState({});
  const [online, setOnline] = useState(() => api?.net.isOnline() ?? true);

  useEffect(() => api?.net.onNetworkChange(setOnline), [api]);

  // Phase 4 hands off to here when a call is too poor to continue.
  useEffect(() => {
    function openRecorder() { setRecording(true); }
    window.addEventListener('lifeos:record-video-note', openRecorder);
    return () => window.removeEventListener('lifeos:record-video-note', openRecorder);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api?.spaces.loadSpace().then(space => {
      if (cancelled) return;
      const map = {};
      space.members.forEach(p => {
        if (p) map[p.user_id] = p.display_name;
      });
      setNames(map);
    });
    return () => { cancelled = true; };
  }, [api, store.status]);

  const myId = api?.spaces.currentUserId();

  const groups = useMemo(
    () => api?.time.groupByDay(store.notes, n => n.recorded_at) ?? [],
    [api, store.notes, store.status],
  );

  async function handleDelete(note) {
    if (!window.confirm('Delete this clip for both of you?')) return;
    await api.videoNotes.deleteVideoNote(note);
    void journalStore.load();
  }

  const unwatched = store.unwatched();

  return (
    <ModulePage
      title="Video journal"
      subtitle={
        unwatched > 0
          ? `${unwatched} to watch`
          : `${store.notes.length} ${store.notes.length === 1 ? 'clip' : 'clips'}`
      }
      icon="Video"
      onBack={onBack}
      action={<Button size="sm" onClick={() => setRecording(true)}>Record</Button>}
    >
      {!online && (
        <div style={{
          background: 'var(--sand)', color: 'var(--dark)',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginBottom: 14,
        }}>
          You are offline. New recordings are saved here and sent when you are back.
        </div>
      )}

      {store.status === 'denied' && (
        <EmptyState
          emoji="⏳"
          title="Still setting up"
          body="Your space has not finished loading. Check your connection and try again."
        />
      )}

      {store.status === 'error' && (
        <Card padding="16px" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
            Could not load the timeline
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            {store.error}
          </div>
          <Button size="sm" onClick={() => journalStore.load()}>Try again</Button>
        </Card>
      )}

      {store.pending.map(entry => <PendingCard key={entry.id} entry={entry} />)}

      {store.status === 'loading' && store.notes.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>Loading</div>
      )}

      {store.status === 'ready' && store.notes.length === 0 && store.pending.length === 0 && (
        <EmptyState
          emoji="🎥"
          title="Nothing here yet"
          body="Record something short. It stays here for good, so there is no rush to watch it."
          action={<Button onClick={() => setRecording(true)}>Record the first one</Button>}
        />
      )}

      {groups.map(group => (
        <div key={group.key} style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            margin: '6px 0 10px',
          }}>{group.heading}</div>

          {group.items.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              isMine={note.author_id === myId}
              unwatched={note.author_id !== myId && !store.views[note.id]?.completed}
              authorName={names[note.author_id] || (note.author_id === myId ? 'You' : 'Community member')}
              onOpen={setPlaying}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ))}

      <RecorderSheet open={recording} onClose={() => setRecording(false)} />
      <PlayerSheet note={playing} open={!!playing} onClose={() => setPlaying(null)} />
    </ModulePage>
  );
}

Object.assign(window, { VideoJournalScreen, useUnwatchedCount });
