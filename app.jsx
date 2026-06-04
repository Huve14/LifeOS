// app.jsx — Main Suveda shell

const { useState, useEffect, useMemo, useRef, useCallback } = React;

function createSeedState(tweaks) {
  return {
    moveDate: tweaks.moveDate,
    ...applyProgress(SEED, tweaks.progressLevel),
    habits: SEED.habits || [],
    journal: [],
  };
}

function pickStoredState(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const saved = candidate;
  if (!saved.packing || !saved.documents || !saved.tasks || !saved.budget || !saved.shopping || !saved.housing) {
    return null;
  }
  if (!saved.habits) saved.habits = SEED.habits || [];
  if (!saved.journal) saved.journal = [];
  if (!saved.memories) saved.memories = SEED.memories || { lastTimes: [], goodbyes: [] };
  if (!saved.contacts) saved.contacts = SEED.contacts || [];
  if (!saved.whyNote2) {
    saved.whyNote2 = SEED.whyNote2 || '';
    saved.whyNote = SEED.whyNote || '';
  }
  if (!saved.first48) saved.first48 = SEED.first48 || null;
  return saved;
}

// Default tweaks (host-persisted between EDITMODE markers in HTML)
const DEFAULT_TWEAKS = window.__suvedaDefaults || {
  moveDate: window.DEFAULT_MOVE_DATE,
  progressLevel: 'empty',     // empty | half | almost
  initialTab: 'home',
  accent: 'terracotta',       // terracotta | teal | gold
  density: 'cozy',            // cozy | compact
  layout: 'classic',          // classic | cards | timeline
  progressStyle: 'bar',       // bar | circle | segmented
  dark: false,
};

function App() {
  // Shared shopping list route — handle both hash (#shared/TOKEN) and path (/s/TOKEN) formats.
  // Path format catches cases where the old SW intercepts /s/ and serves index.html.
  const pathMatch = window.location.pathname.match(/^\/s\/(.+)/);
  if (pathMatch) {
    return <SharedList token={pathMatch[1]} />;
  }
  const hash = window.location.hash;
  if (hash.startsWith('#shared/')) {
    return <SharedList token={hash.replace('#shared/', '')} />;
  }

  const [tweaks, setTweak] = useTweaks(DEFAULT_TWEAKS);
  const store = window.__suvedaStore;
  const [storageReady, setStorageReady] = useState(false);

  // Auth state
  const [user, setUser] = useState(window.__suvedaUser ?? null);
  const [authReady, setAuthReady] = useState(!!window.__suvedaUser);

  useEffect(() => {
    const unsub = window.__suvedaAuth?.onAuthChange((u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // App state
  const [view, setView] = useState(null); // null=loading | onboarding | home | packing | docs | tasks | budget | shopping | housing
  const [state, setState] = useState(() => createSeedState(tweaks));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const lastPctRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const saved = await store?.loadAppState?.();
        if (cancelled) return;
        const restored = pickStoredState(saved);
        if (restored) {
          setState(restored);
          setView(restored.onboardingDone ? 'home' : 'onboarding');
        } else {
          setView('onboarding');
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!storageReady || !store?.saveAppState) return;
    const timer = setTimeout(() => {
      store.saveAppState(state);
    }, 500);
    return () => clearTimeout(timer);
  }, [state, storageReady, store]);

  // When tweak progressLevel changes, regenerate seed
  useEffect(() => {
    setState(s => ({
      ...s,
      ...applyProgress(SEED, tweaks.progressLevel),
    }));
  }, [tweaks.progressLevel]);

  // Sync moveDate from tweak
  useEffect(() => {
    setState(s => ({ ...s, moveDate: tweaks.moveDate }));
  }, [tweaks.moveDate]);

  // Listen for any module 100% to trigger celebration
  useEffect(() => {
    const mp = moduleProgress(state);
    const completed = Object.entries(mp).filter(([, v]) => v.total > 0 && v.done === v.total && !v.isMoney).length;
    if (completed > lastPctRef.current && completed > 0) {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 3500);
    }
    lastPctRef.current = completed;
  }, [state]);

  // Map accent tweak to CSS variable
  const accentMap = {
    terracotta: 'var(--terracotta)',
    teal: 'var(--teal)',
    gold: 'var(--gold)',
  };

  // Apply theme attrs to root .app
  const appStyle = {
    '--accent': accentMap[tweaks.accent],
  };

  function openAi(prompt = '', context = '') {
    setAiPrompt(prompt);
    setAiContext(context);
    setAiOpen(true);
  }

  function renderContent() {
    if (view === 'onboarding') {
      return <Onboarding user={user} initialDate={tweaks.moveDate} onDone={({ moveDate }) => {
        setTweak('moveDate', moveDate);
        setState(s => ({ ...s, moveDate, onboardingDone: true }));
        setView('home');
      }} />;
    }

    const screens = {
      home:    <Dashboard state={state} setState={setState} onAsk={openAi}
                onModule={id => setView(id)}
                layout={tweaks.layout} progressStyle={tweaks.progressStyle}
                syncStatus={storageReady ? (store?.hasConfig ? 'Synced to Supabase' : 'Local draft') : 'Connecting…'}
                userName={displayName} />,
      packing: <PackingScreen state={state} setState={setState} onBack={() => setView('home')} onAsk={openAi} />,
      docs:    <DocumentsScreen state={state} setState={setState} onBack={() => setView('home')} onAsk={openAi} />,
      tasks:   <TasksScreen state={state} setState={setState} onBack={() => setView('home')} />,
      budget:  <BudgetScreen state={state} setState={setState} onBack={() => setView('home')} />,
      shopping:<ShoppingScreen state={state} setState={setState} onBack={() => setView('home')} onAsk={openAi} />,
      housing: <HousingScreen state={state} setState={setState} onBack={() => setView('home')} onAsk={openAi} />,
      memory:  <MemoryScreen state={state} setState={setState} onBack={() => setView('home')} />,
      habits:  <HabitsScreen state={state} setState={setState} onBack={() => setView('home')} />,
      people:  <ContactsScreen state={state} setState={setState} onBack={() => setView('home')} />,
      map:     <MapScreen state={state} setState={setState} onBack={() => setView('home')} />,
    };
    return screens[view] || screens.home;
  }

  // Derive user info for display
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

  if (!authReady || !storageReady) {
    return (
      <div style={{
        minHeight: '100%', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--cream)', color: 'var(--muted)',
        fontSize: 14, fontWeight: 500,
      }}>
        Loading…
      </div>
    );
  }

  // If not logged in, show onboarding (which has the auth form embedded in step 0)
  if (!user && view !== null) {
    return <Onboarding user={null} initialDate={tweaks.moveDate} onDone={({ moveDate }) => {
      setTweak('moveDate', moveDate);
      setState(s => ({ ...s, moveDate, onboardingDone: true }));
      setView('home');
    }} />;
  }

  return (
    <div
      className="app"
      data-dark={tweaks.dark}
      data-density={tweaks.density}
      style={{
        ...appStyle,
        minHeight: '100%', width: '100%',
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(at 20% 0%, rgba(212, 168, 83, 0.10) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, rgba(196, 113, 74, 0.08) 0%, transparent 50%)',
        color: 'var(--dark)',
        position: 'relative',
        paddingTop: 24,
      }}
    >
      {renderContent()}

      {/* Floating Ask Huve button (hidden during onboarding) */}
      {view !== 'onboarding' && (
        <button
          onClick={() => openAi()}
          className="ai-pulse"
          style={{
            position: 'fixed',
            right: 18, bottom: 84,
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
            color: '#fff', fontSize: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px -6px rgba(196, 113, 74, 0.55), 0 4px 10px rgba(0,0,0,0.1)',
            zIndex: 50, border: 'none', cursor: 'pointer',
          }}
        >🌵</button>
      )}

      {/* Bottom navigation (hidden during onboarding) */}
      {view !== 'onboarding' && (
        <BottomNav current={view} onNavigate={setView} />
      )}

      {/* AI sheet */}
      <AskHuveSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        initialPrompt={aiPrompt}
        context={aiContext}
      />

      {/* Celebration */}
      <Confetti active={celebrate} />
      {celebrate && (
        <div className="pop-in" style={{
          position: 'absolute', top: '40%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--white)',
          padding: '20px 28px', borderRadius: 24,
          boxShadow: 'var(--shadow-lg)',
          textAlign: 'center', zIndex: 201,
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
          <h2 style={{ fontSize: 18 }}>You finished a list!</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>That feels good, doesn\'t it?</div>
        </div>
      )}

      {/* Tweaks panel */}
      <SuvedaTweaks tweaks={tweaks} setTweak={setTweak} setView={setView} />
    </div>
  );
}

function SuvedaTweaks({ tweaks, setTweak, setView }) {
  // Color → semantic name mapping for accent
  const accentMap = { '#C4714A': 'terracotta', '#2A6E6B': 'teal', '#D4A853': 'gold' };
  const accentColors = ['#C4714A', '#2A6E6B', '#D4A853'];
  const accentValueAsColor = { terracotta: '#C4714A', teal: '#2A6E6B', gold: '#D4A853' }[tweaks.accent];

  return (
    <TweaksPanel title="Suveda Tweaks">
      <TweakSection label="Move day">
        <input
          type="date"
          value={tweaks.moveDate}
          onChange={e => setTweak('moveDate', e.target.value)}
          style={{
            padding: '10px 12px',
            border: '1px solid #d8d8d8', borderRadius: 10,
            fontSize: 13, fontFamily: 'inherit',
            background: '#fff', width: '100%',
          }}
        />
      </TweakSection>

      <TweakSection label="Demo data">
        <TweakRadio
          value={tweaks.progressLevel}
          onChange={v => setTweak('progressLevel', v)}
          options={[
            { value: 'empty',  label: 'Fresh' },
            { value: 'half',   label: 'Halfway' },
            { value: 'almost', label: 'Almost' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Dashboard layout">
        <TweakRadio
          value={tweaks.layout}
          onChange={v => setTweak('layout', v)}
          options={[
            { value: 'classic',  label: 'Classic' },
            { value: 'cards',    label: 'Grid' },
            { value: 'timeline', label: 'Compact' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Progress style">
        <TweakRadio
          value={tweaks.progressStyle}
          onChange={v => setTweak('progressStyle', v)}
          options={[
            { value: 'bar',       label: 'Bar' },
            { value: 'circle',    label: 'Circle' },
            { value: 'segmented', label: 'Segments' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Accent">
        <TweakColor
          value={accentValueAsColor}
          onChange={c => setTweak('accent', accentMap[c.toUpperCase()] || accentMap[c])}
          options={accentColors}
        />
      </TweakSection>

      <TweakSection label="Density">
        <TweakRadio
          value={tweaks.density}
          onChange={v => setTweak('density', v)}
          options={[
            { value: 'cozy',    label: 'Cozy' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Theme">
        <TweakToggle
          value={tweaks.dark}
          onChange={v => setTweak('dark', v)}
          label="Dark mode"
        />
      </TweakSection>

      <TweakSection label="Jump to">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { id: 'onboarding', label: '👋 Onboarding' },
            { id: 'home',       label: '🏡 Home' },
            { id: 'packing',    label: '📦 Packing' },
            { id: 'docs',       label: '📑 Docs' },
            { id: 'tasks',      label: '🗓️ Timeline' },
            { id: 'budget',     label: '💰 Budget' },
            { id: 'shopping',   label: '🛍️ Shopping' },
            { id: 'housing',    label: '🏠 Housing' },
            { id: 'memory',     label: '💭 Memory' },
            { id: 'habits',     label: '🎯 Habits' },
            { id: 'map',        label: '🗺️ Map' },
            { id: 'people',     label: '👥 People' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setView(s.id)}
              style={{
                padding: '8px 10px', fontSize: 12,
                background: '#f4f4f4', borderRadius: 10,
                fontWeight: 500, textAlign: 'left',
                border: 'none',
              }}
            >{s.label}</button>
          ))}
        </div>
      </TweakSection>
    </TweaksPanel>
  );
}

// ---------- Bottom navigation ----------
const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     icon: 'House' },
  { id: 'packing',  label: 'Packing',   icon: 'Package' },
  { id: 'docs',     label: 'Documents', icon: 'FileText' },
  { id: 'tasks',    label: 'Timeline',  icon: 'CalendarDays' },
  { id: 'budget',   label: 'Budget',    icon: 'Wallet' },
  { id: 'shopping', label: 'Shopping',  icon: 'ShoppingCart' },
  { id: 'housing',  label: 'Housing',   icon: 'Building2' },
  { id: 'memory',   label: 'Memory',    icon: 'Camera' },
  { id: 'habits',   label: 'Habits',    icon: 'Target' },
  { id: 'map',      label: 'Map',       icon: 'Map' },
  { id: 'people',   label: 'People',    icon: 'Users' },
];

function BottomNav({ current, onNavigate }) {
  return (
    <div
      className="nav-scroll-fade"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 68, zIndex: 100,
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center',
        overflowX: 'auto', overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
        gap: 2, padding: '0 8px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {NAV_ITEMS.map(item => {
        const active = current === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 1, padding: '4px 6px',
              border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', flex: '0 0 auto',
              opacity: active ? 1 : 0.45,
              transition: 'opacity 0.15s',
            }}
          >
            <span style={{ display: 'inline-flex', color: active ? 'var(--terracotta)' : 'var(--dark)' }}>
              <AnimatedIcon name={item.icon} size={20} />
            </span>
            <span style={{
              fontSize: 8, fontWeight: 600, color: active ? 'var(--terracotta)' : 'var(--muted)',
              letterSpacing: '0.01em', whiteSpace: 'nowrap',
            }}>{item.label}</span>
            {active && (
              <div style={{
                width: 3, height: 3, borderRadius: '50%',
                background: 'var(--terracotta)', marginTop: 1,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Mount ----------
function Root() {
  return (
    <div data-screen-label="Suveda Move App" style={{ width: '100%', height: '100%' }}>
      <App />
    </div>
  );
}

// Expose Root on window for legacy-entry to mount
Object.assign(window, { Root });
