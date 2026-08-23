// space.jsx — secure couple pairing and the shared "Us" space.

const { useCallback, useEffect, useMemo, useState } = React;

const COUPLE_MOODS = [
  { id: 'bright', icon: '☀', label: 'Bright' },
  { id: 'steady', icon: '◌', label: 'Steady' },
  { id: 'soft', icon: '♡', label: 'Soft' },
  { id: 'tired', icon: '☾', label: 'Tired' },
  { id: 'stretched', icon: '≈', label: 'Stretched' },
];

const NOTE_KINDS = [
  { id: 'note', label: 'Note', icon: '✎' },
  { id: 'gratitude', label: 'Grateful', icon: '♡' },
  { id: 'celebration', label: 'Celebrate', icon: '✦' },
];

const REACTIONS = [
  { id: 'heart', icon: '♥', label: 'Love' },
  { id: 'hug', icon: '◡', label: 'Hug' },
  { id: 'smile', icon: '☺', label: 'Smile' },
  { id: 'spark', icon: '✦', label: 'Spark' },
];

const IDEA_CATEGORIES = [
  { id: 'date', icon: '♥', label: 'Date' },
  { id: 'home', icon: '⌂', label: 'At home' },
  { id: 'travel', icon: '↗', label: 'Adventure' },
  { id: 'kindness', icon: '✦', label: 'Kindness' },
];

const EMPTY_SHARED_DATA = {
  notes: [], reactions: [], checkIns: [], checkInHistory: [],
  ideas: [], promptAnswers: [], thoughts: [], dates: [],
};

function coupleApi() {
  return window.__lifeos?.couples;
}

function closenessApi() {
  return window.__lifeos?.closeness;
}

/**
 * A ticking clock, shared by the partner's local time and the thought
 * cooldown. Both are wrong the moment they stop moving, and neither is worth a
 * dependency.
 */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function memberName(snapshot, userId) {
  return snapshot?.members.find(member => member.userId === userId)?.displayName || 'Partner';
}

function currentCoupleUserId(snapshot) {
  const signedInId = coupleApi().myUserId();
  return snapshot?.members.some(member => member.userId === signedInId)
    ? signedInId
    : snapshot?.members[0]?.userId;
}

function initialFor(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function shortTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function demoDateKey(daysFromNow) {
  return closenessApi().shiftDateKey(coupleApi().localDateKey(), daysFromNow);
}

function demoCheckInHistory(today) {
  const history = [];
  for (let offset = 9; offset >= 1; offset -= 1) {
    const day = closenessApi().shiftDateKey(today, -offset);
    history.push({ couple_id: 42, user_id: 'visual-preview', checkin_date: day, mood: 'steady', energy: 4, need: '', updated_at: day });
    // One missed day, so the strip reads as a rhythm rather than a scoreboard.
    if (offset !== 4) {
      history.push({ couple_id: 42, user_id: 'partner-preview', checkin_date: day, mood: 'bright', energy: 4, need: '', updated_at: day });
    }
  }
  return history;
}

function demoCoupleState() {
  const today = coupleApi().localDateKey();
  return {
    snapshot: {
      coupleId: 42,
      name: 'Our space',
      paired: true,
      members: [
        { userId: 'visual-preview', displayName: 'You', timeZone: 'Asia/Dubai', joinedAt: new Date().toISOString() },
        { userId: 'partner-preview', displayName: 'Sam', timeZone: 'Africa/Johannesburg', joinedAt: new Date().toISOString() },
      ],
    },
    data: {
      notes: [
        { id: 2, couple_id: 42, author_id: 'partner-preview', kind: 'gratitude', body: 'Thank you for making time for us today.', created_at: new Date(Date.now() - 18 * 60_000).toISOString(), updated_at: new Date().toISOString() },
        { id: 1, couple_id: 42, author_id: 'visual-preview', kind: 'note', body: 'I found a little café for our next slow morning.', created_at: new Date(Date.now() - 80 * 60_000).toISOString(), updated_at: new Date().toISOString() },
      ],
      reactions: [{ note_id: 1, couple_id: 42, user_id: 'partner-preview', emoji: 'heart', created_at: new Date().toISOString() }],
      checkIns: [
        { couple_id: 42, user_id: 'visual-preview', checkin_date: today, mood: 'steady', energy: 4, need: 'A quiet call later', updated_at: new Date().toISOString() },
        { couple_id: 42, user_id: 'partner-preview', checkin_date: today, mood: 'bright', energy: 5, need: 'Tell me about your day', updated_at: new Date().toISOString() },
      ],
      checkInHistory: [
        ...demoCheckInHistory(today),
        { couple_id: 42, user_id: 'visual-preview', checkin_date: today, mood: 'steady', energy: 4, need: 'A quiet call later', updated_at: new Date().toISOString() },
        { couple_id: 42, user_id: 'partner-preview', checkin_date: today, mood: 'bright', energy: 5, need: 'Tell me about your day', updated_at: new Date().toISOString() },
      ],
      ideas: [
        { id: 1, couple_id: 42, added_by: 'visual-preview', title: 'Sunset walk and karak', category: 'date', status: 'picked', scheduled_for: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 2, couple_id: 42, added_by: 'partner-preview', title: 'Choose a recipe and cook together on video', category: 'home', status: 'idea', scheduled_for: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ],
      promptAnswers: [],
      thoughts: [
        { id: 3, couple_id: 42, sender_id: 'partner-preview', gesture: 'heart', created_at: new Date(Date.now() - 6 * 60_000).toISOString(), seen_at: null },
        { id: 2, couple_id: 42, sender_id: 'visual-preview', gesture: 'sun', created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(), seen_at: new Date().toISOString() },
        { id: 1, couple_id: 42, sender_id: 'partner-preview', gesture: 'moon', created_at: new Date(Date.now() - 14 * 3_600_000).toISOString(), seen_at: new Date().toISOString() },
      ],
      dates: [
        { id: 1, couple_id: 42, created_by: 'visual-preview', kind: 'reunion', label: 'Sam lands in Abu Dhabi', happens_on: demoDateKey(23), repeats_annually: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 2, couple_id: 42, created_by: 'partner-preview', kind: 'anniversary', label: 'The day we met', happens_on: '2019-11-04', repeats_annually: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { id: 3, couple_id: 42, created_by: 'visual-preview', kind: 'birthday', label: 'Sam', happens_on: '1994-04-02', repeats_annually: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      ],
    },
  };
}

function useCoupleSpace(demo = false) {
  const api = coupleApi();
  const demoState = useMemo(() => demo ? demoCoupleState() : null, [demo]);
  const [snapshot, setSnapshot] = useState(demoState?.snapshot || null);
  const [data, setData] = useState(demoState?.data || EMPTY_SHARED_DATA);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(demo ? 'live' : 'connecting');

  const reload = useCallback(async () => {
    if (demo) return;
    try {
      const nextSnapshot = await api.loadCoupleSnapshot();
      setSnapshot(nextSnapshot);
      setData(nextSnapshot ? await api.loadSharedData(nextSnapshot.coupleId) : EMPTY_SHARED_DATA);
      setError('');
    } catch (nextError) {
      setError(nextError?.message || 'Your couple space could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api, demo]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (demo || !snapshot?.coupleId) return undefined;
    setSyncStatus('connecting');
    return api.subscribeCouple(snapshot.coupleId, () => { void reload(); }, setSyncStatus);
  }, [api, demo, reload, snapshot?.coupleId]);

  return { snapshot, data, loading, error, syncStatus, reload };
}

function PairIllustration() {
  return (
    <div className="couple-pair-illustration" aria-hidden="true">
      <span className="couple-orbit couple-orbit-one" />
      <span className="couple-orbit couple-orbit-two" />
      <span className="couple-avatar couple-avatar-one">Y</span>
      <i />
      <span className="couple-avatar couple-avatar-two">T</span>
      <b>♥</b>
    </div>
  );
}

function PairSetup({ snapshot, initialCode, onChanged }) {
  const api = coupleApi();
  const [invite, setInvite] = useState(null);
  const [code, setCode] = useState(() => api.normalizePairCode(initialCode));
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!snapshot?.coupleId || snapshot.paired) return undefined;
    void api.loadActiveInvite(snapshot.coupleId).then(found => { if (active) setInvite(found); });
    return () => { active = false; };
  }, [api, snapshot?.coupleId, snapshot?.paired]);

  async function create() {
    setBusy('create');
    setMessage('');
    try {
      const next = await api.createInvite();
      setInvite(next);
      await onChanged();
      void window.__lifeos?.native.tap('light');
    } catch (error) {
      setMessage(error?.message || 'The code could not be created.');
    } finally {
      setBusy('');
    }
  }

  async function share() {
    if (!invite) return;
    const link = api.buildPairInviteLink(invite.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on Life OS', text: 'Open this private invitation to connect our Life OS apps.', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage('Copy this code and send it to your partner instead.');
    }
  }

  async function join(event) {
    event.preventDefault();
    setBusy('join');
    setMessage('');
    try {
      await api.joinCouple(code);
      await onChanged();
      void window.__lifeos?.native.notifyHaptic('success');
    } catch (error) {
      setMessage(error?.message || 'That invitation could not be accepted.');
      void window.__lifeos?.native.notifyHaptic('error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="couple-setup">
      <section className="couple-setup-hero">
        <PairIllustration />
        <p className="couple-eyebrow">A PRIVATE SPACE FOR TWO</p>
        <h1>Closer, even when life puts miles between you.</h1>
        <p>Pair two Life OS accounts for live notes, gentle check-ins, shared questions and plans made together.</p>
      </section>

      <section className="couple-privacy-strip">
        <AnimatedIcon name="LockKeyhole" size={20} />
        <span><strong>Only what you share here connects.</strong>Your personal journal, documents, AI chats and account data stay private.</span>
      </section>

      <div className="couple-setup-grid">
        <section className="couple-setup-card is-invite">
          <span className="couple-step-number">1</span>
          <p className="couple-eyebrow">INVITE YOUR PERSON</p>
          <h2>Create your private link</h2>
          <p>One link, one partner, one shared space. It expires automatically after seven days.</p>
          {invite ? (
            <div className="couple-invite-ready">
              <small>YOUR PAIRING CODE</small>
              <strong>{api.formatPairCode(invite.code)}</strong>
              <button type="button" className="couple-primary-button" onClick={share}>
                <AnimatedIcon name="Share2" size={18} /> {copied ? 'Link copied' : 'Share private link'}
              </button>
              <button type="button" className="couple-text-button" onClick={create} disabled={busy === 'create'}>Make a new code</button>
            </div>
          ) : (
            <button type="button" className="couple-primary-button" onClick={create} disabled={busy === 'create'}>
              <AnimatedIcon name="Link2" size={18} /> {busy === 'create' ? 'Creating…' : 'Create pairing link'}
            </button>
          )}
        </section>

        <section className="couple-setup-card is-join">
          <span className="couple-step-number">2</span>
          <p className="couple-eyebrow">HAVE A CODE?</p>
          <h2>Join their space</h2>
          <p>Paste the code from their link. Life OS checks that the space belongs to only the two of you.</p>
          <form onSubmit={join}>
            <label htmlFor="couple-code">12-character code</label>
            <input
              id="couple-code"
              value={api.formatPairCode(code)}
              onChange={event => setCode(api.normalizePairCode(event.target.value))}
              placeholder="ABCDEF 123456"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
            />
            <button type="submit" className="couple-secondary-button" disabled={busy === 'join' || code.length !== 12}>
              {busy === 'join' ? 'Connecting…' : 'Connect our apps'}
            </button>
          </form>
        </section>
      </div>

      {message && <div className="couple-message" role="status">{message}</div>}

      <section className="couple-feature-preview" aria-label="What pairing unlocks">
        {[
          ['MessageCircleHeart', 'Notes that arrive live', 'Leave something kind for them to find.'],
          ['HeartPulse', 'A two-minute pulse', 'Share your mood, energy and what you need.'],
          ['MessagesSquare', 'Reveal together', 'Answer the same daily question before seeing theirs.'],
          ['Sparkles', 'Adventure Jar', 'Collect dates, trips and little acts of kindness.'],
        ].map(([icon, title, copy]) => (
          <article key={title}><AnimatedIcon name={icon} size={22} /><strong>{title}</strong><span>{copy}</span></article>
        ))}
      </section>
    </div>
  );
}

/**
 * One tap, no words. This sits above the tabs rather than inside one, because
 * the impulse it serves — the one that used to reach for the call button —
 * does not arrive while you are thinking about which tab you are on.
 */
function ThoughtsBar({ snapshot, thoughts, onRefresh, demo }) {
  const api = coupleApi();
  const closeness = closenessApi();
  const now = useNow(1000);
  const me = currentCoupleUserId(snapshot);
  const partner = snapshot.members.find(member => member.userId !== me);
  const [sending, setSending] = useState('');
  const [message, setMessage] = useState('');
  const [justSent, setJustSent] = useState('');

  const mineLatest = thoughts.find(thought => thought.sender_id === me);
  const cooldown = closeness.cooldownRemaining(mineLatest?.created_at, now);
  const suggested = closeness.suggestGesture(partner?.timeZone, now);
  const unseen = thoughts.filter(thought => thought.sender_id !== me && !thought.seen_at);

  // Opening the space is the acknowledgement. Nothing on screen waits for it.
  useEffect(() => {
    if (demo || unseen.length === 0) return;
    void api.markThoughtsSeen(snapshot.coupleId);
  }, [api, demo, snapshot.coupleId, unseen.length]);

  async function send(gesture) {
    if (cooldown > 0 || sending) return;
    setMessage('');
    if (demo) {
      setJustSent(gesture);
      setMessage('Preview: they would get this on their phone');
      return;
    }
    setSending(gesture);
    try {
      await api.sendThought(snapshot.coupleId, gesture);
      setJustSent(gesture);
      await onRefresh();
    } catch (error) {
      setMessage(error?.message || 'That thought could not be sent.');
    } finally {
      setSending('');
    }
  }

  return (
    <section className="couple-thoughts" aria-label="Send a thought">
      <div className="couple-thoughts-head">
        <div>
          <p className="couple-eyebrow">NO WORDS NEEDED</p>
          <h2>Send a thought</h2>
        </div>
        {unseen.length > 0 && <span className="couple-thoughts-badge">{unseen.length} new</span>}
      </div>

      <div className="couple-thought-picker" role="group" aria-label="Thoughts you can send">
        {closeness.THOUGHT_GESTURES.map(gesture => (
          <button
            key={gesture.id}
            type="button"
            className={`couple-thought-button${gesture.id === suggested ? ' is-suggested' : ''}${justSent === gesture.id ? ' is-sent' : ''}`}
            onClick={() => send(gesture.id)}
            disabled={cooldown > 0 || Boolean(sending)}
            aria-label={gesture.label}
            title={gesture.label}
          >
            <b aria-hidden="true">{gesture.glyph}</b>
            <span>{gesture.label}</span>
          </button>
        ))}
      </div>

      <p className="couple-thought-status" role="status">
        {message
          || (cooldown > 0 ? `Another in ${cooldown}s` : 'Lands on their phone straight away.')}
      </p>

      {thoughts.length > 0 && (
        <ul className="couple-thought-feed">
          {thoughts.slice(0, 4).map(thought => {
            const isMine = thought.sender_id === me;
            const glyph = closeness.gestureById(thought.gesture)?.glyph || '♥';
            return (
              <li key={thought.id} className={isMine ? 'is-mine' : ''}>
                <b aria-hidden="true">{glyph}</b>
                <span>{closeness.describeThought(thought.gesture, memberName(snapshot, thought.sender_id), isMine)}</span>
                <time dateTime={thought.created_at}>{closeness.relativeSince(thought.created_at, now)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A fortnight of shared check-ins. Gaps are gaps, never failures. */
function PulseRhythm({ snapshot, history }) {
  const closeness = closenessApi();
  const me = currentCoupleUserId(snapshot);
  const partner = snapshot.members.find(member => member.userId !== me);
  const rhythm = closeness.buildPulseRhythm(history, me, partner?.userId, coupleApi().localDateKey());
  if (rhythm.length === 0) return null;

  return (
    <section className="couple-rhythm">
      <div className="couple-rhythm-head">
        <p className="couple-eyebrow">YOUR RHYTHM</p>
        <span>Last 14 days</span>
      </div>
      <ol className="couple-rhythm-strip">
        {rhythm.map(day => {
          const state = day.both ? 'is-both' : day.mine ? 'is-mine' : day.theirs ? 'is-theirs' : '';
          const who = day.both ? 'both of you' : day.mine ? 'you' : day.theirs ? partner?.displayName || 'them' : 'nobody';
          return (
            <li key={day.dateKey} className={state} title={`${closeness.formatDateKey(day.dateKey, false)} — ${who}`}>
              <span className="visually-hidden">{closeness.formatDateKey(day.dateKey, false)}: {who}</span>
            </li>
          );
        })}
      </ol>
      <ul className="couple-rhythm-legend" aria-hidden="true">
        <li><i className="is-mine" />You</li>
        <li><i className="is-theirs" />{partner?.displayName || 'Them'}</li>
      </ul>
      <p className="couple-rhythm-summary">{closeness.rhythmSummary(rhythm)}</p>
    </section>
  );
}

function DateRow({ resolved, onRefresh, demo }) {
  const api = coupleApi();
  const closeness = closenessApi();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const kind = closeness.dateKindById(resolved.date.kind);

  async function run(action, work) {
    if (demo) { setMessage('Preview only'); return; }
    setBusy(action);
    setMessage('');
    try {
      await work();
      await onRefresh();
    } catch (error) {
      setMessage(error?.message || 'That change could not be saved.');
    } finally {
      setBusy('');
    }
  }

  return (
    <article className={`couple-date-card${resolved.passed ? ' is-passed' : ''}`}>
      <span className="couple-date-glyph" aria-hidden="true">{kind?.glyph || '◈'}</span>
      <div className="couple-date-copy">
        <strong>{resolved.date.label}</strong>
        <small>
          {closeness.formatDateKey(resolved.occursOn)}
          {resolved.years ? ` · ${resolved.years} ${resolved.years === 1 ? 'year' : 'years'}` : ''}
          {resolved.date.repeats_annually ? ' · every year' : ''}
        </small>
        {message && <em role="status">{message}</em>}
      </div>
      <span className={`couple-date-countdown${resolved.daysAway === 0 ? ' is-today' : ''}`}>
        {closeness.countdownLabel(resolved.daysAway)}
      </span>
      <div className="couple-date-actions">
        {/* Either partner may correct a shared date, so this is an edit, not a request. */}
        <label>
          <span className="visually-hidden">Change the date for {resolved.date.label}</span>
          <input
            type="date"
            value={resolved.date.happens_on}
            disabled={busy !== ''}
            onChange={event => {
              const happensOn = event.target.value;
              if (happensOn) void run('date', () => api.updateCoupleDate(resolved.date.id, { happens_on: happensOn }));
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy !== ''}
          onClick={() => run('remove', () => api.deleteCoupleDate(resolved.date.id))}
          aria-label={`Remove ${resolved.date.label}`}
        >{busy === 'remove' ? '…' : '×'}</button>
      </div>
    </article>
  );
}

function DateComposer({ coupleId, onSaved, demo }) {
  const api = coupleApi();
  const closeness = closenessApi();
  const [kind, setKind] = useState('reunion');
  const [label, setLabel] = useState('');
  const [happensOn, setHappensOn] = useState('');
  const [repeats, setRepeats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Changing the kind picks the sensible repeat, which is still overridable.
  function chooseKind(next) {
    setKind(next);
    setRepeats(closeness.dateKindById(next)?.repeatsByDefault ?? false);
  }

  async function save(event) {
    event.preventDefault();
    if (!label.trim() || !happensOn) return;
    if (demo) { setMessage('Preview: this date would be shared with both of you'); return; }
    setSaving(true);
    setMessage('');
    try {
      await api.addCoupleDate({ coupleId, kind, label, happensOn, repeatsAnnually: repeats });
      setLabel('');
      setHappensOn('');
      await onSaved();
    } catch (error) {
      setMessage(error?.message || 'That date could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="couple-date-composer" onSubmit={save}>
      <div className="couple-date-kinds" role="group" aria-label="What kind of date">
        {closeness.COUPLE_DATE_KINDS.map(item => (
          <button key={item.id} type="button" className={kind === item.id ? 'is-active' : ''} onClick={() => chooseKind(item.id)}>
            <b aria-hidden="true">{item.glyph}</b><span>{item.label}</span>
          </button>
        ))}
      </div>
      <label className="couple-date-label">
        <span>What is it?</span>
        <input value={label} maxLength={80} onChange={event => setLabel(event.target.value)} placeholder="Sam lands in Abu Dhabi" />
      </label>
      <label className="couple-date-when">
        <span>When</span>
        <input type="date" value={happensOn} onChange={event => setHappensOn(event.target.value)} />
      </label>
      <label className="couple-date-repeat">
        <input type="checkbox" checked={repeats} onChange={event => setRepeats(event.target.checked)} />
        <span>Comes round every year</span>
      </label>
      <div className="couple-form-footer">
        <span role="status">{message}</span>
        <button type="submit" disabled={saving || !label.trim() || !happensOn}>{saving ? 'Adding…' : 'Add date'}</button>
      </div>
    </form>
  );
}

function DatesPanel({ snapshot, data, onRefresh, demo }) {
  const closeness = closenessApi();
  const resolved = closeness.resolveCoupleDates(data.dates, coupleApi().localDateKey());
  const ahead = resolved.filter(item => !item.passed);
  const behind = resolved.filter(item => item.passed);

  return (
    <div className="couple-panel-stack">
      <section className="couple-section-heading">
        <div><p className="couple-eyebrow">DATES THAT MATTER</p><h2>What you are counting towards</h2></div>
        <span>{ahead.length} ahead</span>
      </section>

      {resolved.length === 0 && (
        <section className="couple-empty">
          <b aria-hidden="true">✈</b>
          <strong>Nothing on the calendar yet</strong>
          <span>Add the next time you are in the same place. Both of you will see the countdown.</span>
        </section>
      )}

      {ahead.map(item => <DateRow key={item.date.id} resolved={item} onRefresh={onRefresh} demo={demo} />)}

      {behind.length > 0 && (
        <>
          <p className="couple-date-divider">Already happened</p>
          {behind.map(item => <DateRow key={item.date.id} resolved={item} onRefresh={onRefresh} demo={demo} />)}
        </>
      )}

      <DateComposer coupleId={snapshot.coupleId} onSaved={onRefresh} demo={demo} />
    </div>
  );
}

function CoupleHeader({ snapshot, syncStatus, dates, onCall }) {
  const closeness = closenessApi();
  const now = useNow(30_000);
  const me = currentCoupleUserId(snapshot);
  const mine = snapshot.members.find(member => member.userId === me) || snapshot.members[0];
  const partner = snapshot.members.find(member => member.userId !== mine?.userId) || snapshot.members[1];
  // Their zone has been stored on every member since pairing shipped and was
  // never shown. This screen is where you decide whether to send something, so
  // it is exactly where knowing it is 04:00 for them belongs.
  const presence = closeness.partnerPresence(partner?.timeZone, now);
  const reunion = closeness.nextReunion(dates || [], coupleApi().localDateKey());

  return (
    <section className="couple-connected-hero">
      <div className="couple-connected-copy">
        <p className="couple-eyebrow">YOUR SHARED SPACE</p>
        <h1>{mine?.displayName || 'You'} <span>♥</span> {partner?.displayName || 'Your person'}</h1>
        <p>One small place to keep choosing each other.</p>
        {presence.known && (
          <div className={`couple-presence-pill${presence.quiet ? ' is-quiet' : ''}`}>
            <b aria-hidden="true">{presence.quiet ? '☾' : '☀'}</b>
            <span>{partner?.displayName || 'They'} · {presence.clock}</span>
            <small>{presence.quiet ? 'Quiet hours there' : presence.label}</small>
          </div>
        )}
      </div>
      <div className="couple-connected-people" aria-label="Connected couple">
        <span>{initialFor(mine?.displayName)}</span><i /><span>{initialFor(partner?.displayName)}</span>
      </div>
      <div className={`couple-live-pill is-${syncStatus}`}><i />{syncStatus === 'live' ? 'Live sync' : syncStatus === 'connecting' ? 'Connecting' : 'Reconnect when online'}</div>
      {reunion && (
        <div className={`couple-reunion-pin${reunion.passed ? ' is-passed' : ''}`}>
          <b aria-hidden="true">✈</b>
          <strong>{closeness.reunionHeadline(reunion.daysAway)}</strong>
          <small>{reunion.date.label} · {closeness.formatDateKey(reunion.occursOn)}</small>
        </div>
      )}
      {/* Absent when live calling is hidden for regional compliance. */}
      {onCall && <button type="button" className="couple-call-button" onClick={onCall}><AnimatedIcon name="Phone" size={18} /> Call</button>}
    </section>
  );
}

function CheckInCard({ member, checkIn, isMine }) {
  const mood = COUPLE_MOODS.find(item => item.id === checkIn?.mood);
  return (
    <article className={`couple-checkin-card${isMine ? ' is-mine' : ''}${checkIn ? ' has-checkin' : ''}`}>
      <span className="couple-checkin-avatar">{initialFor(member.displayName)}</span>
      <div><strong>{isMine ? 'You' : member.displayName}</strong><small>{checkIn ? 'Checked in today' : 'Not checked in yet'}</small></div>
      {checkIn ? (
        <>
          <span className="couple-checkin-mood">{mood?.icon} {mood?.label}</span>
          <div className="couple-energy" aria-label={`Energy ${checkIn.energy} out of 5`}>{[1, 2, 3, 4, 5].map(level => <i key={level} className={level <= checkIn.energy ? 'is-on' : ''} />)}</div>
          {checkIn.need && <p>“{checkIn.need}”</p>}
        </>
      ) : <span className="couple-checkin-waiting">A little space is waiting.</span>}
    </article>
  );
}

function CheckInEditor({ coupleId, current, onSaved, demo }) {
  const api = coupleApi();
  const [mood, setMood] = useState(current?.mood || 'steady');
  const [energy, setEnergy] = useState(current?.energy || 3);
  const [need, setNeed] = useState(current?.need || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMood(current?.mood || 'steady');
    setEnergy(current?.energy || 3);
    setNeed(current?.need || '');
  }, [current?.mood, current?.energy, current?.need]);

  async function save(event) {
    event.preventDefault();
    if (demo) { setMessage('Preview saved'); return; }
    setSaving(true);
    setMessage('');
    try {
      await api.saveCheckIn({ coupleId, mood, energy, need });
      await onSaved();
      setMessage('Your pulse is live');
    } catch (error) {
      setMessage(error?.message || 'Your check-in could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="couple-checkin-editor" onSubmit={save}>
      <div className="couple-editor-heading"><div><small>YOUR TWO-MINUTE PULSE</small><h3>How are you arriving today?</h3></div><span>Private to the two of you</span></div>
      <div className="couple-mood-picker">
        {COUPLE_MOODS.map(item => <button key={item.id} type="button" className={mood === item.id ? 'is-active' : ''} onClick={() => setMood(item.id)}><b>{item.icon}</b><span>{item.label}</span></button>)}
      </div>
      <label className="couple-energy-input"><span>Energy today</span><input type="range" min="1" max="5" value={energy} onChange={event => setEnergy(Number(event.target.value))} /><strong>{energy}/5</strong></label>
      <label className="couple-need-input"><span>What would feel good from them? <small>Optional</small></span><input value={need} maxLength={240} onChange={event => setNeed(event.target.value)} placeholder="A call, some reassurance, help with something…" /></label>
      <div className="couple-form-footer"><span role="status">{message}</span><button type="submit" disabled={saving}>{saving ? 'Sharing…' : current ? 'Update pulse' : 'Share my pulse'}</button></div>
    </form>
  );
}

function DailyQuestion({ snapshot, answers, onSaved, demo }) {
  const api = coupleApi();
  const me = currentCoupleUserId(snapshot);
  const prompt = api.dailyPromptForDate(api.localDateKey());
  const mine = answers.find(answer => answer.user_id === me);
  const [answer, setAnswer] = useState(mine?.answer || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const bothAnswered = answers.length === 2;

  useEffect(() => { setAnswer(mine?.answer || ''); }, [mine?.answer]);

  async function save(event) {
    event.preventDefault();
    if (!answer.trim()) return;
    if (demo) { setMessage('Preview answer saved'); return; }
    setSaving(true);
    try {
      await api.savePromptAnswer(snapshot.coupleId, answer);
      await onSaved();
      setMessage('Saved. Their answer appears when both of you reply.');
    } catch (error) {
      setMessage(error?.message || 'Your answer could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="couple-question-card">
      <div className="couple-question-mark">?</div>
      <p className="couple-eyebrow">REVEAL TOGETHER · TODAY</p>
      <h2>{prompt.text}</h2>
      {bothAnswered ? (
        <div className="couple-answer-reveal">
          {snapshot.members.map(member => {
            const found = answers.find(item => item.user_id === member.userId);
            return <article key={member.userId}><span>{initialFor(member.displayName)}</span><strong>{member.userId === me ? 'You' : member.displayName}</strong><p>“{found?.answer}”</p></article>;
          })}
        </div>
      ) : (
        <form onSubmit={save}>
          <textarea value={answer} maxLength={600} onChange={event => setAnswer(event.target.value)} placeholder="Your honest answer…" />
          <div><span>{answers.length}/2 answered · Answers unlock together</span><button type="submit" disabled={saving || !answer.trim()}>{saving ? 'Saving…' : mine ? 'Update mine' : 'Lock in mine'}</button></div>
          {message && <small role="status">{message}</small>}
        </form>
      )}
    </section>
  );
}

function TodayPanel({ snapshot, data, onRefresh, demo }) {
  const me = currentCoupleUserId(snapshot);
  const myCheckIn = data.checkIns.find(item => item.user_id === me);
  return (
    <div className="couple-panel-stack">
      <section className="couple-section-heading"><div><p className="couple-eyebrow">TODAY</p><h2>Meet each other where you are</h2></div><span>{data.checkIns.length}/2 checked in</span></section>
      <div className="couple-checkin-grid">
        {snapshot.members.map(member => <CheckInCard key={member.userId} member={member} checkIn={data.checkIns.find(item => item.user_id === member.userId)} isMine={member.userId === me} />)}
      </div>
      <CheckInEditor coupleId={snapshot.coupleId} current={myCheckIn} onSaved={onRefresh} demo={demo} />
      <PulseRhythm snapshot={snapshot} history={data.checkInHistory} />
      <DailyQuestion snapshot={snapshot} answers={data.promptAnswers} onSaved={onRefresh} demo={demo} />
    </div>
  );
}

function NoteComposer({ coupleId, onSaved, demo }) {
  const api = coupleApi();
  const [kind, setKind] = useState('note');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    if (demo) { setMessage('Preview note shared'); setBody(''); return; }
    setSaving(true);
    setMessage('');
    try {
      await api.addSharedNote(coupleId, body, kind);
      setBody('');
      await onSaved();
    } catch (error) {
      setMessage(error?.message || 'Your note could not be shared.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="couple-note-composer" onSubmit={submit}>
      <div className="couple-note-kind">
        {NOTE_KINDS.map(item => <button key={item.id} type="button" className={kind === item.id ? 'is-active' : ''} onClick={() => setKind(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </div>
      <textarea value={body} maxLength={800} onChange={event => setBody(event.target.value)} placeholder={kind === 'gratitude' ? 'Something I appreciate about you…' : kind === 'celebration' ? 'A little win worth celebrating…' : 'Leave them a note…'} />
      <div><span>{message || `${body.length}/800`}</span><button type="submit" disabled={saving || !body.trim()}><AnimatedIcon name="Send" size={17} /> {saving ? 'Sharing…' : 'Share live'}</button></div>
    </form>
  );
}

function SharedNoteCard({ note, snapshot, reactions, onRefresh, demo }) {
  const api = coupleApi();
  const me = currentCoupleUserId(snapshot);
  const mine = note.author_id === me;
  const kind = NOTE_KINDS.find(item => item.id === note.kind);
  const noteReactions = reactions.filter(item => item.note_id === note.id);

  async function react(reaction) {
    if (demo) return;
    const active = noteReactions.some(item => item.user_id === me && item.emoji === reaction.id);
    await api.setReaction(snapshot.coupleId, note.id, reaction.id, !active);
    await onRefresh();
  }

  async function remove() {
    if (!mine || !window.confirm('Remove this shared note?')) return;
    await api.deleteSharedNote(note.id);
    await onRefresh();
  }

  return (
    <article className={`couple-note-card is-${note.kind}`}>
      <header><span>{initialFor(memberName(snapshot, note.author_id))}</span><div><strong>{mine ? 'You' : memberName(snapshot, note.author_id)}</strong><small>{kind?.icon} {kind?.label} · {shortTime(note.created_at)}</small></div>{mine && <button type="button" onClick={remove} aria-label="Delete note"><AnimatedIcon name="Trash2" size={15} /></button>}</header>
      <p>{note.body}</p>
      <footer>
        {REACTIONS.map(reaction => {
          const count = noteReactions.filter(item => item.emoji === reaction.id).length;
          const active = noteReactions.some(item => item.user_id === me && item.emoji === reaction.id);
          return <button key={reaction.id} type="button" className={active ? 'is-active' : ''} onClick={() => react(reaction)} aria-label={reaction.label}>{reaction.icon}{count > 0 && <span>{count}</span>}</button>;
        })}
      </footer>
    </article>
  );
}

function NotesPanel({ snapshot, data, onRefresh, demo }) {
  return (
    <div className="couple-panel-stack">
      <section className="couple-section-heading"><div><p className="couple-eyebrow">OUR NOTES</p><h2>Small messages, felt in real time</h2></div><span>{data.notes.length} shared</span></section>
      <NoteComposer coupleId={snapshot.coupleId} onSaved={onRefresh} demo={demo} />
      <div className="couple-note-feed">
        {data.notes.length === 0 ? <div className="couple-empty-state"><span>♡</span><strong>Leave the first note</strong><p>It will appear here on both devices as soon as it is sent.</p></div> : data.notes.map(note => <SharedNoteCard key={note.id} note={note} snapshot={snapshot} reactions={data.reactions} onRefresh={onRefresh} demo={demo} />)}
      </div>
    </div>
  );
}

function IdeaCard({ idea, onRefresh, demo }) {
  const api = coupleApi();
  const category = IDEA_CATEGORIES.find(item => item.id === idea.category);
  async function setStatus(status) {
    if (demo) return;
    await api.updateIdea(idea.id, { status });
    await onRefresh();
  }
  async function remove() {
    if (demo || !window.confirm('Remove this idea?')) return;
    await api.deleteIdea(idea.id);
    await onRefresh();
  }
  return (
    <article className={`couple-idea-card is-${idea.status}`}>
      <span>{category?.icon}</span><div><small>{category?.label}</small><strong>{idea.title}</strong></div>
      <div className="couple-idea-actions">
        {idea.status === 'idea' && <button type="button" onClick={() => setStatus('picked')}>Pick</button>}
        {idea.status === 'picked' && <button type="button" onClick={() => setStatus('done')}>We did it</button>}
        {idea.status === 'done' && <button type="button" onClick={() => setStatus('idea')}>Again</button>}
        <button type="button" onClick={remove} aria-label="Remove idea">×</button>
      </div>
    </article>
  );
}

function IdeasPanel({ snapshot, data, onRefresh, demo }) {
  const api = coupleApi();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('date');
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);
  const activeIdeas = data.ideas.filter(idea => idea.status === 'idea');

  async function add(event) {
    event.preventDefault();
    if (!title.trim()) return;
    if (demo) { setTitle(''); return; }
    setSaving(true);
    try {
      await api.addIdea(snapshot.coupleId, title, category);
      setTitle('');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function pickForUs() {
    if (activeIdeas.length === 0) return;
    const choice = activeIdeas[Math.floor(Math.random() * activeIdeas.length)];
    setPicked(choice);
    void window.__lifeos?.native.notifyHaptic('success');
    if (!demo) {
      await api.updateIdea(choice.id, { status: 'picked' });
      await onRefresh();
    }
  }

  return (
    <div className="couple-panel-stack">
      <section className="couple-section-heading"><div><p className="couple-eyebrow">ADVENTURE JAR</p><h2>Keep a future to look forward to</h2></div><button type="button" onClick={pickForUs} disabled={activeIdeas.length === 0}><AnimatedIcon name="Shuffle" size={17} /> Pick for us</button></section>
      {picked && <section className="couple-picked-idea"><small>THE JAR CHOSE</small><span>{IDEA_CATEGORIES.find(item => item.id === picked.category)?.icon}</span><h3>{picked.title}</h3><button type="button" onClick={() => setPicked(null)}>Keep exploring</button></section>}
      <form className="couple-idea-composer" onSubmit={add}>
        <input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="A date, tiny ritual or place to explore…" />
        <select value={category} onChange={event => setCategory(event.target.value)}>{IDEA_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <button type="submit" disabled={saving || !title.trim()}><AnimatedIcon name="Plus" size={18} /> Add</button>
      </form>
      <div className="couple-idea-board">
        {data.ideas.length === 0 ? <div className="couple-empty-state"><span>✦</span><strong>Your jar is empty</strong><p>Add something simple enough to actually happen.</p></div> : ['picked', 'idea', 'done'].map(status => {
          const items = data.ideas.filter(idea => idea.status === status);
          if (items.length === 0) return null;
          return <section key={status}><h3>{status === 'picked' ? 'Up next' : status === 'idea' ? 'In the jar' : 'Good memories'} <span>{items.length}</span></h3>{items.map(idea => <IdeaCard key={idea.id} idea={idea} onRefresh={onRefresh} demo={demo} />)}</section>;
        })}
      </div>
    </div>
  );
}

function PairedSpace({ snapshot, data, syncStatus, onRefresh, onCall, demo }) {
  const [tab, setTab] = useState('today');
  const [leaving, setLeaving] = useState(false);
  const upcomingDates = closenessApi()
    .resolveCoupleDates(data.dates, coupleApi().localDateKey())
    .filter(item => !item.passed).length;
  const tabs = [
    { id: 'today', label: 'Today', icon: 'HeartPulse' },
    { id: 'notes', label: 'Notes', icon: 'MessageCircleHeart', count: data.notes.length },
    { id: 'dates', label: 'Dates', icon: 'CalendarDays', count: upcomingDates },
    { id: 'ideas', label: 'Adventure Jar', icon: 'Sparkles', count: data.ideas.filter(idea => idea.status !== 'done').length },
  ];

  async function leave() {
    if (demo) return;
    const me = currentCoupleUserId(snapshot);
    const partner = snapshot.members.find(member => member.userId !== me);
    if (!window.confirm(`Disconnect from ${partner?.displayName || 'your partner'}? Your private account data stays yours. Shared notes remain with the person who stays in this space.`)) return;
    setLeaving(true);
    try {
      await coupleApi().leaveCouple();
      await onRefresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div className="couple-space">
      <CoupleHeader snapshot={snapshot} syncStatus={syncStatus} dates={data.dates} onCall={onCall} />
      <ThoughtsBar snapshot={snapshot} thoughts={data.thoughts} onRefresh={onRefresh} demo={demo} />
      <nav className="couple-tabs" aria-label="Couple space sections">
        {tabs.map(item => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}><AnimatedIcon name={item.icon} size={19} /><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>)}
      </nav>
      {tab === 'today' && <TodayPanel snapshot={snapshot} data={data} onRefresh={onRefresh} demo={demo} />}
      {tab === 'notes' && <NotesPanel snapshot={snapshot} data={data} onRefresh={onRefresh} demo={demo} />}
      {tab === 'dates' && <DatesPanel snapshot={snapshot} data={data} onRefresh={onRefresh} demo={demo} />}
      {tab === 'ideas' && <IdeasPanel snapshot={snapshot} data={data} onRefresh={onRefresh} demo={demo} />}
      <section className="couple-safety-footer"><AnimatedIcon name="ShieldCheck" size={18} /><span><strong>Protected for two.</strong> Every shared row is checked against your couple membership before Supabase returns it.</span><button type="button" onClick={leave} disabled={leaving}>{leaving ? 'Disconnecting…' : 'Disconnect'}</button></section>
    </div>
  );
}

function SpaceScreen({ onBack, onCall, initialCode = '', demo = false }) {
  const { snapshot, data, loading, error, syncStatus, reload } = useCoupleSpace(demo);
  return (
    <ModulePage
      title={snapshot?.paired ? 'Us' : 'Pairing'}
      subtitle={snapshot?.paired ? 'Your private space for two' : 'Connect two Life OS accounts'}
      icon="HeartHandshake"
      onBack={onBack}
    >
      {loading && <div className="couple-loading"><i /><strong>Opening your private space…</strong></div>}
      {!loading && error && <section className="couple-load-error" role="alert"><AnimatedIcon name="WifiOff" size={26} /><h2>Pairing is not ready</h2><p>{error}</p><Button onClick={reload}>Try again</Button></section>}
      {!loading && !error && snapshot?.paired && <PairedSpace snapshot={snapshot} data={data} syncStatus={syncStatus} onRefresh={reload} onCall={onCall} demo={demo} />}
      {!loading && !error && !snapshot?.paired && <PairSetup snapshot={snapshot} initialCode={initialCode} onChanged={reload} />}
    </ModulePage>
  );
}

Object.assign(window, { SpaceScreen });
