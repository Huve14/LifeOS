// screens-home.jsx — Home/Dashboard, written journal, Onboarding, AI sheet

const SolarGravityHero = React.lazy(() => import('./src/components/ui/solar-gravity-hero.tsx'));

// ---------- Helpers ----------
function daysUntil(dateStr) {
  if (!dateStr) return 0;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return 0;
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function overallProgress(state) {
  const counts = moduleProgress(state);
  const totals = Object.values(counts).reduce((a, c) => ({ done: a.done + c.done, total: a.total + c.total }), { done: 0, total: 0 });
  return totals;
}

function moduleProgress(state) {
  const pack = state.packing || { rooms: [] };
  const docs = state.documents || [];
  const tasks = state.tasks || [];
  const shop = state.shopping || [];
  const cats = state.budget?.categories || [];
  const houseRooms = state.housing?.rooms || [];
  const housePhotos = houseRooms.reduce((a, r) => a + (r.photos?.length || 0), 0);
  const packItems = pack.rooms.flatMap(r => r.items || []);
  const packDone = packItems.filter(i => i.status === 'packed').length;
  const docDone = docs.filter(d => d.status === 'done').length;
  const taskDone = tasks.filter(t => t.status === 'done').length;
  const shopDone = shop.filter(s => s.status === 'packed').length;
  const budgetSpent = cats.reduce((a, c) => a + (c.spent || 0), 0);
  const budgetTotal = cats.reduce((a, c) => a + (c.planned || 0), 0);
    const ltDone = (state.memories?.lastTimes || []).filter(m => m.done).length;
    const ltTotal = (state.memories?.lastTimes || []).length;
    const gbDone = (state.memories?.goodbyes || []).filter(g => g.done).length;
    const gbTotal = (state.memories?.goodbyes || []).length;
    const today = new Date().toISOString().slice(0, 10);
    const habitsDone = (state.habits || []).filter(h => h.lastDone === today).length;
    const habitsTotal = (state.habits || []).length;
  return {
    packing:  { done: packDone, total: Math.max(packItems.length, 1) },
    docs:     { done: docDone, total: Math.max(docs.length, 1) },
    tasks:    { done: taskDone, total: Math.max(tasks.length, 1) },
    budget:   { done: Math.max(budgetSpent, 1), total: Math.max(budgetTotal, 1), isMoney: true },
    shopping: { done: shopDone, total: Math.max(shop.length, 1) },
    housing:  { done: housePhotos, total: Math.max(houseRooms.length, 1) },
    memory:   { done: ltDone + gbDone, total: Math.max(ltTotal + gbTotal, 1) },
    people:   { done: (state.contacts || []).filter(c => c.phone || c.email).length, total: Math.max((state.contacts || []).length, 1) },
    habits:   { done: habitsDone, total: Math.max(habitsTotal, 1) },
  };
}

const MODULES = [
  { id: 'packing',  label: 'Packing',   emoji: '📦', color: 'var(--terracotta)' },
  { id: 'docs',     label: 'Documents', emoji: '📑', color: 'var(--teal)' },
  { id: 'tasks',    label: 'Timeline',  emoji: '🗓️', color: 'var(--gold)' },
  { id: 'budget',   label: 'Budget',    emoji: '💰', color: 'var(--terracotta)' },
  { id: 'shopping', label: 'To buy',    emoji: '🛍️', color: 'var(--gold)' },
  { id: 'housing',  label: 'Housing',   emoji: '🏠', color: 'var(--teal)' },
  { id: 'memory',   label: 'Memory',    emoji: '💭', color: 'var(--gold)' },
  { id: 'habits',   label: 'Habits',    emoji: '🎯', color: 'var(--teal)' },
  { id: 'people',   label: 'People',    emoji: '👥', color: 'var(--teal)' },
];

function OnboardingInfographic({ type, name }) {
  const initial = (name || 'Y').trim().charAt(0).toUpperCase();

  if (type === 'personal') {
    return (
      <div className="tour-infographic tour-infographic-personal" role="img" aria-label="Your goals, rhythm and places shaping a private personal AI companion">
        <div className="tour-orbit" aria-hidden="true">
          <span className="tour-orbit-chip tour-orbit-chip-goals">✓ Your goals</span>
          <span className="tour-orbit-chip tour-orbit-chip-rhythm">☀ Your rhythm</span>
          <span className="tour-orbit-chip tour-orbit-chip-places">⌖ Your places</span>
          <div className="tour-ai-core">
            <span>✦</span>
            <small>Your AI</small>
          </div>
        </div>
        <div className="tour-profile-strip" aria-hidden="true">
          <span className="tour-profile-avatar">{initial}</span>
          <span><strong>Made for {name || 'you'}</strong><small>Learns only what you choose to share</small></span>
          <b>🔒 Private</b>
        </div>
      </div>
    );
  }

  if (type === 'today') {
    return (
      <div className="tour-infographic tour-infographic-today" role="img" aria-label="A calm dashboard bringing today's priorities, budget, journal and next flight together">
        <div className="tour-mini-dashboard" aria-hidden="true">
          <div className="tour-mini-header">
            <span><small>GOOD MORNING</small><strong>Today at a glance</strong></span>
            <b>33° ☀</b>
          </div>
          <div className="tour-mini-grid">
            <div className="tour-mini-priority">
              <span className="tour-mini-icon">✓</span>
              <span><small>NEXT STEP</small><strong>One clear priority</strong><em>Ready when you are</em></span>
            </div>
            <div className="tour-mini-stat tour-mini-stat-budget"><span>◒</span><small>Budget</small><strong>On track</strong></div>
            <div className="tour-mini-stat tour-mini-stat-journal"><span>✎</span><small>Journal</small><strong>2 notes</strong></div>
            <div className="tour-mini-flight"><span>✈</span><span><small>NEXT FLIGHT</small><strong>All details in one place</strong></span><b>›</b></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tour-infographic tour-infographic-close" role="img" aria-label="Private calls, shared game nights and invitations keeping your chosen people close">
      <div className="tour-connection-map" aria-hidden="true">
        <div className="tour-person-node tour-person-node-you"><span>{initial}</span><strong>You</strong><small>Abu Dhabi</small></div>
        <div className="tour-connection-line"><i /><b>Connected</b><i /></div>
        <div className="tour-person-node tour-person-node-them"><span>♥</span><strong>Your people</strong><small>Wherever they are</small></div>
      </div>
      <div className="tour-connection-tools" aria-hidden="true">
        <span><b>◉</b><small>Video call</small></span>
        <span><b>♬</b><small>Audio call</small></span>
        <span><b>♠</b><small>Game night</small></span>
        <span><b>↗</b><small>Invite link</small></span>
      </div>
      <div className="tour-secure-note" aria-hidden="true"><span>✓</span> Your space, shared only with people you invite</div>
    </div>
  );
}

// ---------- Onboarding (with embedded login) ----------
function Onboarding({ onDone, initialDate, user }) {
  const [step, setStep] = React.useState(0);
  const date = initialDate;

  // Auth state
  const [authMode, setAuthMode] = React.useState('signin');
  const [authName, setAuthName] = React.useState('');
  const [authEmail, setAuthEmail] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [authAIProfile, setAuthAIProfile] = React.useState({
    home_base: '',
    priorities: '',
    interests: '',
    response_style: 'warm_practical',
    daily_rhythm: 'flexible',
    notes: '',
  });
  const [authError, setAuthError] = React.useState('');
  const [authLoading, setAuthLoading] = React.useState(false);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { signIn, signUp } = window.__suvedaAuth || {};
    if (!signIn || !signUp) { setAuthError('Auth not ready'); setAuthLoading(false); return; }
    try {
      if (authMode === 'signup') {
        const { data, error: suErr } = await signUp(
          authEmail.trim(),
          authPassword,
          authName.trim(),
          authAIProfile,
        );
        if (suErr) setAuthError(suErr.message);
        else if (!data?.session) setAuthError('Account created. Check your email to confirm it, then sign in.');
      } else {
        const { error: siErr } = await signIn(authEmail.trim(), authPassword);
        if (siErr) setAuthError(siErr.message);
      }
    } catch (err) {
      setAuthError(err?.message || 'Something went wrong');
    }
    setAuthLoading(false);
  }

  function updateAuthAIProfile(field, value) {
    setAuthAIProfile(current => ({ ...current, [field]: value }));
  }

  const userName = user?.user_metadata?.display_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'there';
  const firstName = userName.trim().split(/\s+/)[0];
  const steps = [
    {
      visual: 'personal',
      eyebrow: 'YOUR PERSONAL AI',
      title: `Hi ${firstName}, meet your Life OS assistant`,
      body: 'Your goals, routines and favourite places shape practical AI suggestions that feel like yours. You decide what it remembers, and you can change it anytime.',
      cta: 'Show me around',
    },
    {
      visual: 'today',
      eyebrow: 'ONE CALM VIEW',
      title: 'See today clearly',
      body: 'Your next step, budget, journal, documents and next flight come together on Home—so you can spend less time searching and more time living.',
      cta: 'One more thing',
    },
    {
      visual: 'close',
      eyebrow: 'CLOSER, FROM ANYWHERE',
      title: 'Keep your people close',
      body: 'Start private audio or video calls, invite the people you choose, and make time for a nostalgic game night—all from one shared place.',
      cta: 'Open my home',
    },
  ];

  const s = steps[Math.min(step, steps.length - 1)];

  return (
    <div className={`onboarding-screen fade-in${!user ? ' onboarding-auth-screen' : ' onboarding-tour-screen'}`} style={{
      background: 'linear-gradient(180deg, var(--cream) 0%, var(--sand) 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* progress dots */}
      {user && (
        <div className="onboarding-progress" role="progressbar" aria-label={`Introduction step ${step + 1} of ${steps.length}`} aria-valuemin="1" aria-valuemax={steps.length} aria-valuenow={step + 1}>
          {steps.map((_, i) => (
            <span key={i} className={i === step ? 'is-current' : i < step ? 'is-complete' : ''} />
          ))}
        </div>
      )}

      <div className={`onboarding-content${!user ? ' onboarding-auth-content' : ' onboarding-tour-content'}`} style={{ display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
        <div className="onboarding-visual pop-in" key={user ? step : 'auth'}>
          {!user
            ? <div className="onboarding-visual-scale" aria-hidden="true"><SpinningGlobe /></div>
            : <OnboardingInfographic type={s.visual} name={firstName} />}
        </div>

        {step === 0 && !user ? (
          <>
            <div className="onboarding-auth-intro">
              <div className="onboarding-auth-eyebrow">Life OS</div>
              <h1>Welcome</h1>
              <p>
                Your everyday companion for life in Abu Dhabi. Sign in to continue or register your private account.
              </p>
            </div>
            {/* Auth form card */}
            <div className={`onboarding-auth-card${authMode === 'signup' ? ' is-registering' : ''}`} style={{
              background: 'var(--white)', borderRadius: 20, padding: '22px 20px',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)',
              maxWidth: authMode === 'signup' ? 560 : 420, width: '100%', margin: '0 auto',
            }}>
              <div className="onboarding-auth-tabs" role="tablist" aria-label="Account access">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signin'}
                  className={authMode === 'signin' ? 'is-active' : ''}
                  onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signup'}
                  className={authMode === 'signup' ? 'is-active' : ''}
                  onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                >
                  Register
                </button>
              </div>
              <div className="onboarding-auth-heading">
                <h2>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
                <p>{authMode === 'signup' ? 'Your private Life OS space starts here.' : 'Enter your details to open your Life OS.'}</p>
              </div>
              <form onSubmit={handleAuth}>
                {authMode === 'signup' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Name</label>
                    <input
                      type="text" value={authName} onChange={e => setAuthName(e.target.value)}
                      placeholder="Your name" required autoComplete="name"
                      style={{
                        width: '100%', padding: '12px 14px',
                        border: '1px solid var(--line)', borderRadius: 12,
                        fontSize: 15, fontFamily: 'inherit',
                        background: 'var(--cream)', color: 'var(--dark)', outline: 'none',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
                      onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
                    />
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Email</label>
                  <input
                    type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email"
                    style={{
                      width: '100%', padding: '12px 14px',
                      border: '1px solid var(--line)', borderRadius: 12,
                      fontSize: 15, fontFamily: 'inherit',
                      background: 'var(--cream)', color: 'var(--dark)', outline: 'none',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Password</label>
                  <input
                    type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••" required minLength={6}
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    style={{
                      width: '100%', padding: '12px 14px',
                      border: '1px solid var(--line)', borderRadius: 12,
                      fontSize: 15, fontFamily: 'inherit',
                      background: 'var(--cream)', color: 'var(--dark)', outline: 'none',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--terracotta)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
                  />
                </div>

                {authMode === 'signup' && (
                  <section className="auth-ai-profile" aria-labelledby="auth-ai-profile-title">
                    <div className="auth-ai-profile-heading">
                      <span aria-hidden="true">◎</span>
                      <div>
                        <h3 id="auth-ai-profile-title">Personalise your AI</h3>
                        <p>Optional details help your private assistant give more useful answers. You can change them later.</p>
                      </div>
                    </div>

                    <div className="auth-ai-profile-grid">
                      <label className="auth-profile-field">
                        <span>Home base</span>
                        <input
                          value={authAIProfile.home_base}
                          onChange={event => updateAuthAIProfile('home_base', event.target.value)}
                          placeholder="e.g. Abu Dhabi"
                          maxLength={120}
                          autoComplete="address-level2"
                        />
                      </label>
                      <label className="auth-profile-field">
                        <span>Daily rhythm</span>
                        <select
                          value={authAIProfile.daily_rhythm}
                          onChange={event => updateAuthAIProfile('daily_rhythm', event.target.value)}
                        >
                          <option value="early_bird">Early bird</option>
                          <option value="flexible">Flexible</option>
                          <option value="night_owl">Night owl</option>
                        </select>
                      </label>
                    </div>

                    <label className="auth-profile-field">
                      <span>What matters most right now?</span>
                      <textarea
                        value={authAIProfile.priorities}
                        onChange={event => updateAuthAIProfile('priorities', event.target.value)}
                        placeholder="Goals, responsibilities, or things you want help organising"
                        maxLength={500}
                        rows={2}
                      />
                    </label>

                    <label className="auth-profile-field">
                      <span>Interests and favourite things</span>
                      <input
                        value={authAIProfile.interests}
                        onChange={event => updateAuthAIProfile('interests', event.target.value)}
                        placeholder="e.g. food, fitness, books, travel"
                        maxLength={500}
                      />
                    </label>

                    <label className="auth-profile-field">
                      <span>Preferred guidance style</span>
                      <select
                        value={authAIProfile.response_style}
                        onChange={event => updateAuthAIProfile('response_style', event.target.value)}
                      >
                        <option value="warm_practical">Warm and practical</option>
                        <option value="direct">Direct and action-focused</option>
                        <option value="concise">Brief and concise</option>
                        <option value="detailed">Detailed with explanations</option>
                      </select>
                    </label>

                    <label className="auth-profile-field">
                      <span>Anything else Life OS should remember?</span>
                      <textarea
                        value={authAIProfile.notes}
                        onChange={event => updateAuthAIProfile('notes', event.target.value)}
                        placeholder="Preferences, routines, accessibility needs, or useful context"
                        maxLength={700}
                        rows={2}
                      />
                    </label>
                  </section>
                )}

                {authError && (
                  <div role="status" aria-live="polite" style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
                    {authError}
                  </div>
                )}

                <button
                  type="submit" disabled={authLoading}
                  style={{
                    width: '100%', padding: '14px',
                    borderRadius: 14, border: 'none',
                    background: authLoading ? '#aaa' : 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
                    color: '#17272D', fontSize: 16, fontWeight: 700,
                    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', cursor: authLoading ? 'not-allowed' : 'pointer',
                    opacity: authLoading ? 0.7 : 1,
                    boxShadow: '0 4px 14px -4px rgba(45, 114, 139, 0.4)',
                  }}
                >
                  {authLoading ? 'Processing…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>

              </form>
              <p className="onboarding-auth-privacy">🔒 Your account data is private and isolated from other users.</p>
            </div>
          </>
        ) : (
          <div className="onboarding-tour-copy">
            <div className="onboarding-tour-eyebrow">{s.eyebrow}</div>
            <h1>{s.title}</h1>
            <p>{s.body}</p>
          </div>
        )}
      </div>

      {user && (
        <div className="onboarding-actions">
          <Button
            variant="primary" size="lg" full
            onClick={() => {
              if (step < steps.length - 1) setStep(step + 1);
              else onDone({ moveDate: date });
            }}
          >
            {s.cta} <span aria-hidden="true">→</span>
          </Button>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="onboarding-back-button"
            >
              ← back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Countdown ----------
function ModuleCard({ module, progress, onClick, progressStyle, layout }) {
  const { done, total, isMoney } = progress;
  const pct = total > 0 ? Math.round((done/total) * 100) : 0;
  const isDone = pct === 100 && total > 0;

  if (layout === 'cards') {
    // Big tappable cards, 2-column
    return (
      <Card onClick={onClick} padding="16px" style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--sand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{module.emoji}</div>
          {isDone && <span style={{ fontSize: 16 }}>🎉</span>}
        </div>
        <div>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 15, fontWeight: 700 }}>{module.label}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {isMoney
              ? `${done.toLocaleString()} / ${total.toLocaleString()} AED`
              : `${done} of ${total}`}
          </div>
        </div>
        <ProgressBar value={done} total={total || 1} style={progressStyle} color={module.color} height={6} />
      </Card>
    );
  }

  if (layout === 'timeline') {
    // Horizontal row
    return (
      <Card onClick={onClick} padding="14px 16px" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: 'var(--sand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          flexShrink: 0,
        }}>{module.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 15, fontWeight: 700 }}>{module.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              {isMoney ? `${pct}%` : `${done}/${total}`}
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <ProgressBar value={done} total={total || 1} style="bar" color={module.color} height={6} />
          </div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 18 }}>›</div>
      </Card>
    );
  }

  // Default classic — list-y
  return (
    <Card onClick={onClick} padding="18px 18px" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        background: isDone ? 'var(--teal)' : 'var(--sand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, flexShrink: 0,
        filter: isDone ? 'grayscale(0)' : 'none',
      }}>{isDone ? '✅' : module.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: 16, fontWeight: 700 }}>{module.label}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{pct}%</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 10 }}>
          {isMoney
            ? `${done.toLocaleString()} of ${total.toLocaleString()} AED spent`
            : `${done} of ${total} ${total === 1 ? 'item' : 'items'}`}
        </div>
        <ProgressBar value={done} total={total || 1} style={progressStyle} color={module.color} height={6} />
      </div>
    </Card>
  );
}

// ---------- Written Journal ----------
const JOURNAL_MOODS = ['😔', '🙁', '😐', '🙂', '😊'];
const JOURNAL_ITEM_HEIGHT = 52;
const JOURNAL_CHARACTER_ANIMATION_LIMIT = 360;

function journalDateParts(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  return {
    day: Number.isNaN(date.getTime()) ? '--' : String(date.getDate()).padStart(2, '0'),
    month: Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { month: 'long' }),
    year: Number.isNaN(date.getTime()) ? '' : date.getFullYear(),
    weekday: Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { weekday: 'long' }),
  };
}

function JournalAnimatedText({ text, direction, reducedMotion }) {
  let globalIndex = 0;
  const paragraphs = text.split(/\n+/).map(value => value.trim()).filter(Boolean);

  if (reducedMotion) {
    return <div className="journal-entry-copy">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
  }

  return (
    <div className="journal-entry-copy">
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>
          {paragraph.split(/(\s+)/).map((segment, segmentIndex) => {
            if (/\s+/.test(segment)) return <span key={segmentIndex} className="journal-space">{segment}</span>;
            if (globalIndex >= JOURNAL_CHARACTER_ANIMATION_LIMIT) {
              globalIndex += Array.from(segment).length;
              return <span key={segmentIndex} className="journal-word">{segment}</span>;
            }
            return (
              <span key={segmentIndex} className="journal-word">
                {Array.from(segment).map((character, characterIndex) => {
                  const delay = Math.min(globalIndex++ * 0.008, 0.36);
                  if (globalIndex > JOURNAL_CHARACTER_ANIMATION_LIMIT) return character;
                  return (
                    <span
                      key={`${segmentIndex}-${characterIndex}`}
                      className={`journal-character${direction < 0 ? ' is-reverse' : ''}`}
                      style={{ '--journal-delay': `${delay}s` }}
                    >
                      {character}
                    </span>
                  );
                })}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function JournalNavigation({ entries, currentIndex, onChange, onEdit, onDelete }) {
  const [direction, setDirection] = React.useState(0);
  const dragStartY = React.useRef(null);
  const reducedMotion = window.__lifeos?.performance.shouldUseLiteVisuals()
    || document.querySelector('.app')?.dataset.motion === 'reduced';
  const currentEntry = entries[currentIndex];
  const parts = currentEntry ? journalDateParts(currentEntry.date) : null;

  function move(nextIndex) {
    if (nextIndex < 0 || nextIndex >= entries.length || nextIndex === currentIndex) return;
    setDirection(nextIndex > currentIndex ? 1 : -1);
    onChange(nextIndex);
    void window.__lifeos?.native.tap('light');
  }

  function finishDrag(event) {
    if (dragStartY.current == null) return;
    const offset = event.clientY - dragStartY.current;
    dragStartY.current = null;
    if (Math.abs(offset) < 18) return;
    const steps = Math.max(1, Math.round(Math.abs(offset) / JOURNAL_ITEM_HEIGHT));
    move(currentIndex + (offset < 0 ? steps : -steps));
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(currentIndex - 1);
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(currentIndex + 1);
    }
  }

  if (!currentEntry) {
    return (
      <div className="journal-navigation-card is-empty">
        <div className="journal-empty-mark" aria-hidden="true">✦</div>
        <h2>Your journal starts here</h2>
        <p>Capture one thought, moment, or feeling from today.</p>
      </div>
    );
  }

  return (
    <div className="journal-navigation-card" tabIndex="0" onKeyDown={handleKeyDown} aria-label="Journal entry navigation">
      <aside
        className="journal-date-rail"
        aria-label="Journal dates"
        onPointerDown={event => {
          dragStartY.current = event.clientY;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => { dragStartY.current = null; }}
      >
        <div className="journal-rail-fade is-top" />
        <div className="journal-rail-track-anchor">
          <div
            className="journal-date-track"
            style={{ transform: `translateY(${-currentIndex * JOURNAL_ITEM_HEIGHT}px)` }}
          >
            {entries.map((entry, index) => {
              const active = index === currentIndex;
              const entryDate = journalDateParts(entry.date);
              return (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => move(index)}
                  aria-label={`Open ${entryDate.month} ${entryDate.day}`}
                  aria-current={active ? 'date' : undefined}
                  className={active ? 'is-active' : ''}
                >
                  {entryDate.day}
                </button>
              );
            })}
          </div>
        </div>
        <div className="journal-rail-fade is-bottom" />
      </aside>

      <section className="journal-entry-panel">
        <header className="journal-entry-header">
          <div className="journal-entry-date" aria-label={`${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year}`}>
            <span key={`${parts.month}-${parts.day}-${parts.year}`} className={reducedMotion ? '' : 'journal-entry-fade-in'}>
              {parts.month} {parts.day}<small>{parts.year}</small>
            </span>
          </div>
          <div className="journal-entry-navigation">
            <button type="button" onClick={() => move(currentIndex - 1)} disabled={currentIndex === 0} aria-label="Previous journal entry">
              <AnimatedIcon name="ChevronLeft" size={19} />
            </button>
            <button type="button" onClick={() => move(currentIndex + 1)} disabled={currentIndex === entries.length - 1} aria-label="Next journal entry">
              <AnimatedIcon name="ChevronRight" size={19} />
            </button>
          </div>
        </header>

        <div className="journal-entry-body">
          <div className={`journal-entry-motion${reducedMotion ? '' : ' journal-entry-fade-in'}`} key={currentEntry.id}>
            <JournalAnimatedText text={currentEntry.text} direction={direction} reducedMotion={reducedMotion} />
          </div>
        </div>

        <footer className="journal-entry-footer">
          <span className="journal-entry-mood" title="Mood for this entry">{JOURNAL_MOODS[currentEntry.mood - 1]}</span>
          <span>{parts.weekday}</span>
          <div>
            <button type="button" onClick={() => onEdit(currentEntry)}><AnimatedIcon name="Pencil" size={15} /> Edit</button>
            <button type="button" className="is-delete" onClick={() => onDelete(currentEntry)} aria-label="Delete this journal entry"><AnimatedIcon name="Trash2" size={15} /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function journalFlightLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function JournalNextFlightCard({ flight, now, onEdit }) {
  if (!flight) {
    return (
      <button type="button" className="journal-flight-card is-empty" onClick={onEdit}>
        <span className="journal-flight-icon"><AnimatedIcon name="PlaneTakeoff" size={28} /></span>
        <span className="journal-flight-empty-copy">
          <span>TRAVEL NOTE</span>
          <strong>Set my next flight</strong>
          <small>Keep the route, departure time and countdown close to your journal.</small>
        </span>
        <span className="journal-flight-add" aria-hidden="true">＋</span>
      </button>
    );
  }

  const departure = new Date(flight.departureAt);
  const countdown = window.__lifeos.journal.formatFlightCountdown(flight, now);
  const departureLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(departure);

  return (
    <section className={`journal-flight-card${countdown === 'Departed' ? ' is-past' : ''}`} aria-label="My next flight">
      <div className="journal-flight-icon"><AnimatedIcon name="PlaneTakeoff" size={28} /></div>
      <div className="journal-flight-route">
        <span>MY NEXT FLIGHT</span>
        <h2><b>{flight.from}</b><i aria-hidden="true">→</i><b>{flight.to}</b></h2>
        <p><AnimatedIcon name="CalendarClock" size={14} /> {departureLabel}</p>
      </div>
      <div className="journal-flight-details">
        {flight.flightNumber && <span><small>Flight</small><strong>{flight.flightNumber}</strong></span>}
        {flight.terminal && <span><small>Terminal / gate</small><strong>{flight.terminal}</strong></span>}
      </div>
      <div className="journal-flight-actions">
        <strong>{countdown}</strong>
        <button type="button" onClick={onEdit}><AnimatedIcon name="Pencil" size={14} /> Edit</button>
      </div>
    </section>
  );
}

function NotesJournalScreen({ state, setState, onBack }) {
  const api = window.__lifeos;
  const entries = React.useMemo(() => api.journal.prepareJournalEntries(state.journal), [api, state.journal]);
  const flight = React.useMemo(() => api.journal.prepareNextFlight(state.nextFlight), [api, state.nextFlight]);
  const [currentId, setCurrentId] = React.useState(() => entries.at(-1)?.id || null);
  const [editor, setEditor] = React.useState(null);
  const [flightEditor, setFlightEditor] = React.useState(null);
  const [flightNow, setFlightNow] = React.useState(() => new Date());
  const currentIndex = Math.max(0, entries.findIndex(entry => entry.id === currentId));

  React.useEffect(() => {
    if (entries.length === 0) {
      setCurrentId(null);
      return;
    }
    if (!entries.some(entry => entry.id === currentId)) setCurrentId(entries.at(-1).id);
  }, [currentId, entries]);

  React.useEffect(() => {
    if (!flight) return undefined;
    setFlightNow(new Date());
    const timer = window.setInterval(() => setFlightNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [flight?.departureAt]);

  function openNewEntry() {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    setEditor({ id: uid(), date: localDate, text: '', mood: 3, isNew: true });
  }

  function saveEntry(event) {
    event.preventDefault();
    if (!editor?.text.trim()) return;
    const savedId = editor.id;
    setState(current => ({
      ...current,
      journal: api.journal.saveJournalEntry(current.journal, {
        id: savedId,
        date: editor.date,
        text: editor.text,
        mood: editor.mood,
      }),
    }));
    setCurrentId(savedId);
    setEditor(null);
    void api.native.notifyHaptic('success');
  }

  function deleteEntry(entry) {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
    setState(current => ({ ...current, journal: api.journal.removeJournalEntry(current.journal, entry.id) }));
    void api.native.tap('light');
  }

  function openFlightEditor() {
    setFlightEditor(flight ? {
      ...flight,
      departureAt: journalFlightLocalValue(flight.departureAt),
    } : {
      from: '', to: '', departureAt: '', flightNumber: '', terminal: '',
    });
  }

  function saveFlight(event) {
    event.preventDefault();
    if (!flightEditor?.from.trim() || !flightEditor?.to.trim() || !flightEditor?.departureAt) return;
    const departure = new Date(flightEditor.departureAt);
    if (Number.isNaN(departure.getTime())) return;
    const saved = api.journal.saveNextFlight({
      ...flightEditor,
      departureAt: departure.toISOString(),
    });
    if (!saved) return;
    setState(current => ({ ...current, nextFlight: saved }));
    setFlightNow(new Date());
    setFlightEditor(null);
    void api.native.notifyHaptic('success');
  }

  function removeFlight() {
    if (!window.confirm('Remove this flight from your journal?')) return;
    setState(current => ({ ...current, nextFlight: null }));
    setFlightEditor(null);
    void api.native.tap('light');
  }

  return (
    <ModulePage
      title="Journal"
      subtitle={entries.length === 0 ? 'A private place for everyday thoughts' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · private to your account`}
      icon="NotebookPen"
      onBack={onBack}
      action={<Button size="sm" onClick={openNewEntry} icon="＋">New entry</Button>}
    >
      <JournalNextFlightCard flight={flight} now={flightNow} onEdit={openFlightEditor} />

      <div className="journal-screen-shell">
        <JournalNavigation
          entries={entries}
          currentIndex={currentIndex}
          onChange={index => setCurrentId(entries[index]?.id || null)}
          onEdit={entry => setEditor({ ...entry, isNew: false })}
          onDelete={deleteEntry}
        />
        <p className="journal-privacy-note"><AnimatedIcon name="LockKeyhole" size={14} /> Your flight and written entries are private to your account.</p>
      </div>

      <Modal open={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.isNew ? 'New journal entry' : 'Edit journal entry'}>
        {editor && (
          <form className="journal-editor" onSubmit={saveEntry}>
            <label htmlFor="journal-entry-date">Date</label>
            <input
              id="journal-entry-date"
              type="date"
              value={editor.date}
              onChange={event => setEditor(current => ({ ...current, date: event.target.value }))}
              required
            />
            <fieldset>
              <legend>How did it feel?</legend>
              <div className="journal-mood-picker">
                {JOURNAL_MOODS.map((emoji, index) => (
                  <button
                    key={emoji}
                    type="button"
                    className={editor.mood === index + 1 ? 'is-active' : ''}
                    onClick={() => setEditor(current => ({ ...current, mood: index + 1 }))}
                    aria-label={`Mood ${index + 1} of 5`}
                    aria-pressed={editor.mood === index + 1}
                  >{emoji}</button>
                ))}
              </div>
            </fieldset>
            <label htmlFor="journal-entry-text">Your entry</label>
            <textarea
              id="journal-entry-text"
              value={editor.text}
              onChange={event => setEditor(current => ({ ...current, text: event.target.value }))}
              placeholder="What do you want to remember about today?"
              maxLength="4000"
              autoFocus
              required
            />
            <div className="journal-editor-count">{editor.text.length.toLocaleString()} / 4,000</div>
            <div className="journal-editor-actions">
              <Button variant="ghost" onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" disabled={!editor.text.trim()}>Save entry</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(flightEditor)} onClose={() => setFlightEditor(null)} title={flight ? 'Edit my next flight' : 'Set my next flight'}>
        {flightEditor && (
          <form className="journal-flight-editor" onSubmit={saveFlight}>
            <div className="journal-flight-editor-intro">
              <span><AnimatedIcon name="PlaneTakeoff" size={24} /></span>
              <div><strong>Keep the important bit close</strong><small>The countdown updates automatically in your local time.</small></div>
            </div>
            <div className="journal-flight-editor-grid">
              <label><span>From</span><input value={flightEditor.from} onChange={event => setFlightEditor(current => ({ ...current, from: event.target.value }))} placeholder="AUH or Abu Dhabi" maxLength="80" autoFocus required /></label>
              <label><span>To</span><input value={flightEditor.to} onChange={event => setFlightEditor(current => ({ ...current, to: event.target.value }))} placeholder="CPT or Cape Town" maxLength="80" required /></label>
              <label className="is-wide"><span>Departure date & time</span><input type="datetime-local" value={flightEditor.departureAt} onInput={event => setFlightEditor(current => ({ ...current, departureAt: event.target.value }))} onChange={event => setFlightEditor(current => ({ ...current, departureAt: event.target.value }))} required /></label>
              <label><span>Flight number <small>optional</small></span><input value={flightEditor.flightNumber || ''} onChange={event => setFlightEditor(current => ({ ...current, flightNumber: event.target.value }))} placeholder="EY 123" maxLength="24" /></label>
              <label><span>Terminal or gate <small>optional</small></span><input value={flightEditor.terminal || ''} onChange={event => setFlightEditor(current => ({ ...current, terminal: event.target.value }))} placeholder="Terminal A · Gate 12" maxLength="40" /></label>
            </div>
            <p className="journal-flight-editor-note"><AnimatedIcon name="LockKeyhole" size={13} /> Saved privately with your Life OS journal.</p>
            <div className="journal-flight-editor-actions">
              {flight && <Button variant="ghost" onClick={removeFlight}>Remove flight</Button>}
              <Button type="submit" disabled={!flightEditor.from.trim() || !flightEditor.to.trim() || !flightEditor.departureAt}>Save flight</Button>
            </div>
          </form>
        )}
      </Modal>
    </ModulePage>
  );
}

// ---------- Journey home ----------
function HomeSectionHeader({ eyebrow, title, action }) {
  return (
    <div className="home-section-header">
      <div>
        {eyebrow && <div className="home-section-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function HomeProgress({ value, total, color = 'var(--gold)' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="home-progress" aria-label={`${pct}% complete`}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function JourneyHero({ model, onOpen, style, liteVisuals = false }) {
  const { journey, dailyModeCopy, setupDone, setupTotal, priorities } = model;
  const pct = setupTotal > 0 ? Math.round((setupDone / setupTotal) * 100) : 0;
  const next = priorities[0];
  const night = window.__lifeos.daylight.isNightInAbuDhabi();

  return (
    <section className="home-journey-hero" style={style}>
      {liteVisuals ? (
        <div className={`home-solar-scene home-solar-scene-lite${night ? ' is-night' : ''}`} data-celestial={night ? 'moon' : 'sun'} aria-hidden="true">
          <div className="home-solar-fallback" />
        </div>
      ) : (
        <React.Suspense fallback={<div className={`home-solar-scene home-solar-scene-loading${night ? ' is-night' : ''}`} aria-hidden="true" />}>
          <SolarGravityHero />
        </React.Suspense>
      )}
      <div className="home-hero-content">
        <div className="home-hero-eyebrow">{journey.eyebrow}</div>
        <div className="home-hero-time">{journey.timeLabel}</div>
        <h2>{journey.title}</h2>
        <p>{dailyModeCopy?.heroLine || journey.description}</p>
        <button className="home-hero-action" onClick={() => onOpen(next?.module || 'tasks')}>
          {next ? (dailyModeCopy?.cta || 'Start with what matters') : 'Open your plan'}
          <span aria-hidden="true">→</span>
        </button>
        <div className="home-hero-progress-row">
          <div>
            <span>Life admin</span>
            <strong>{setupTotal > 0 ? `${setupDone}/${setupTotal}` : 'Ready to begin'}</strong>
          </div>
          <div className="home-hero-progress-track">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DailyModeSelector({ value, onChange, style }) {
  const modes = window.__lifeos.home.DAILY_MODES;
  const active = modes.find(mode => mode.id === value) || modes[0];

  return (
    <section className="home-mode-card" aria-label="Choose how today should feel" style={style}>
      <div className="home-mode-intro">
        <span className="home-mode-kicker">TODAY'S PACE</span>
        <strong>How should today feel?</strong>
        <small>{active.description}</small>
      </div>
      <div className="home-mode-options">
        {modes.map(mode => (
          <button
            key={mode.id}
            className={mode.id === value ? 'is-active' : ''}
            onClick={() => onChange(mode.id)}
            aria-pressed={mode.id === value}
          >
            <span>{mode.emoji}</span>
            <span><strong>{mode.label}</strong><small>{mode.shortLabel}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PriorityRow({ action, onOpen, onComplete }) {
  return (
    <div className="home-priority-row">
      {action.toggleable ? (
        <button
          className="home-priority-check"
          onClick={() => onComplete(action)}
          aria-label={`Mark ${action.title} complete`}
          title="Mark complete"
        >
          <span />
        </button>
      ) : (
        <div className="home-priority-link-dot" aria-hidden="true">→</div>
      )}
      <button className="home-priority-copy" onClick={() => onOpen(action.module)}>
        <span className="home-priority-emoji" aria-hidden="true">{action.emoji}</span>
        <span className="home-priority-text">
          <span className="home-priority-eyebrow">{action.eyebrow}</span>
          <strong>{action.title}</strong>
          <small>{action.detail}</small>
        </span>
        <span className="home-priority-arrow" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

function LifeGlance({ glance, money, onOpen }) {
  const scoreLabel = glance.score >= 80
    ? 'In a strong rhythm'
    : glance.score >= 55
      ? 'Momentum is building'
      : glance.score > 0
        ? 'A few gentle wins away'
        : 'A fresh place to begin';
  const taskSignal = glance.overdue > 0
    ? `${glance.overdue} ${glance.overdue === 1 ? 'item needs' : 'items need'} attention`
    : glance.dueToday > 0
      ? `${glance.dueToday} ${glance.dueToday === 1 ? 'task' : 'tasks'} planned today`
      : glance.openTasks > 0
        ? `${glance.openTasks} open ${glance.openTasks === 1 ? 'task' : 'tasks'}`
        : 'Your calendar is clear';
  const remaining = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Math.abs(money.remaining));
  const moneyTitle = money.income > 0
    ? `${remaining} ${money.currency} ${money.remaining >= 0 ? 'left' : 'over'}`
    : 'Build your monthly plan';
  const moneyDetail = money.income > 0
    ? `${money.spentPercent}% of monthly income used`
    : 'Add income and everyday costs';
  const documentDetail = glance.documentsTotal > 0
    ? `${glance.documentsTotal - glance.documentsPending}/${glance.documentsTotal} safely organised`
    : 'Add the documents you reach for';
  const habitDetail = glance.habitsTotal > 0
    ? `${glance.habitsDone}/${glance.habitsTotal} checked in today`
    : 'Create one gentle daily anchor';

  return (
    <div className="home-glance-board">
      <button type="button" className="home-glance-lead" onClick={() => onOpen('tasks')}>
        <div className="home-glance-ring" style={{ '--glance-progress': `${glance.score}%` }}>
          <span><strong>{glance.score}%</strong><small>in rhythm</small></span>
        </div>
        <div className="home-glance-lead-copy">
          <span className="home-glance-kicker">YOUR MOMENTUM</span>
          <strong>{scoreLabel}</strong>
          <p>{taskSignal}. This reflects your tasks, documents and daily routines—not a judgement, just a useful pulse.</p>
          <span className="home-glance-link">Review your day <i aria-hidden="true">→</i></span>
        </div>
      </button>

      <div className="home-glance-grid">
        <button type="button" className={`home-glance-card home-glance-calendar${glance.overdue > 0 ? ' needs-attention' : ''}`} onClick={() => onOpen('tasks')}>
          <span className="home-glance-card-top"><i aria-hidden="true">◷</i><small>UP NEXT</small><b>{glance.overdue > 0 ? 'Attention' : glance.nextTaskTiming}</b></span>
          <strong>{glance.nextTaskTitle}</strong>
          <span>{glance.nextTaskTiming}</span>
        </button>

        <button type="button" className={`home-glance-card home-glance-money${money.remaining < 0 ? ' needs-attention' : ''}`} onClick={() => onOpen('budget')}>
          <span className="home-glance-card-top"><i aria-hidden="true">◒</i><small>MONTHLY MONEY</small><b>{money.income > 0 ? `${money.spentPercent}% used` : 'Set up'}</b></span>
          <strong>{moneyTitle}</strong>
          <span>{moneyDetail}</span>
          {money.income > 0 && <HomeProgress value={money.spent} total={money.income} color="var(--terracotta)" />}
        </button>

        <button type="button" className="home-glance-card home-glance-habits" onClick={() => onOpen('habits')}>
          <span className="home-glance-card-top"><i aria-hidden="true">✓</i><small>DAILY RHYTHM</small><b>{glance.habitsDone}/{glance.habitsTotal}</b></span>
          <strong>{glance.habitsDone === glance.habitsTotal && glance.habitsTotal > 0 ? 'Today is complete' : 'Keep the basics kind'}</strong>
          <span>{habitDetail}</span>
        </button>

        <button type="button" className={`home-glance-card home-glance-docs${glance.documentsPending > 0 ? ' has-open-items' : ''}`} onClick={() => onOpen('docs')}>
          <span className="home-glance-card-top"><i aria-hidden="true">▤</i><small>PRIVATE VAULT</small><b>{glance.documentsPending} open</b></span>
          <strong>{glance.documentsPending > 0 ? `${glance.documentsPending} ${glance.documentsPending === 1 ? 'document' : 'documents'} to review` : 'Everything is organised'}</strong>
          <span>{documentDetail}</span>
        </button>
      </div>
    </div>
  );
}

function DailyRhythm({ habits, today, setState, onOpen }) {
  const done = habits.filter(habit => habit.lastDone === today).length;

  function toggleHabit(id) {
    setState(s => ({
      ...s,
      habits: (s.habits || []).map(habit => {
        if (habit.id !== id) return habit;
        const alreadyDone = habit.lastDone === today;
        return {
          ...habit,
          lastDone: alreadyDone ? '' : today,
          streak: Math.max(0, (habit.streak || 0) + (alreadyDone ? -1 : 1)),
        };
      }),
    }));
    void window.__lifeos?.native.tap('light');
  }

  return (
    <Card padding="18px" style={{ height: '100%' }}>
      <HomeSectionHeader
        eyebrow="Your daily reset"
        title="Feel like yourself"
        action={<button className="home-text-button" onClick={() => onOpen('habits')}>{done}/{habits.length} today</button>}
      />
      <p className="home-card-description">A new country asks a lot of you. Keep the basics kind and easy.</p>
      <div className="home-habit-list">
        {habits.slice(0, 4).map(habit => {
          const isDone = habit.lastDone === today;
          return (
            <button
              key={habit.id}
              className={`home-habit-chip${isDone ? ' is-done' : ''}`}
              onClick={() => toggleHabit(habit.id)}
              aria-pressed={isDone}
            >
              <span>{habit.emoji || '✨'}</span>
              <span>{habit.name}</span>
              <span className="home-habit-check">{isDone ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      {habits.length === 0 && (
        <button className="home-empty-action" onClick={() => onOpen('habits')}>Create a grounding routine →</button>
      )}
    </Card>
  );
}

function LoveNoteCard({ whyNote, whyNote2, onWhyChange, onWhy2Change }) {
  const [editing, setEditing] = React.useState(false);
  const hasNote = Boolean(whyNote.trim() || whyNote2.trim());

  return (
    <Card padding="20px" style={{
      height: '100%',
      background: 'linear-gradient(145deg, color-mix(in srgb, var(--gold) 9%, var(--white)) 0%, var(--white) 72%)',
      border: '1px solid rgba(246, 209, 16, 0.46)',
    }}>
      <HomeSectionHeader
        eyebrow="Keep this close"
        title="A note for you"
        action={<button className="home-text-button" onClick={() => setEditing(value => !value)}>{editing ? 'Done' : 'Edit'}</button>}
      />
      {editing ? (
        <div className="home-note-editor">
          <textarea value={whyNote} onChange={event => onWhyChange(event.target.value)} placeholder="Write something steady for yourself…" rows={3} />
          <textarea value={whyNote2} onChange={event => onWhy2Change(event.target.value)} placeholder="Add another thought…" rows={2} />
        </div>
      ) : hasNote ? (
        <div className="home-love-note">
          {whyNote.trim() && <p>“{whyNote.trim()}”</p>}
          {whyNote2.trim() && <p className="home-love-note-second">{whyNote2.trim()}</p>}
        </div>
      ) : (
        <button className="home-note-empty" onClick={() => setEditing(true)}>
          <span>💌</span>
          <span>Add something you can return to on a hard day.</span>
        </button>
      )}
    </Card>
  );
}

function LandingKit({ first48, onAsk, onOpen }) {
  const items = [
    {
      icon: '📶', label: 'Stay connected',
      value: first48?.simCard?.provider,
      prompt: 'Help me choose and set up a local mobile plan in Abu Dhabi.',
    },
    {
      icon: '🛒', label: 'Stock the kitchen',
      value: first48?.groceries?.store,
      prompt: 'Help me make a simple first-week grocery plan for Abu Dhabi.',
    },
    {
      icon: '🚕', label: 'Move around easily',
      value: first48?.transport?.app,
      prompt: 'Help me understand my practical transport options in Abu Dhabi.',
    },
  ];

  return (
    <Card padding="18px">
      <HomeSectionHeader
        eyebrow="Local anchors"
        title="Make the city feel smaller"
        action={<button className="home-text-button" onClick={() => onOpen('map')}>Open map</button>}
      />
      <div className="home-landing-grid">
        {items.map(item => (
          <button key={item.label} className="home-landing-item" onClick={() => onAsk(item.prompt)}>
            <span className="home-landing-icon">{item.icon}</span>
            <strong>{item.value || item.label}</strong>
            <small>{item.value ? item.label : 'Plan with AI'} <span aria-hidden="true">→</span></small>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ConnectionBridge({ connection, onOpen }) {
  return (
    <article className="home-everyday-card home-connection-card">
      <div className="home-everyday-topline">
        <div>
          <div className="home-section-eyebrow">Across the distance</div>
          <h2>Us, right now</h2>
        </div>
        <span className="home-live-pill"><i /> Live</span>
      </div>

      <div className="home-clock-grid">
        <div>
          <span>Abu Dhabi</span>
          <strong>{connection.abuDhabiTime}</strong>
          <small>Her time</small>
        </div>
        <div className="home-clock-bridge" aria-hidden="true"><span>↔</span></div>
        <div>
          <span>Johannesburg</span>
          <strong>{connection.johannesburgTime}</strong>
          <small>Home time</small>
        </div>
      </div>

      <div className={`home-call-window${connection.isGoodWindow ? ' is-good' : ''}`}>
        <span />{connection.status}
      </div>
      <div className="home-connection-actions">
        <button onClick={() => onOpen('call', { mode: 'video', autoStart: true })}><span>▣</span> Video call</button>
        <button onClick={() => onOpen('call', { mode: 'audio', autoStart: true })}><span>☎</span> Audio call</button>
      </div>
      <button className="home-connection-note" onClick={() => onOpen('journal')}>
        Can’t talk now? Send a video note <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function DailyPhraseCard({ phrase, onAsk }) {
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  function speak() {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase.arabic);
    utterance.lang = 'ar-AE';
    utterance.rate = 0.78;
    window.speechSynthesis.speak(utterance);
    void window.__lifeos?.native.tap('light');
  }

  return (
    <article className="home-everyday-card home-phrase-card">
      <div className="home-everyday-topline">
        <div>
          <div className="home-section-eyebrow">Arabic for real life</div>
          <h2>One phrase today</h2>
        </div>
        <span className="home-phrase-mark">ع</span>
      </div>
      <div className="home-arabic-phrase" lang="ar" dir="rtl">{phrase.arabic}</div>
      <div className="home-phrase-pronunciation">{phrase.transliteration}</div>
      <strong className="home-phrase-meaning">{phrase.meaning}</strong>
      <p>{phrase.context}</p>
      <div className="home-phrase-actions">
        <button onClick={speak} disabled={!canSpeak}><span>🔊</span> Hear it</button>
        <button onClick={() => onAsk(`Help me practise the Arabic phrase "${phrase.transliteration}" and give me one simple example of when to use it.`)}>Practise with AI <span>→</span></button>
      </div>
    </article>
  );
}

function HomeSyncAction({ feedback, onSync, disabled = false }) {
  const status = feedback?.status || 'idle';
  const message = feedback?.message || 'Sync now';
  const detail = feedback?.detail || '';
  const showStatus = status !== 'idle';
  const showAction = status === 'idle' || status === 'error' || status === 'offline';
  const icon = {
    syncing: 'LoaderCircle',
    success: 'CircleCheck',
    error: 'OctagonAlert',
    offline: 'WifiOff',
  }[status] || 'RefreshCw';

  return (
    <div className={`home-sync-feedback is-${status}`} aria-live="polite">
      <div className="home-sync-feedback-panel">
        {showStatus && (
          <div className="home-sync-feedback-message" role="status" title={detail || message}>
            <span className={`home-sync-feedback-icon${status === 'syncing' ? ' is-spinning' : ''}`}>
              <AnimatedIcon key={status} name={icon} size={19} play={status === 'success' ? 1 : 0} />
            </span>
            <span>{message}</span>
          </div>
        )}
        {showAction && (
          <button
            type="button"
            className="home-sync-action-button"
            onClick={onSync}
            disabled={disabled}
            aria-label={status === 'idle' ? 'Sync Life OS now' : 'Retry sync'}
            title={disabled
              ? 'Sync is unavailable'
              : detail || (status === 'idle' ? 'Sync now' : 'Retry sync')}
          >
            <AnimatedIcon name="RefreshCw" size={20} play={0} />
          </button>
        )}
      </div>
    </div>
  );
}

function Dashboard({
  state,
  setState,
  onModule,
  onAsk,
  syncFeedback,
  onSync,
  syncDisabled = false,
  preferences,
  performanceMode,
  userName = 'there',
  userEmail = '',
}) {
  const [clockNow, setClockNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const model = window.__lifeos.home.buildHomeModel(state, clockNow);
  const connection = window.__lifeos.home.getConnectionSnapshot(clockNow);
  const { journey, dailyMode, phrase, priorities, glance, money, todayKey } = model;
  const [whyNote, setWhyNote] = React.useState(state.whyNote || '');
  const [whyNote2, setWhyNote2] = React.useState(state.whyNote2 || '');
  const [showExport, setShowExport] = React.useState(false);
  const prefs = window.__lifeos.preferences.preparePreferences(preferences);
  const liteVisuals = performanceMode === 'lite'
    || prefs.motion === 'reduced'
    || window.__lifeos.performance.shouldUseLiteVisuals();
  const hiddenHomeSections = new Set(prefs.hiddenHomeSections);
  const homeSectionStyle = sectionId => ({
    display: hiddenHomeSections.has(sectionId) ? 'none' : undefined,
    order: prefs.homeOrder.indexOf(sectionId),
  });
  const name = (!userName || userName === 'User' || userName === 'there') ? 'there' : userName.split(' ')[0];
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const moneyRemaining = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(money.remaining);
  const moneySpent = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(money.spent);
  const habits = state.habits || [];
  const journalEntryCount = window.__lifeos.journal.prepareJournalEntries(state.journal).length;
  const hasPrivateNote = userEmail.trim().toLowerCase() === 'suvedap@gmail.com';
  const aiSuggestions = ['Plan my week in Abu Dhabi', 'Help me feel at home', 'What should I handle next?'];
  const tools = [
    { id: 'map', label: 'My UAE map', emoji: '🗺️', detail: 'Saved places' },
    { id: 'docs', label: 'Document vault', emoji: '🪪', detail: 'Private files' },
    { id: 'budget', label: 'Money', emoji: '💳', detail: 'AED overview' },
    { id: 'tasks', label: 'Life admin', emoji: '🗓️', detail: 'Next steps' },
    { id: 'notes', label: 'Journal', emoji: '📓', detail: `${journalEntryCount} ${journalEntryCount === 1 ? 'entry' : 'entries'}` },
    { id: 'people', label: 'My people', emoji: '🤝', detail: `${model.contactCount} saved` },
    { id: 'housing', label: 'Home base', emoji: '🏠', detail: `${model.homePhotoCount} moments` },
    { id: 'games', label: 'Game night', emoji: '🎲', detail: 'Play together live' },
  ];

  function updateWhy(value) {
    setWhyNote(value);
    setState(s => ({ ...s, whyNote: value }));
  }

  function updateWhy2(value) {
    setWhyNote2(value);
    setState(s => ({ ...s, whyNote2: value }));
  }

  function setDailyMode(value) {
    setState(s => ({ ...s, dailyMode: { date: todayKey, value } }));
    void window.__lifeos?.native.tap('light');
  }

  function completePriority(action) {
    setState(s => {
      if (action.kind === 'document') {
        return { ...s, documents: (s.documents || []).map(item => item.id === action.sourceId ? { ...item, status: 'done' } : item) };
      }
      if (action.kind === 'task') {
        return { ...s, tasks: (s.tasks || []).map(item => item.id === action.sourceId ? { ...item, status: 'done' } : item) };
      }
      if (action.kind === 'habit') {
        return {
          ...s,
          habits: (s.habits || []).map(item => item.id === action.sourceId
            ? { ...item, lastDone: todayKey, streak: (item.streak || 0) + 1 }
            : item),
        };
      }
      if (action.kind === 'packing') {
        return {
          ...s,
          packing: {
            ...s.packing,
            rooms: (s.packing?.rooms || []).map(room => ({
              ...room,
              items: (room.items || []).map(item => item.id === action.sourceId ? { ...item, status: 'packed' } : item),
            })),
          },
        };
      }
      if (action.kind === 'shopping') {
        return { ...s, shopping: (s.shopping || []).map(item => item.id === action.sourceId ? { ...item, status: 'packed' } : item) };
      }
      return s;
    });
    void window.__lifeos?.native.notifyHaptic('success');
  }

  function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lifeos-export-${todayKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  }

  return (
    <main className="home-dashboard fade-in">
      <header className="home-topbar" style={{ order: -3 }}>
        <div>
          <div className="home-date">{todayLabel}</div>
          <h1>Hi {name}</h1>
        </div>
        <div className="home-topbar-actions">
          <HomeSyncAction feedback={syncFeedback} onSync={onSync} disabled={syncDisabled} />
          <button className="home-icon-button" onClick={() => setShowExport(true)} title="Export data" aria-label="Export data">↗</button>
          <button className="home-icon-button" onClick={() => onModule('settings')} title="Settings" aria-label="Open settings">⚙</button>
          <img src="/logo-mark.svg" width="46" height="46" alt="Life OS" />
        </div>
      </header>

      <JourneyHero model={model} onOpen={onModule} style={{ order: -2 }} liteVisuals={liteVisuals} />

      <DailyModeSelector value={dailyMode} onChange={setDailyMode} style={{ order: -1 }} />

      <section className="home-section home-glance-section" style={homeSectionStyle('overview')}>
        <HomeSectionHeader
          eyebrow="Everyday overview"
          title="Your life at a glance"
          action={<button className="home-text-button" onClick={() => onModule('settings')}>Customize</button>}
        />
        <LifeGlance glance={glance} money={money} onOpen={onModule} />
      </section>

      <section className="home-section" style={homeSectionStyle('priorities')}>
        <HomeSectionHeader
          eyebrow="Today"
          title="A clear next step"
          action={<button className="home-text-button" onClick={() => onModule('tasks')}>See full plan</button>}
        />
        <Card padding="0" style={{ overflow: 'hidden' }}>
          {priorities.map(action => (
            <PriorityRow key={action.id} action={action} onOpen={onModule} onComplete={completePriority} />
          ))}
        </Card>
      </section>

      <section className="home-section home-everyday-grid" style={homeSectionStyle('connection')}>
        <ConnectionBridge connection={connection} onOpen={onModule} />
        <DailyPhraseCard phrase={phrase} onAsk={onAsk} />
      </section>

      <section className="home-section home-snapshot-grid" style={homeSectionStyle('snapshots')}>
        <button className="home-snapshot-card home-money-card" onClick={() => onModule('budget')}>
          <span className="home-snapshot-icon">💳</span>
          <span className="home-snapshot-label">Available this month</span>
          <strong>{moneyRemaining} <small>{money.currency}</small></strong>
          <span className="home-snapshot-meta">{moneySpent} spent · {money.spentPercent}% of income</span>
          <HomeProgress value={money.spent} total={money.income} color="var(--terracotta)" />
        </button>
        <button className="home-snapshot-card home-map-card" onClick={() => onModule('map')}>
          <span className="home-map-pin">⌖</span>
          <span className="home-snapshot-label">Your UAE map</span>
          <strong>Find your anchors</strong>
          <span className="home-snapshot-meta">Home, essentials, favourites</span>
          <span className="home-card-link">Open map <span aria-hidden="true">→</span></span>
        </button>
      </section>

      <section className="home-section" style={homeSectionStyle('games')}>
        <button type="button" className="home-game-night-card" onClick={() => onModule('games')}>
          <span className="home-game-night-copy">
            <span className="home-section-eyebrow">LIFE OS PLAY</span>
            <strong>Turn tonight into game night.</strong>
            <small>Create a private room and play live, wherever everyone is.</small>
            <span className="home-game-night-cta">Choose a game <i>→</i></span>
          </span>
          <span className="home-game-night-art" aria-hidden="true">
            <i>○</i><i>×</i><i>✦</i>
          </span>
        </button>
      </section>

      {journey.isAfterMove && journey.daysSinceMove <= 30 && (
        <section className="home-section" style={homeSectionStyle('settling')}>
          <LandingKit first48={state.first48} onAsk={onAsk} onOpen={onModule} />
        </section>
      )}

      <section className={`home-section home-support-grid${hasPrivateNote ? '' : ' is-single'}`} style={homeSectionStyle('wellbeing')}>
        <DailyRhythm habits={habits} today={todayKey} setState={setState} onOpen={onModule} />
        {hasPrivateNote && (
          <LoveNoteCard
            whyNote={whyNote}
            whyNote2={whyNote2}
            onWhyChange={updateWhy}
            onWhy2Change={updateWhy2}
          />
        )}
      </section>

      <section className="home-section" style={homeSectionStyle('assistant')}>
        <Card padding="20px" style={{ background: 'var(--sand)', border: 'none' }}>
          <div className="home-huve-row">
            <img src="/huve-avatar.jpg" width="48" height="48" alt="Huve AI assistant" />
            <div>
              <div className="home-section-eyebrow">YOUR PERSONAL AI</div>
              <h2>Need a local answer?</h2>
              <p>Bring the question. Huve will use your preferences to turn it into a practical next step.</p>
            </div>
            <button className="home-huve-button" onClick={() => onAsk()}>Ask Huve <span aria-hidden="true">→</span></button>
          </div>
          <div className="home-suggestion-row">
            {aiSuggestions.map(suggestion => (
              <button key={suggestion} onClick={() => onAsk(suggestion)}>{suggestion}</button>
            ))}
          </div>
        </Card>
      </section>

      <section className="home-section" style={homeSectionStyle('tools')}>
        <HomeSectionHeader eyebrow="Everything in one place" title="Your UAE life hub" />
        <div className="home-tools-grid">
          {tools.map(tool => (
            <button key={tool.id} className="home-tool-card" onClick={() => onModule(tool.id)}>
              <span className="home-tool-icon">{tool.emoji}</span>
              <span><strong>{tool.label}</strong><small>{tool.detail}</small></span>
              <span className="home-tool-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="home-footer" style={{ order: 99 }}>
        <img src="/logo-mark.svg" width="22" height="22" alt="" />
        <span>A little more like home, every day.</span>
      </footer>

      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export your data">
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
          Download your lists, progress, habits, journal entries, and settings as a JSON file.
        </div>
        <Button full onClick={exportData}>Download JSON</Button>
      </Modal>
    </main>
  );
}

// ---------- Ask Huve sheet ----------
function AskHuveSheet({ open, onClose, initialPrompt, context = '' }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [queuedPrompt, setQueuedPrompt] = React.useState('');
  const [hydrated, setHydrated] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const scrollRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const store = window.__suvedaStore;

  React.useEffect(() => {
    let cancelled = false;

    async function hydrateMessages() {
      if (!open || hydrated) return;
      try {
        const savedMessages = await store?.loadChatMessages?.('main');
        if (!cancelled && Array.isArray(savedMessages) && savedMessages.length > 0) {
          setMessages(savedMessages);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrateMessages();
    return () => {
      cancelled = true;
    };
  }, [open, hydrated, store]);

  React.useEffect(() => {
    if (open && initialPrompt) {
      setInput(initialPrompt);
      setQueuedPrompt(initialPrompt);
    }
  }, [open, initialPrompt]);

  React.useEffect(() => {
    if (!open || !queuedPrompt) return;
    const timer = setTimeout(() => {
      send(queuedPrompt);
      setQueuedPrompt('');
    }, 200);
    return () => clearTimeout(timer);
  }, [open, queuedPrompt]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function handleFileUpload(files) {
    if (!files || !files.length) return;
    setUploading(true);
    const newFiles = [];
    for (const file of files) {
      try {
        const path = await window.__suvedaPhotos?.upload(file);
        const url = path ? await window.__suvedaPhotos?.signedUrl(path, 600) : null;
        if (path && url) newFiles.push({ id: uid(), path, url, name: file.name, type: file.type });
      } catch {
        // Keep the successful uploads when one selected file fails.
      }
    }
    if (newFiles.length > 0) {
      setUploadedFiles(f => [...f, ...newFiles]);
    }
    setUploading(false);
  }

  function removeUploadedFile(id) {
    setUploadedFiles(f => f.filter(x => x.id !== id));
  }

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    const userMessage = { role: 'user', text };
    setMessages(m => [...m, userMessage]);
    setInput('');
    setUploadedFiles([]);
    setLoading(true);
    await store?.appendChatMessage?.(userMessage, 'main');
    const fileUrls = uploadedFiles.map(f => f.url).join(', ');
    const extendedContext = fileUrls ? `${context}\n\nAttached files: ${fileUrls}` : context;
    try {
      const reply = await askHuve(text, extendedContext);
      const aiMessage = { role: 'ai', text: reply };
      setMessages(m => [...m, aiMessage]);
      await store?.appendChatMessage?.(aiMessage, 'main');
    } catch {
      const aiMessage = { role: 'ai', text: "I'm having trouble right now. Try again in a moment." };
      setMessages(m => [...m, aiMessage]);
      await store?.appendChatMessage?.(aiMessage, 'main');
    } finally {
      setLoading(false);
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 540;

  async function clearChat() {
    setMessages([]);
    setHydrated(false);
    await store?.clearChatMessages?.('main');
  }

  return (
    <Sheet open={open} onClose={onClose} height={isMobile ? '100dvh' : '86dvh'}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <img
            src="/huve-avatar.jpg"
            alt="Huve"
            style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20 }}>Huve</h2>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ask me anything about life in the UAE</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: '1px solid var(--line)', background: 'var(--white)',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  fontWeight: 600, color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >↺</button>
            )}
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '1px solid var(--line)', background: 'var(--white)',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 16,
                color: 'var(--dark)', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >✕</button>
          </div>
        </div>

        <div ref={scrollRef} style={{
          background: 'var(--sand)', borderRadius: 18, padding: 14,
          flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {messages.length === 0 && !loading && (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '40px 8px' }}>
              Ask me about visa paperwork, packing logistics, or day-one setup in Abu Dhabi. You can also attach photos for context.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.role === 'user' ? 'var(--honey)' : 'var(--white)',
              color: m.role === 'user' ? '#17272D' : 'var(--dark)',
              padding: '10px 14px', borderRadius: 16,
              borderBottomRightRadius: m.role === 'user' ? 4 : 16,
              borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
              fontSize: 14, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              boxShadow: 'var(--shadow)',
            }}>{m.text}</div>
          ))}
          {loading && (
            <div style={{
              alignSelf: 'flex-start',
              background: 'var(--white)', padding: '12px 16px', borderRadius: 16,
              display: 'flex', gap: 4,
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--muted)',
                  animation: `pop 0.6s ${i * 0.15}s infinite alternate`,
                }} />
              ))}
            </div>
          )}
        </div>

      <div style={{ flexShrink: 0, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            'What should I pack first?',
            'Things I always forget',
            'Tips for my first week in Abu Dhabi',
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setInput(suggestion);
                send(suggestion);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'var(--white)',
                color: 'var(--dark)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {uploadedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {uploadedFiles.map(f => (
              <div key={f.id} style={{
                position: 'relative', width: 52, height: 52, borderRadius: 10,
                overflow: 'hidden', border: '1px solid var(--line)',
                background: 'var(--sand)',
              }}>
                {f.type?.startsWith('image/') ? (
                  <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>📄</div>
                )}
                <button
                  onClick={() => removeUploadedFile(f.id)}
                  style={{
                    position: 'absolute', top: -2, right: -2, width: 18, height: 18,
                    borderRadius: '50%', border: 'none', background: 'var(--honey)',
                    color: '#17272D', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              border: '1px solid var(--line)', background: 'var(--white)',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)',
            }}
            title="Attach photo or file"
          >📎</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt"
            multiple
            style={{ display: 'none' }}
            onChange={e => { handleFileUpload(e.target.files); e.target.value = ''; }}
          />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask Huve..."
            style={{
              flex: 1, padding: '12px 16px',
              border: '1px solid var(--line)', borderRadius: 999,
              background: 'var(--white)', fontSize: 14, outline: 'none',
            }}
          />
          <Button variant="teal" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? '...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
    </Sheet>
  );
}

Object.assign(window, {
  Onboarding, Dashboard, AskHuveSheet, ModuleCard, NotesJournalScreen,
  MODULES, daysUntil, formatDate, moduleProgress, overallProgress,
});
