// screens-home.jsx — Home/Dashboard, Onboarding, AI sheet

// ---------- Helpers ----------
function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
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
  const packItems = state.packing.rooms.flatMap(r => r.items);
  const packDone = packItems.filter(i => i.status === 'packed').length;
  const docDone = state.documents.filter(d => d.status === 'done').length;
  const taskDone = state.tasks.filter(t => t.status === 'done').length;
  const shopDone = state.shopping.filter(s => s.status === 'packed').length;
  const budgetSpent = state.budget.categories.reduce((a, c) => a + c.spent, 0);
  const budgetTotal = state.budget.categories.reduce((a, c) => a + c.planned, 0);
  const housingShortlisted = state.housing.filter(h => h.status === 'shortlisted' || h.status === 'viewing').length;
    const ltDone = (state.memories?.lastTimes || []).filter(m => m.done).length;
    const ltTotal = (state.memories?.lastTimes || []).length;
    const gbDone = (state.memories?.goodbyes || []).filter(g => g.done).length;
    const gbTotal = (state.memories?.goodbyes || []).length;
  return {
    packing:  { done: packDone, total: packItems.length },
    docs:     { done: docDone, total: state.documents.length },
    tasks:    { done: taskDone, total: state.tasks.length },
    budget:   { done: budgetSpent, total: budgetTotal, isMoney: true },
    shopping: { done: shopDone, total: state.shopping.length },
    housing:  { done: housingShortlisted, total: state.housing.length },
    memory:   { done: ltDone + gbDone, total: ltTotal + gbTotal },
    people:   { done: (state.contacts || []).filter(c => c.phone || c.email).length, total: (state.contacts || []).length },
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
  { id: 'people',   label: 'People',    emoji: '👥', color: 'var(--teal)' },
];

// ---------- Onboarding (with embedded login) ----------
function Onboarding({ onDone, initialDate, user }) {
  const [step, setStep] = React.useState(0);
  const [date, setDate] = React.useState(initialDate);

  // Auth state
  const [authMode, setAuthMode] = React.useState('name');
  const [authName, setAuthName] = React.useState('');
  const [authEmail, setAuthEmail] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [authError, setAuthError] = React.useState('');
  const [authLoading, setAuthLoading] = React.useState(false);
  const wasLoggedIn = React.useRef(!!user);

  // Auto-advance when user logs in during step 0
  React.useEffect(() => {
    if (!wasLoggedIn.current && user && step === 0) {
      setStep(1);
    }
  }, [user, step]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { signIn, signUp } = window.__suvedaAuth || {};
    if (!signIn || !signUp) { setAuthError('Auth not ready'); setAuthLoading(false); return; }
    try {
      if (authMode === 'name') {
        const n = authName.trim() || 'Suveda';
        const autoEmail = `${n.toLowerCase().replace(/\s+/g, '.')}@suveda.app`;
        const { error: siErr } = await signIn(autoEmail, authPassword);
        if (siErr) {
          const { error: suErr } = await signUp(autoEmail, authPassword, n);
          if (suErr) {
            setAuthError(suErr.message);
          }
        }
      } else {
        const { error: siErr } = await signIn(authEmail, authPassword);
        if (siErr) setAuthError(siErr.message);
      }
    } catch (err) {
      setAuthError(err?.message || 'Something went wrong');
    }
    setAuthLoading(false);
  }

  const steps = [
    {
      visual: 'globe',
      title: 'Hi, I\'m Huve!',
      body: 'Your warm, slightly bossy companion for the big move to Abu Dhabi. We\'ll go room by room, list by list — together.',
      cta: 'Let\'s do this',
    },
    {
      emoji: '📍',
      title: 'Al Khalifa City, Abu Dhabi',
      body: 'I\'ve set your destination already. Sandy mornings, palm shadows, late-night shawarma — you\'re going to love it.',
      cta: 'Continue',
    },
    {
      emoji: '📅',
      title: 'When do you fly?',
      body: 'Pick a move date so I can build your timeline and remind you about the right things at the right time.',
      cta: 'Set my date',
      content: (
        <div style={{ marginTop: 18 }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              border: '1.5px solid var(--line)',
              borderRadius: 14,
              background: 'var(--white)',
              fontSize: 16,
              fontFamily: 'DM Sans',
              fontWeight: 600,
              color: 'var(--dark)',
              outline: 'none',
            }}
          />
        </div>
      ),
    },
    {
      emoji: '✨',
      title: 'You\'re all set, Suveda',
      body: '6 lists, 1 timeline, 0 stress. I\'ll check in with you daily. Tap me anytime — bottom right corner.',
      cta: 'Open my dashboard',
    },
  ];

  const s = steps[step];

  return (
    <div className="fade-in" style={{
      height: '100%',
      background: 'linear-gradient(180deg, var(--cream) 0%, var(--sand) 100%)',
      padding: '60px 28px 100px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 36 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            height: 4, width: i === step ? 22 : 6,
            background: i <= step ? 'var(--terracotta)' : 'var(--line)',
            borderRadius: 2,
          }} />
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
        <div className="pop-in" key={step} style={{ marginBottom: 26, display: 'flex', justifyContent: 'center' }}>
          {s.visual === 'globe'
            ? <SpinningGlobe />
            : <div style={{ fontSize: 88 }}>{s.emoji}</div>}
        </div>

        {step === 0 && !user ? (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 14, lineHeight: 1.1 }}>Hi, I'm Huve!</h1>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto 20px' }}>
              Your warm companion for the move to Abu Dhabi. Enter your name to get started.
            </p>
            {/* Auth form card */}
            <div style={{
              background: 'var(--white)', borderRadius: 20, padding: '22px 20px',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--line)',
              maxWidth: 360, width: '100%', margin: '0 auto',
            }}>
              <form onSubmit={handleAuth}>
                {authMode === 'name' ? (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Name</label>
                    <input
                      type="text" value={authName} onChange={e => setAuthName(e.target.value)}
                      placeholder="Suveda" required autoFocus
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
                ) : (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Email</label>
                    <input
                      type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                      placeholder="you@example.com" required
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

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 5, textAlign: 'left' }}>Password</label>
                  <input
                    type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••" required minLength={6}
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

                {authError && (
                  <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
                    {authError}
                  </div>
                )}

                <button
                  type="submit" disabled={authLoading}
                  style={{
                    width: '100%', padding: '14px',
                    borderRadius: 14, border: 'none',
                    background: authLoading ? '#aaa' : 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                    fontFamily: 'DM Sans', cursor: authLoading ? 'not-allowed' : 'pointer',
                    opacity: authLoading ? 0.7 : 1,
                    boxShadow: '0 4px 14px -4px rgba(196, 113, 74, 0.4)',
                  }}
                >
                  {authLoading ? 'Processing…' : 'Start'}
                </button>

                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => { setAuthMode(m => m === 'name' ? 'email' : 'name'); setAuthError(''); }}
                    style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {authMode === 'name'
                      ? <>Use email instead <span style={{color:'var(--terracotta)',fontWeight:700}}>→</span></>
                      : <>Use name instead <span style={{color:'var(--terracotta)',fontWeight:700}}>→</span></>
                    }
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 14, lineHeight: 1.1 }}>{s.title}</h1>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>{s.body}</p>
            {s.content}
          </>
        )}
      </div>

      {(!user || step > 0 || step === 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
          {user && step === 0 && (
            <Button variant="primary" size="lg" full onClick={() => setStep(1)}>
              Let's do this
            </Button>
          )}
          {step > 0 && (
            <Button
              variant="primary" size="lg" full
              onClick={() => {
                if (step < steps.length - 1) setStep(step + 1);
                else onDone({ moveDate: date });
              }}
            >
              {s.cta}
            </Button>
          )}
          {step > 0 && step < steps.length - 1 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{ color: 'var(--muted)', fontSize: 13, padding: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
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
function CountdownHero({ moveDate, layout, total, done }) {
  const days = daysUntil(moveDate);
  const pct = total > 0 ? Math.round((done/total) * 100) : 0;

  if (layout === 'cards') {
    // Compact card style
    return (
      <Card style={{ background: 'linear-gradient(135deg, var(--terracotta) 0%, #B05A3A 100%)', color: '#fff', border: 'none' }} padding="20px">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wheels up in</div>
            <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 56, lineHeight: 1, marginTop: 6 }}>
              {days}
              <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.85, marginLeft: 6 }}>days</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{formatDate(moveDate)} · AUH 🛬</div>
          </div>
          <div style={{ fontSize: 56, opacity: 0.4 }}>✈️</div>
        </div>
      </Card>
    );
  }

  if (layout === 'timeline') {
    return (
      <Card padding="20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ProgressBar value={done} total={total || 1} style="circle" color="var(--terracotta)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Move day</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {days} {days === 1 ? 'day' : 'days'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(moveDate)}</div>
          </div>
        </div>
      </Card>
    );
  }

  // Default "classic"
  return (
    <Card padding="22px" style={{ background: 'var(--white)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>📍 Al Khalifa City, Abu Dhabi</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 800, fontSize: 64, lineHeight: 0.95, color: 'var(--terracotta)' }}>
            {days}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>days until {formatDate(moveDate)}</div>
        </div>
        <ProgressBar value={done} total={total || 1} style="circle" color="var(--gold)" />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span>{pct}% packed in spirit</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
    </Card>
  );
}

// ---------- Module card on dashboard ----------
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
          <div style={{ fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700 }}>{module.label}</div>
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
            <div style={{ fontFamily: 'DM Sans', fontSize: 15, fontWeight: 700 }}>{module.label}</div>
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
          <div style={{ fontFamily: 'DM Sans', fontSize: 16, fontWeight: 700 }}>{module.label}</div>
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

// ---------- Dashboard ----------
function Dashboard({ state, setState, onModule, onAsk, layout = 'classic', progressStyle = 'bar', syncStatus = '', userName = 'Suveda' }) {
  const progress = moduleProgress(state);
  const overall = overallProgress(state);
  const days = daysUntil(state.moveDate);
  const [whyNote, setWhyNote] = React.useState(state.whyNote || '');

  // Sync whyNote to app state
  function updateWhy(val) {
    setWhyNote(val);
    setState?.(s => ({ ...s, whyNote: val }));
  }

  return (
    <div className="fade-in" style={{ padding: '20px 18px 100px' }}>
      {/* Top greeting with Huve's daily check-in */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
          <h1 style={{ fontSize: 26, marginTop: 2 }}>Hi {userName} 👋</h1>
          {syncStatus && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{syncStatus}</div>
          )}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow)',
        }}>
          <svg viewBox="0 0 200 170" width="38" height="38">
            <rect width="200" height="170" rx="0" fill="none"/>
            <circle cx="150" cy="46" r="19" fill="#FAF7F2" opacity="0.9"/>
            <circle cx="150" cy="46" r="19" fill="none" stroke="#fff" stroke-width="1" opacity="0.3"/>
            <g><rect x="67" y="110" width="66" height="9" fill="#B9851F"/><ellipse cx="100" cy="119" rx="33" ry="10.5" fill="#B9851F"/><ellipse cx="100" cy="110" rx="33" ry="10.5" fill="#FAF7F2" opacity="0.9"/></g>
            <g><rect x="67" y="96" width="66" height="9" fill="#B9851F"/><ellipse cx="100" cy="105" rx="33" ry="10.5" fill="#B9851F"/><ellipse cx="100" cy="96" rx="33" ry="10.5" fill="#FAF7F2" opacity="0.9"/></g>
            <g><rect x="67" y="82" width="66" height="9" fill="#B9851F"/><ellipse cx="100" cy="91" rx="33" ry="10.5" fill="#B9851F"/><ellipse cx="100" cy="82" rx="33" ry="10.5" fill="#FAF7F2" opacity="0.9"/></g>
            <path d="M0 150 C 30 132 60 134 80 142 C 96 148 112 150 128 144 C 150 136 168 138 200 132 L 200 170 L 0 170 Z" fill="#1E524F" opacity="0.4"/>
          </svg>
        </div>
      </div>

      {/* Huve daily check-in */}
      <Card padding="14px 16px" style={{ marginBottom: 14, background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)', color: '#fff', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>🌵</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>Good {timeGreeting}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans', marginTop: 1 }}>{huveMessage}</div>
          </div>
        </div>
      </Card>

      {/* "Why I'm doing this" anchor */}
      <Card padding="12px 16px" style={{ marginBottom: 14, background: 'var(--white)', border: '1px dashed var(--gold)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>💫</span>
          <input
            value={whyNote}
            onChange={e => updateWhy(e.target.value)}
            placeholder="Why are you doing this? Write your reason here..."
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, fontWeight: 600, fontFamily: 'DM Sans',
              color: 'var(--dark)', outline: 'none',
              fontStyle: whyNote ? 'normal' : 'italic',
            }}
          />
        </div>
      </Card>

      {/* Hero countdown */}
      <CountdownHero moveDate={state.moveDate} layout={layout} total={overall.total} done={overall.done} />

      {/* Milestone bar */}
      {completedModules > 0 && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--sand)', borderRadius: 14 }}>
          <span style={{ fontSize: 22 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{completedModules} of {totalModules} lists complete</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{milestoneMessages[milestoneIdx]}</div>
          </div>
          <span style={{ fontSize: 18 }}>{['🎒', '🌟', '🎯', '✈️'][milestoneIdx]}</span>
        </div>
      )}

      {/* First 48 Hours guide */}
      {state.first48 && (
        <details style={{ marginTop: 14, background: 'var(--white)', borderRadius: 16, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <summary style={{
            padding: '14px 16px', fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans',
            cursor: 'pointer', color: 'var(--dark)',
            listStyle: 'none', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>🛬</span> First 48 hours in Abu Dhabi
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>▼</span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0 4px' }}>
            {[
              { icon: '📶', label: 'SIM card', value: state.first48.simCard?.provider, detail: state.first48.simCard?.where },
              { icon: '🛒', label: 'Groceries', value: state.first48.groceries?.store, detail: state.first48.groceries?.tip },
              { icon: '🕌', label: 'Mosque', value: state.first48.mosque?.name, detail: state.first48.mosque?.location },
              { icon: '🍽️', label: 'First meal', value: state.first48.firstMeal?.place, detail: state.first48.firstMeal?.dish },
              { icon: '🚕', label: 'Getting around', value: state.first48.transport?.app, detail: state.first48.transport?.note },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.value}{item.detail ? ` · ${item.detail}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Quick AI prompt strip */}
      <Card padding="16px 18px 14px" style={{ marginTop: 14, background: 'var(--sand)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>🌵</div>
          <Button size="sm" variant="teal" onClick={() => onAsk()}>Ask Huve</Button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {aiSuggestions.map(q => (
            <button
              key={q}
              onClick={() => onAsk(q)}
              style={{
                padding: '8px 14px', borderRadius: 999,
                background: 'var(--white)', border: '1px solid var(--line)',
                fontSize: 12, color: 'var(--dark)', fontWeight: 500, fontFamily: 'inherit',
                whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
              }}
            >{q}</button>
          ))}
        </div>
      </Card>

      {/* Modules */}
      <div style={{ marginTop: 22 }}>
        <SectionHeader title="Your move, in 8 lists" />
        {layout === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {MODULES.map(m => (
              <ModuleCard key={m.id} module={m} progress={progress[m.id]} onClick={() => onModule(m.id)} progressStyle={progressStyle} layout="cards" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MODULES.map(m => (
              <ModuleCard key={m.id} module={m} progress={progress[m.id]} onClick={() => onModule(m.id)} progressStyle={progressStyle} layout={layout} />
            ))}
          </div>
        )}
      </div>

      {/* Footer cheer */}
      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
        {days} days until wheels up. You've got this. 🌴
      </div>
    </div>
  );
}

// ---------- Ask Huve sheet ----------
function AskHuveSheet({ open, onClose, initialPrompt, context = '' }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [queuedPrompt, setQueuedPrompt] = React.useState('');
  const [hydrated, setHydrated] = React.useState(false);
  const scrollRef = React.useRef(null);
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

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || loading) return;
    const userMessage = { role: 'user', text };
    setMessages(m => [...m, userMessage]);
    setInput('');
    setLoading(true);
    await store?.appendChatMessage?.(userMessage, 'main');
    try {
      const reply = await askHuve(text, context);
      const aiMessage = { role: 'ai', text: reply };
      setMessages(m => [...m, aiMessage]);
      await store?.appendChatMessage?.(aiMessage, 'main');
    } catch (e) {
      const aiMessage = { role: 'ai', text: "I'm having trouble right now. Try again in a moment. 🌵" };
      setMessages(m => [...m, aiMessage]);
      await store?.appendChatMessage?.(aiMessage, 'main');
    } finally {
      setLoading(false);
    }
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 540;

  return (
    <Sheet open={open} onClose={onClose} height={isMobile ? '100dvh' : '86dvh'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>🌵</div>
        <div>
          <h2 style={{ fontSize: 20 }}>Huve</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Your move-abroad sidekick</div>
        </div>
      </div>

      <div ref={scrollRef} style={{
        background: 'var(--sand)', borderRadius: 18, padding: 14,
        minHeight: isMobile ? 0 : 320,
        flex: 1,
        maxHeight: isMobile ? 'none' : 380,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '40px 8px' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
            Ask me about visa stuff, packing tricks, or what to expect on day one.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.role === 'user' ? 'var(--terracotta)' : 'var(--white)',
            color: m.role === 'user' ? '#fff' : 'var(--dark)',
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

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
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

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask Huve…"
          style={{
            flex: 1, padding: '12px 16px',
            border: '1px solid var(--line)', borderRadius: 999,
            background: 'var(--white)', fontSize: 14, outline: 'none',
          }}
        />
        <Button variant="teal" onClick={() => send()} disabled={loading || !input.trim()}>
          {loading ? '…' : 'Send'}
        </Button>
      </div>
    </Sheet>
  );
}

Object.assign(window, {
  Onboarding, Dashboard, AskHuveSheet, CountdownHero, ModuleCard,
  MODULES, daysUntil, formatDate, moduleProgress, overallProgress,
});
