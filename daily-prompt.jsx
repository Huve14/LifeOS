// daily-prompt.jsx / Daily prompt
//
// One question a day, the same one for both of us. Neither answer is readable
// until both have been submitted, and that is enforced in the database rather
// than here: before the reveal, the other person's answer is simply not in the
// response.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

const VOICE_MAX_SECONDS = 90;

function lifeosApi() {
  return window.__lifeos;
}

// ---------- Store ----------

const promptStore = {
  prompts: [],
  answers: [],
  answered: [],
  pending: [],
  today: null,
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
    const api = lifeosApi();
    if (!api) return;
    if (this.status === 'idle') this.status = 'loading';
    this.today = api.prompts.promptDateFor();
    this.emit();

    try {
      const ready = await api.spaces.hasSpace();
      if (!ready) {
        this.status = 'denied';
        this.emit();
        return;
      }
      const [prompts, answers, answered] = await Promise.all([
        api.prompts.loadPrompts(),
        api.prompts.loadAnswers(),
        api.prompts.loadAnsweredDates(),
      ]);
      this.prompts = prompts;
      this.answers = answers;
      this.answered = answered;
      this.status = 'ready';
      this.error = '';
    } catch (err) {
      this.status = 'error';
      this.error = err?.message || 'Could not load the prompt';
    }
    this.emit();
  },

  setPending(entries) {
    this.pending = entries.filter(e => e.kind === 'prompt-answer');
    this.emit();
  },

  statusFor(date) {
    return this.answered.find(a => a.prompt_date === date);
  },

  answersFor(date) {
    return this.answers.filter(a => a.prompt_date === date);
  },

  pendingFor(date) {
    return this.pending.find(e => e.meta.promptDate === date) || null;
  },

  /** My answer, whether it has reached the server or is still queued. */
  mineFor(date, myId) {
    const saved = this.answers.find(a => a.prompt_date === date && a.author_id === myId);
    if (saved) return { saved, queued: null };
    const queued = this.pendingFor(date);
    return { saved: null, queued };
  },
};

let promptWired = false;

function wirePromptStore() {
  if (promptWired) return;
  const api = lifeosApi();
  if (!api) return;
  promptWired = true;

  api.prompts.subscribePromptAnswers(() => { void promptStore.load(); });
  api.prompts.scheduleDayRollover(() => { void promptStore.load(); });
  api.outbox.subscribeOutbox(entries => promptStore.setPending(entries));
}

function usePrompts() {
  const [, force] = useState(0);

  useEffect(() => {
    wirePromptStore();
    const unsub = promptStore.subscribe(() => force(n => n + 1));
    if (promptStore.status === 'idle') void promptStore.load();
    return unsub;
  }, []);

  return promptStore;
}

/** True when today's question is still waiting on me. Drives the nav dot. */
function useUnansweredToday() {
  const store = usePrompts();
  const api = lifeosApi();
  if (store.status !== 'ready' || !store.today) return false;
  const myId = api?.spaces.currentUserId();
  const { saved, queued } = store.mineFor(store.today, myId);
  return !saved && !queued;
}

// ---------- Voice note recorder ----------

function VoiceRecorder({ value, onChange }) {
  const api = lifeosApi();
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const elapsedRef = useRef(0);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  // Held in a ref so unmount can revoke whichever URL is current.
  const previewUrlRef = useRef(null);
  previewUrlRef.current = previewUrl;

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    api?.net.setBusy(false);
  }, [api]);

  useEffect(() => () => {
    cleanup();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [cleanup]);

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    try { recorder.stop(); } catch { /* already stopped */ }
  }

  async function start() {
    if (!api?.recording.supportsAudioRecording()) {
      setError('This browser cannot record audio.');
      return;
    }
    const mimeType = api.recording.pickAudioMimeType();
    if (!mimeType) {
      setError('This browser cannot record audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(api.recording.AUDIO_CONSTRAINTS);
      streamRef.current = stream;
      chunksRef.current = [];

      let recorder;
      try {
        recorder = new MediaRecorder(stream, api.recording.audioRecorderOptions(mimeType));
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: api.recording.baseMime(mimeType) });
        chunksRef.current = [];
        cleanup();
        setRecording(false);
        setPreviewUrl(URL.createObjectURL(blob));
        onChange({ blob, mimeType, seconds: elapsedRef.current });
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      api.net.setBusy(true);
      void api.native.tap('medium');

      elapsedRef.current = 0;
      setElapsed(0);
      setError('');
      setRecording(true);

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const seconds = (Date.now() - startedAt) / 1000;
        elapsedRef.current = seconds;
        setElapsed(seconds);
        if (seconds >= VOICE_MAX_SECONDS) stop();
      }, 100);
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setError('Microphone access is blocked. Allow it in your browser settings, then try again.');
      } else {
        setError(err?.message || 'Could not start the microphone');
      }
      cleanup();
    }
  }

  function clear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setElapsed(0);
    elapsedRef.current = 0;
    onChange(null);
  }

  if (value && previewUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <audio src={previewUrl} controls style={{ flex: 1, height: 36 }} />
        <button
          onClick={clear}
          style={{
            fontSize: 12, color: 'var(--muted)', fontFamily: 'inherit',
            background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          }}
        >Remove</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          padding: '8px 12px', borderRadius: 10,
          fontSize: 12, marginBottom: 8,
        }}>{error}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button
          size="sm"
          variant={recording ? 'primary' : 'ghost'}
          onClick={recording ? stop : start}
        >
          {recording ? 'Stop' : 'Record a voice note'}
        </Button>
        {recording && (
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {api.time.formatDuration(elapsed)} of {api.time.formatDuration(VOICE_MAX_SECONDS)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Answer display ----------

function VoicePlayer({ path }) {
  const api = lifeosApi();
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api?.prompts.voiceUrl(path).then(next => {
      if (!cancelled) setUrl(next);
    }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [path, api]);

  if (failed) {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        The voice note did not load. Check your connection and reopen this.
      </div>
    );
  }
  if (!url) {
    return <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Loading</div>;
  }
  return (
    <audio
      src={url}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
      style={{ width: '100%', height: 36, marginTop: 8 }}
    />
  );
}

function AnswerBlock({ answer, name, highlight }) {
  const api = lifeosApi();
  return (
    <div style={{
      padding: '12px 14px',
      background: highlight ? 'rgba(246, 209, 16, 0.16)' : 'var(--sand)',
      borderRadius: 14,
      marginTop: 10,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--muted)',
        marginBottom: answer.body ? 6 : 0,
      }}>{name}</div>
      {answer.body && (
        <div style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{answer.body}</div>
      )}
      {answer.audio_path && <VoicePlayer path={answer.audio_path} />}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        {api.time.formatDualClock(answer.created_at)}
      </div>
    </div>
  );
}

// ---------- Composer ----------

function Composer({ promptDate, onSubmitted }) {
  const api = lifeosApi();
  const [body, setBody] = useState('');
  const [voice, setVoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = body.trim().length > 0 || voice !== null;

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.prompts.queueAnswer({
        promptDate,
        body: body.trim(),
        audio: voice?.blob ?? null,
        audioDurationSeconds: voice ? Math.round(voice.seconds * 100) / 100 : null,
        mimeType: voice?.mimeType ?? null,
        clientId: api.recording.newClientId(),
      });
      void api.native.notifyHaptic('success');
      setBody('');
      setVoice(null);
      onSubmitted();
    } catch (err) {
      setError(err?.message || 'Could not save your answer');
    }
    setSaving(false);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Type your answer"
        rows={4}
        style={{
          width: '100%', padding: '12px 14px',
          border: '1px solid var(--line)', borderRadius: 14,
          fontSize: 15, fontFamily: 'inherit', lineHeight: 1.5,
          background: 'var(--cream)', color: 'var(--dark)',
          outline: 'none', boxSizing: 'border-box', resize: 'vertical',
        }}
      />

      <VoiceRecorder value={voice} onChange={setVoice} />

      {error && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginTop: 10,
        }}>{error}</div>
      )}

      <div style={{ marginTop: 12 }}>
        <Button onClick={submit} disabled={!canSubmit || saving} full>
          {saving ? 'Saving' : 'Submit answer'}
        </Button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        Their answer opens as soon as yours is in. Until then it stays sealed.
      </div>
    </div>
  );
}

// ---------- Day card ----------

function DayCard({ date, expanded, onToggle, isToday }) {
  const api = lifeosApi();
  const store = promptStore;
  const myId = api?.spaces.currentUserId();

  const prompt = api?.prompts.promptForDate(store.prompts, date);
  const status = store.statusFor(date);
  const answers = store.answersFor(date);
  const queued = store.pendingFor(date);

  const mine = answers.find(a => a.author_id === myId);
  const theirs = answers.find(a => a.author_id !== myId);
  const iAnswered = Boolean(mine) || Boolean(queued);
  const theyAnswered = Boolean(status?.theirs);
  const revealed = Boolean(mine) && Boolean(theirs);

  const heading = isToday
    ? 'Today'
    : api.time.dayHeading(date, api.prompts.getPromptZone());

  return (
    <Card
      padding="16px"
      style={{ marginBottom: 12 }}
      accent={isToday && !iAnswered ? 'var(--terracotta)' : undefined}
    >
      <button
        onClick={onToggle}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: 'inherit', color: 'inherit',
        }}
      >
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{heading}</div>
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.45, marginTop: 6 }}>
          {prompt ? prompt.text : 'Question unavailable offline'}
        </div>
      </button>

      {!expanded && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {revealed && <Badge status="done" size="sm">Open</Badge>}
          {!revealed && iAnswered && theyAnswered && <Badge status="pending" size="sm">Opening</Badge>}
          {!revealed && iAnswered && !theyAnswered && <Badge size="sm">Waiting on them</Badge>}
          {!iAnswered && theyAnswered && <Badge status="pending" size="sm">Waiting on you</Badge>}
          {!iAnswered && !theyAnswered && <Badge size="sm">Unanswered</Badge>}
        </div>
      )}

      {expanded && (
        <div>
          {queued && (
            <div style={{
              background: 'var(--sand)', padding: '10px 14px',
              borderRadius: 12, fontSize: 13, marginTop: 12, lineHeight: 1.5,
            }}>
              {queued.status === 'failed'
                ? `Your answer is saved on this device but did not send. ${queued.lastError || ''}`
                : 'Your answer is saved on this device and sending now.'}
              {queued.status === 'failed' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Button size="sm" onClick={() => api.sync.retryEntry(queued.id)}>Try again</Button>
                  <Button size="sm" variant="ghost" onClick={() => api.sync.discardEntry(queued.id)}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {mine && <AnswerBlock answer={mine} name="You" highlight />}

          {revealed && theirs && (
            <AnswerBlock answer={theirs} name="Another member" />
          )}

          {iAnswered && !revealed && (
            <div style={{
              marginTop: 10, padding: '14px',
              border: '1px dashed var(--line)', borderRadius: 14,
              fontSize: 13, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              {theyAnswered
                ? 'Both answers are in. Refreshing to open this one.'
                : 'Waiting on them. Their answer opens here when they submit.'}
            </div>
          )}

          {!iAnswered && !isToday && (
            <div style={{
              marginTop: 12, fontSize: 13,
              color: 'var(--muted)', lineHeight: 1.5,
            }}>
              {theyAnswered
                ? 'They answered this one. Answer it and theirs opens.'
                : 'Neither of you answered this one. It is not too late.'}
            </div>
          )}

          {!iAnswered && (
            <Composer promptDate={date} onSubmitted={() => promptStore.load()} />
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Screen ----------

function DailyPromptScreen({ onBack }) {
  const api = lifeosApi();
  const store = usePrompts();
  const [openDate, setOpenDate] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [online, setOnline] = useState(() => api?.net.isOnline() ?? true);

  useEffect(() => api?.net.onNetworkChange(setOnline), [api]);

  const today = store.today;

  // Today first, then every other day either of us has touched.
  const archiveDates = useMemo(() => {
    const seen = new Set();
    const dates = [];
    store.answered.forEach(a => {
      if (a.prompt_date !== today && !seen.has(a.prompt_date)) {
        seen.add(a.prompt_date);
        dates.push(a.prompt_date);
      }
    });
    return dates.sort((a, b) => (a < b ? 1 : -1));
  }, [store.answered, today, store.status]);

  const waiting = store.answered.filter(a => a.theirs && !a.mine).length;

  return (
    <ModulePage
      title="Daily prompt"
      subtitle={
        waiting > 0
          ? `${waiting} waiting on you`
          : `${archiveDates.length + (today ? 1 : 0)} days`
      }
      icon="MessageCircle"
      onBack={onBack}
    >
      {!online && (
        <div style={{
          background: 'var(--sand)', color: 'var(--dark)',
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, marginBottom: 14,
        }}>
          You are offline. Your answer is saved here and sent when you are back.
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
            Could not load the prompt
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            {store.error}
          </div>
          <Button size="sm" onClick={() => promptStore.load()}>Try again</Button>
        </Card>
      )}

      {store.status === 'loading' && store.prompts.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>Loading</div>
      )}

      {store.status === 'ready' && today && (
        <DayCard date={today} isToday expanded onToggle={() => {}} />
      )}

      {store.status === 'ready' && archiveDates.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <SectionHeader
            title="Archive"
            action={
              <button
                onClick={() => setShowArchive(v => !v)}
                style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--terracotta)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', padding: '4px 8px',
                }}
              >{showArchive ? 'Hide' : `Show ${archiveDates.length}`}</button>
            }
          />

          {showArchive && archiveDates.map(date => (
            <DayCard
              key={date}
              date={date}
              expanded={openDate === date}
              onToggle={() => setOpenDate(d => (d === date ? null : date))}
            />
          ))}
        </div>
      )}

      {store.status === 'ready' && archiveDates.length === 0 && (
        <div style={{
          fontSize: 12, color: 'var(--muted)',
          marginTop: 18, lineHeight: 1.5, textAlign: 'center',
        }}>
          Past questions collect here once one of you has answered.
        </div>
      )}
    </ModulePage>
  );
}

Object.assign(window, { DailyPromptScreen, useUnansweredToday });
