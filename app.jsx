// app.jsx — Main Suveda shell

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// Force SW update on page load — reloads if new version available
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

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
  if (Array.isArray(saved.housing)) {
    saved.housing = { rooms: [
      { id: 'living', label: 'Living Room', emoji: '🛋️', photos: [], tips: '' },
      { id: 'bedroom', label: 'Bedroom', emoji: '🛏️', photos: [], tips: '' },
      { id: 'kitchen', label: 'Kitchen', emoji: '🍳', photos: [], tips: '' },
      { id: 'bathroom', label: 'Bathroom', emoji: '🚿', photos: [], tips: '' },
      { id: 'balcony', label: 'Balcony / Entry', emoji: '🌿', photos: [], tips: '' },
    ]};
  }
  if (!saved.housing?.rooms) {
    saved.housing = saved.housing || { rooms: [] };
  }
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
        height: '100%', width: '100%',
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(at 20% 0%, rgba(212, 168, 83, 0.10) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, rgba(196, 113, 74, 0.08) 0%, transparent 50%)',
        color: 'var(--dark)',
        position: 'relative',
        paddingTop: 24,
        paddingBottom: 'calc(82px + env(safe-area-inset-bottom, 0))',
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
            right: 18, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--terracotta) 0%, var(--gold) 100%)',
            color: '#fff', fontSize: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px -6px rgba(196, 113, 74, 0.55), 0 4px 10px rgba(0,0,0,0.1)',
            zIndex: 50, border: 'none', cursor: 'pointer',
          }}
        ><img src="/huve-avatar.svg" width="42" height="42" alt="Huve" style={{ borderRadius: '50%' }} /></button>
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
const PRIMARY_NAV = [
  { id: 'home',    label: 'Home',      icon: 'House' },
  { id: 'packing', label: 'Packing',   icon: 'Package' },
  { id: 'docs',    label: 'Documents', icon: 'FileText' },
  { id: 'budget',  label: 'Budget',    icon: 'Wallet' },
];

const MORE_NAV = [
  { id: 'tasks',    label: 'Timeline', icon: 'CalendarDays' },
  { id: 'shopping', label: 'Shopping', icon: 'ShoppingCart' },
  { id: 'housing',  label: 'Housing',  icon: 'Building2' },
  { id: 'memory',   label: 'Memory',   icon: 'Camera' },
  { id: 'habits',   label: 'Habits',   icon: 'Target' },
  { id: 'map',      label: 'Map',      icon: 'Map' },
  { id: 'people',   label: 'People',   icon: 'Users' },
];

const NAV_ITEMS = [...PRIMARY_NAV, ...MORE_NAV];

function BottomNav({ current, onNavigate }) {
  const [isDesktop, setDesktop] = useState(window.innerWidth >= 640);
  const [playTriggers, setPlayTriggers] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = e => setDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const activeMoreItem = MORE_NAV.find(item => item.id === current);
  const displayItems = isDesktop ? NAV_ITEMS : PRIMARY_NAV;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: isDesktop ? 0 : 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
          left: isDesktop ? 0 : 12,
          right: isDesktop ? 0 : 12,
          height: isDesktop ? 68 : 66,
          boxSizing: 'border-box',
          paddingLeft: isDesktop ? 16 : 8,
          paddingRight: isDesktop ? 16 : 8,
          paddingBottom: isDesktop ? 'env(safe-area-inset-bottom, 0)' : 0,
          zIndex: 100,
          background: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: isDesktop ? '1px solid var(--line)' : 'none',
          border: isDesktop ? undefined : '1px solid rgba(0,0,0,0.07)',
          borderRadius: isDesktop ? 0 : 26,
          boxShadow: isDesktop ? 'none' : '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center',
          justifyContent: isDesktop ? 'center' : undefined,
          overflowX: 'hidden',
          overflowY: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-evenly',
          maxWidth: isDesktop ? 600 : 'none',
          width: '100%',
          gap: 0,
        }}>
          {displayItems.map(item => {
            const active = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setPlayTriggers(t => ({ ...t, [item.id]: (t[item.id] || 0) + 1 }));
                  onNavigate(item.id);
                }}
                onMouseEnter={() => setPlayTriggers(t => ({ ...t, [item.id]: (t[item.id] || 0) + 1 }))}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center',
                  gap: isDesktop ? 2 : 4,
                  padding: isDesktop ? '6px 10px' : '7px 10px',
                  flex: '1 1 0',
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: !isDesktop && active ? 'rgba(196, 113, 74, 0.13)' : 'transparent',
                  borderRadius: isDesktop ? 0 : 18,
                  opacity: active ? 1 : (isDesktop ? 0.5 : 0.42),
                  transition: 'background 0.18s, opacity 0.18s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: active ? 'var(--terracotta)' : 'var(--dark)',
                }}>
                  <AnimatedIcon name={item.icon} size={isDesktop ? 22 : 26} play={playTriggers[item.id] || 0} />
                </span>
                <span style={{
                  fontSize: isDesktop ? 10 : 11,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--terracotta)' : 'var(--muted)',
                  letterSpacing: '0.01em', whiteSpace: 'nowrap',
                  lineHeight: 1,
                }}>{item.label}</span>
              </button>
            );
          })}

          {!isDesktop && (
            <button
              onClick={() => setMoreOpen(o => !o)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '7px 10px',
                flex: '1 1 0',
                border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
                background: activeMoreItem ? 'rgba(196, 113, 74, 0.13)' : 'transparent',
                borderRadius: 18,
                opacity: activeMoreItem || moreOpen ? 1 : 0.42,
                transition: 'background 0.18s, opacity 0.18s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: activeMoreItem ? 'var(--terracotta)' : 'var(--dark)',
              }}>
                <AnimatedIcon
                  name={activeMoreItem ? activeMoreItem.icon : 'LayoutGrid'}
                  size={26}
                  play={0}
                />
              </span>
              <span style={{
                fontSize: 11, fontWeight: activeMoreItem ? 700 : 500,
                color: activeMoreItem ? 'var(--terracotta)' : 'var(--muted)',
                letterSpacing: '0.01em', whiteSpace: 'nowrap',
                lineHeight: 1,
              }}>{activeMoreItem ? activeMoreItem.label : 'More'}</span>
            </button>
          )}
        </div>
      </div>

      {!isDesktop && (
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" height="auto">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            padding: '4px 0 8px',
          }}>
            {MORE_NAV.map(item => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 8, padding: '16px 8px', borderRadius: 16,
                    background: active ? 'rgba(196, 113, 74, 0.10)' : 'rgba(0,0,0,0.04)',
                    border: `1.5px solid ${active ? 'rgba(196, 113, 74, 0.3)' : 'transparent'}`,
                    cursor: 'pointer', fontFamily: 'inherit',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ color: active ? 'var(--terracotta)' : 'var(--dark)' }}>
                    <AnimatedIcon name={item.icon} size={28} play={0} />
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    color: active ? 'var(--terracotta)' : 'var(--dark)',
                    lineHeight: 1,
                  }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---------- Error Boundary ----------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        React.createElement('div', {
          style: {
            padding: '40px 24px', fontFamily: 'inherit',
            color: 'var(--dark)', background: 'var(--cream)',
            minHeight: '100%', width: '100%',
          },
        },
          React.createElement('h2', { style: { fontSize: 18, marginBottom: 12 } }, 'Something went wrong'),
          React.createElement('pre', {
            style: { fontSize: 12, color: 'var(--terracotta)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
          }, this.state.error?.message || String(this.state.error)),
          React.createElement('button', {
            onClick: () => this.setState({ error: null }),
            style: {
              marginTop: 16, padding: '10px 20px', borderRadius: 10,
              border: '1px solid var(--line)', background: 'var(--white)',
              fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
            },
          }, 'Try again'),
        )
      );
    }
    return this.props.children;
  }
}

// ---------- Mount ----------
function Root() {
  return (
    <div data-screen-label="Suveda Move App" style={{ width: '100%', height: '100%' }}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}

// Expose Root on window for legacy-entry to mount
Object.assign(window, { Root });
