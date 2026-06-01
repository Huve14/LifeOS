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
  return {
    packing:  { done: packDone, total: packItems.length },
    docs:     { done: docDone, total: state.documents.length },
    tasks:    { done: taskDone, total: state.tasks.length },
    budget:   { done: budgetSpent, total: budgetTotal, isMoney: true },
    shopping: { done: shopDone, total: state.shopping.length },
    housing:  { done: housingShortlisted, total: state.housing.length },
  };
}

const MODULES = [
  { id: 'packing',  label: 'Packing',   emoji: '📦', color: 'var(--terracotta)' },
  { id: 'docs',     label: 'Documents', emoji: '📑', color: 'var(--teal)' },
  { id: 'tasks',    label: 'Timeline',  emoji: '🗓️', color: 'var(--gold)' },
  { id: 'budget',   label: 'Budget',    emoji: '💰', color: 'var(--terracotta)' },
  { id: 'shopping', label: 'To buy',    emoji: '🛍️', color: 'var(--gold)' },
  { id: 'housing',  label: 'Housing',   emoji: '🏠', color: 'var(--teal)' },
];

// ---------- Onboarding ----------
function Onboarding({ onDone, initialDate }) {
  const [step, setStep] = React.useState(0);
  const [date, setDate] = React.useState(initialDate);

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
        <div className="pop-in" key={step} style={{ marginBottom: 26, display: 'flex', justifyContent: 'center' }}>
          {s.visual === 'globe'
            ? <SpinningGlobe />
            : <div style={{ fontSize: 88 }}>{s.emoji}</div>}
        </div>
        <h1 style={{ fontSize: 30, marginBottom: 14, lineHeight: 1.1 }}>{s.title}</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>{s.body}</p>
        {s.content}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
        <Button
          variant="primary" size="lg" full
          onClick={() => {
            if (step < steps.length - 1) setStep(step + 1);
            else onDone({ moveDate: date });
          }}
        >
          {s.cta}
        </Button>
        {step > 0 && step < steps.length - 1 && (
          <button
            onClick={() => setStep(step - 1)}
            style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}
          >
            ← back
          </button>
        )}
      </div>
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
function Dashboard({ state, onModule, onAsk, layout = 'classic', progressStyle = 'bar', syncStatus = '' }) {
  const progress = moduleProgress(state);
  const overall = overallProgress(state);
  const moneyProgress = state.budget.categories.reduce((a, c) => a + c.spent, 0);

  const aiSuggestions = [
    'What should I pack first?',
    'Things I always forget',
    'Tips for my first week in Abu Dhabi',
  ];

  return (
    <div className="fade-in" style={{ padding: '20px 18px 100px' }}>
      {/* Top greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
          <h1 style={{ fontSize: 26, marginTop: 2 }}>Hi Suveda 👋</h1>
          {syncStatus && (
            <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{syncStatus}</div>
          )}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'DM Sans', fontWeight: 700, color: '#fff', fontSize: 16,
          boxShadow: 'var(--shadow)',
        }}>S</div>
      </div>

      {/* Hero countdown */}
      <CountdownHero moveDate={state.moveDate} layout={layout} total={overall.total} done={overall.done} />

      {/* Quick AI prompt strip */}
      <Card padding="18px 18px 16px" style={{ marginTop: 16, background: 'var(--sand)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--teal) 0%, #1e524f 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>🌵</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'DM Sans' }}>Ask Huve anything</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Visa rules, packing, things you forgot…</div>
          </div>
          <Button size="sm" variant="teal" onClick={() => onAsk()}>Ask</Button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto', paddingBottom: 2 }}>
          {aiSuggestions.map(q => (
            <button
              key={q}
              onClick={() => onAsk(q)}
              style={{
                padding: '9px 14px', borderRadius: 999,
                background: 'var(--white)', border: '1px solid var(--line)',
                fontSize: 12, color: 'var(--dark)', fontWeight: 500,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >{q}</button>
          ))}
        </div>
      </Card>

      {/* Modules */}
      <div style={{ marginTop: 24 }}>
        <SectionHeader title="Your move, in 6 lists" />
        {layout === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {MODULES.map(m => (
              <ModuleCard key={m.id} module={m} progress={progress[m.id]} onClick={() => onModule(m.id)} progressStyle={progressStyle} layout="cards" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MODULES.map(m => (
              <ModuleCard key={m.id} module={m} progress={progress[m.id]} onClick={() => onModule(m.id)} progressStyle={progressStyle} layout={layout} />
            ))}
          </div>
        )}
      </div>

      {/* Footer cheer */}
      <div style={{ textAlign: 'center', marginTop: 26, fontSize: 12, color: 'var(--muted)' }}>
        🌴 One step at a time. You\'ve got this.
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
