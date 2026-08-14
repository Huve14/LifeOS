// app.jsx — Main Life OS shell

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// Force SW update on page load — reloads if new version available.
// Deferred while a recording, upload or call is in flight, otherwise an update
// can destroy a clip that has not reached the server yet.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__lifeosBusy) {
      window.__lifeosPendingReload = true;
      return;
    }
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
  saved.budget = window.__lifeos?.budget?.upgradeBudget?.(saved.budget) || saved.budget;

  // Retire the original departure checklist without touching anything the
  // user added herself. Known starter records keep their completion state and
  // attachments while receiving current UAE-life copy.
  const currentDocuments = new Map((SEED.documents || []).map(document => [document.id, document]));
  saved.documents = (saved.documents || []).map(document => {
    const current = currentDocuments.get(document.id);
    return current ? { ...document, name: current.name, note: current.note, emoji: current.emoji } : document;
  });

  const retiredTaskIds = new Set(Array.from({ length: 14 }, (_, index) => `t${index + 1}`));
  const currentTasks = new Map((SEED.tasks || []).map(task => [task.id, task]));
  const keptTasks = (saved.tasks || [])
    .filter(task => !retiredTaskIds.has(task.id))
    .map(task => {
      const current = currentTasks.get(task.id);
      return current ? { ...task, text: current.text, when: current.when } : task;
    });
  const keptTaskIds = new Set(keptTasks.map(task => task.id));
  saved.tasks = [
    ...keptTasks,
    ...(SEED.tasks || []).filter(task => !keptTaskIds.has(task.id)).map(task => ({ ...task })),
  ];
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
  accent: 'terracotta',       // legacy keys retained for persisted tweak values
  density: 'cozy',            // cozy | compact
  layout: 'classic',          // classic | cards | timeline
  progressStyle: 'bar',       // bar | circle | segmented
  dark: false,
};

// Face ID gate. Only ever active in the native app with the lock switched on;
// in a browser lockAvailability reports unavailable and this renders nothing.
function useAppLock() {
  const api = window.__lifeos;
  const [state, setState] = useState('checking'); // checking | open | locked

  const attempt = useCallback(async () => {
    const result = await api?.lock.unlock('Unlock Life OS');
    if (result === 'unlocked' || result === 'unavailable') {
      api?.lock.markUnlocked();
      setState('open');
    } else {
      setState('locked');
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const enabled = await api?.lock.isLockEnabled();
      if (cancelled) return;
      if (!enabled) { setState('open'); return; }
      await attempt();
    }

    void check();

    // Re-lock after a spell in the background, not on every glance away.
    const onResume = () => {
      void (async () => {
        const enabled = await api?.lock.isLockEnabled();
        if (enabled && api?.lock.needsUnlock()) setState('locked');
      })();
    };
    window.addEventListener('lifeos:resumed', onResume);
    return () => {
      cancelled = true;
      window.removeEventListener('lifeos:resumed', onResume);
    };
  }, [api, attempt]);

  return { state, attempt };
}

function LockScreen({ onUnlock }) {
  return (
    <div style={{
      minHeight: '100%', width: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
      background: 'var(--cream)', padding: '40px 24px',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 24,
        background: 'linear-gradient(135deg, var(--honey) 0%, var(--blue) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 32,
      }}>🔒</div>
      <h1 style={{ fontSize: 20 }}>Life OS is locked</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
        Unlock to see your notes and answers.
      </p>
      <Button onClick={onUnlock}>Unlock</Button>
    </div>
  );
}

function App() {
  // Browser call invitations are guest-first: resolve them before auth and
  // onboarding so a recipient never needs a Life OS account or app install.
  const callInviteMatch = window.location.pathname.match(/^\/join\/([^/]+)/);
  if (callInviteMatch) {
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    return (
      <GuestCallScreen
        inviteToken={decodeURIComponent(callInviteMatch[1])}
        initialMode={requestedMode === 'video' ? 'video' : 'audio'}
      />
    );
  }

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

  // A local-only visual fixture for responsive browser QA. Vite removes this
  // branch from production builds because import.meta.env.DEV is false there.
  const previewParams = new URLSearchParams(window.location.search);
  const previewHome = import.meta.env.DEV && previewParams.has('preview-home');
  const previewCall = import.meta.env.DEV && previewParams.has('preview-call');
  const previewGames = import.meta.env.DEV && previewParams.has('preview-games');
  const previewSession = previewHome || previewCall || previewGames;
  const requestedGameCode = (previewParams.get('game') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const previewDark = import.meta.env.DEV && previewParams.has('preview-dark');
  const previewEmail = previewParams.get('preview-email') || 'demo@lifeos.app';
  const previewUser = previewSession ? { id: 'visual-preview', email: previewEmail, user_metadata: { name: 'Demo User' } } : null;

  const [tweaks, setTweak] = useTweaks(previewDark ? { ...DEFAULT_TWEAKS, dark: true } : DEFAULT_TWEAKS);
  const store = window.__suvedaStore;
  const [storageReady, setStorageReady] = useState(false);

  // Auth state
  const [user, setUser] = useState(previewUser || window.__suvedaUser || null);
  const [authReady, setAuthReady] = useState(previewSession || !!window.__suvedaUser);
  const [profile, setProfile] = useState(previewSession ? {
    user_id: 'visual-preview', display_name: 'Demo User', handle: 'demo_user', time_zone: 'Asia/Dubai',
  } : null);

  useEffect(() => {
    if (previewSession) return undefined;
    const unsub = window.__suvedaAuth?.onAuthChange((u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, [previewSession]);

  useEffect(() => {
    let cancelled = false;
    if (previewSession || !user?.id) {
      if (!previewSession) setProfile(null);
      return undefined;
    }
    void window.__suvedaAuth?.profile?.().then(nextProfile => {
      if (!cancelled) setProfile(nextProfile);
    });
    return () => { cancelled = true; };
  }, [previewSession, user?.id]);

  const lock = useAppLock();

  // App state
  const [view, setView] = useState(null); // null=loading | onboarding | home | packing | docs | tasks | budget | shopping | housing
  const [callLaunch, setCallLaunch] = useState({ id: 0, mode: 'video' });
  const [state, setState] = useState(() => createSeedState(tweaks));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [celebrate, setCelebrate] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState({ status: 'idle', message: 'Sync now', detail: '' });
  const lastPctRef = useRef(0);
  const syncResetRef = useRef(null);

  useEffect(() => () => clearTimeout(syncResetRef.current), []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (previewSession) {
        setState({
          ...createSeedState({ ...tweaks, progressLevel: 'empty' }),
          moveDate: '2026-08-10',
          onboardingDone: true,
        });
        setView(previewCall ? 'call' : previewGames ? 'games' : 'home');
        setStorageReady(true);
        return;
      }
      if (!user?.id) {
        setState(createSeedState(tweaks));
        setView('onboarding');
        setStorageReady(true);
        return;
      }
      setStorageReady(false);
      try {
        const saved = await store?.loadAppState?.();
        if (cancelled) return;
        const restored = pickStoredState(saved);
        if (restored) {
          setState(restored);
          setView(restored.onboardingDone ? 'map' : 'onboarding');
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
  }, [previewCall, previewGames, previewSession, store, user?.id]);

  const gameInviteHandledRef = useRef(false);
  useEffect(() => {
    if (!user?.id || !storageReady || requestedGameCode.length !== 6 || gameInviteHandledRef.current) return;
    gameInviteHandledRef.current = true;
    setView('games');
  }, [requestedGameCode, storageReady, user?.id]);

  useEffect(() => {
    if (previewSession || !user?.id || !storageReady || !store?.saveAppState) return;
    const timer = setTimeout(() => {
      void store.saveAppState(state).catch(error => {
        setSyncFeedback(current => current.status === 'syncing' ? current : {
          status: 'error',
          message: 'Sync failed',
          detail: error instanceof Error ? error.message : 'Supabase did not save the latest changes.',
        });
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [previewSession, state, storageReady, store, user?.id]);

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

  // A tapped notification names the screen it was about.
  useEffect(() => {
    function onOpenScreen(event) {
      const screen = event.detail?.screen;
      if (screen) setView(screen);
    }
    window.addEventListener('lifeos:open-screen', onOpenScreen);
    return () => window.removeEventListener('lifeos:open-screen', onOpenScreen);
  }, []);

  // Keep the native status bar legible against the app background.
  useEffect(() => {
    void window.__lifeos?.native.setStatusBarForTheme(tweaks.dark);
  }, [tweaks.dark]);

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

  function openModule(id, options = {}) {
    if (id === 'call' && options.autoStart) {
      setCallLaunch(current => ({
        id: current.id + 1,
        mode: options.mode === 'audio' ? 'audio' : 'video',
      }));
    }
    setView(id);
  }

  async function syncNow() {
    if (syncFeedback.status === 'syncing') return;
    clearTimeout(syncResetRef.current);
    setSyncFeedback({ status: 'syncing', message: 'Syncing', detail: 'Saving your latest changes to Supabase.' });

    try {
      const result = previewSession
        ? await new Promise(resolve => setTimeout(() => resolve({ sent: 0, pending: 0 }), 650))
        : await window.__lifeos.sync.syncNow(() => store.saveAppState(state));
      const message = result.sent > 0
        ? `${result.sent} ${result.sent === 1 ? 'item' : 'items'} synced`
        : 'Synced now';
      setSyncFeedback({ status: 'success', message, detail: 'Supabase has the latest version of your Life OS.' });
      void window.__lifeos?.native.notifyHaptic('success');
      syncResetRef.current = setTimeout(() => {
        setSyncFeedback({ status: 'idle', message: 'Sync now', detail: '' });
      }, 2200);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Supabase could not be reached.';
      const offline = /offline|network|failed to fetch/i.test(detail);
      setSyncFeedback({
        status: offline ? 'offline' : 'error',
        message: offline ? 'You’re offline' : 'Sync failed',
        detail,
      });
      void window.__lifeos?.native.notifyHaptic('error');
    }
  }

  function renderContent() {
    if (view === 'onboarding') {
      return <Onboarding user={user} initialDate={tweaks.moveDate} onDone={({ moveDate }) => {
        setTweak('moveDate', moveDate);
        setState(s => ({ ...s, moveDate, onboardingDone: true }));
        setView('map');
      }} />;
    }

    const screens = {
      home:    <Dashboard state={state} setState={setState} onAsk={openAi}
                onModule={openModule}
                layout={tweaks.layout} progressStyle={tweaks.progressStyle}
                syncStatus={syncFeedback.status === 'syncing'
                  ? 'Syncing to Supabase…'
                  : syncFeedback.status === 'success'
                    ? syncFeedback.message
                    : syncFeedback.status === 'error' || syncFeedback.status === 'offline'
                      ? 'Sync needs attention'
                      : storageReady ? (store?.hasConfig ? 'Supabase ready' : 'Local draft') : 'Connecting…'}
                syncFeedback={syncFeedback}
                onSync={syncNow}
                syncDisabled={!previewSession && (!storageReady || !store?.hasConfig || !user?.id)}
                userName={displayName}
                userEmail={user?.email || ''} />,
      settings:<SettingsScreen
                profile={profile}
                email={user?.email || ''}
                onProfileChange={setProfile}
                onBack={() => setView('home')}
                onLoggedOut={() => setView('onboarding')} />,
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
      notes:   <NotesJournalScreen state={state} setState={setState} onBack={() => setView('home')} />,
      journal: <VideoJournalScreen onBack={() => setView('home')} />,
      prompt:  <DailyPromptScreen onBack={() => setView('home')} />,
      trip:    <TripBoardScreen onBack={() => setView('home')} />,
      space:   <SpaceScreen onBack={() => setView('home')} />,
      call:    <CallScreen
                launch={callLaunch}
                onLaunchHandled={() => setCallLaunch(current => ({ ...current, id: 0 }))}
                onBack={() => setView('home')}
                onRecordInstead={() => {
                  // Phase 4 falling back into Phase 1: land on the journal
                  // with the recorder already open.
                  window.dispatchEvent(new CustomEvent('lifeos:record-video-note'));
                  setView('journal');
                }} />,
      games:   <GamesScreen
                profile={profile}
                initialCode={requestedGameCode}
                demo={previewGames}
                onBack={() => setView('home')} />,
    };
    return screens[view] || screens.home;
  }

  // Derive user info for display
  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

  if (lock.state === 'locked') {
    return <LockScreen onUnlock={lock.attempt} />;
  }

  if (!authReady || !storageReady || lock.state === 'checking') {
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
      setView('map');
    }} />;
  }

  return (
    <div
      className="app"
      data-dark={tweaks.dark}
      data-density={tweaks.density}
      style={{
        ...appStyle,
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(at 20% 0%, rgba(246, 209, 16, 0.16) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, rgba(129, 206, 235, 0.20) 0%, transparent 50%)',
        color: 'var(--dark)',
        position: 'relative',
      }}
    >
      {renderContent()}

      {/* Floating Ask Huve button (hidden during onboarding) */}
      {view !== 'onboarding' && view !== 'settings' && view !== 'games' && (
        <button
          onClick={() => openAi()}
          className="ai-launcher ai-pulse"
          aria-label="Ask Huve"
          style={{
            background: 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
            boxShadow: '0 8px 24px -6px rgba(45, 114, 139, 0.5), 0 4px 10px rgba(0,0,0,0.1)',
          }}
          ><img src="/huve-avatar.jpg" width="42" height="42" alt="Huve" style={{ borderRadius: '50%', objectFit: 'cover' }} /></button>
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
      <LifeOSTweaks tweaks={tweaks} setTweak={setTweak} setView={setView} />
    </div>
  );
}

function LifeOSTweaks({ tweaks, setTweak, setView }) {
  // The stored keys are kept for backwards compatibility; the swatches use the new palette.
  const accentMap = { '#F6D110': 'terracotta', '#81CEEB': 'teal', '#FFF9C7': 'gold' };
  const accentColors = ['#F6D110', '#81CEEB', '#FFF9C7'];
  const accentValueAsColor = { terracotta: '#F6D110', teal: '#81CEEB', gold: '#FFF9C7' }[tweaks.accent];

  return (
    <TweaksPanel title="Life OS Tweaks">
      <TweakSection label="UAE start date">
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
            { id: 'notes',      label: '📓 Journal' },
            { id: 'journal',    label: '🎥 Video' },
            { id: 'prompt',     label: '💬 Prompt' },
            { id: 'trip',       label: '🧳 Trip' },
            { id: 'call',       label: '📞 Call' },
            { id: 'games',      label: '🎲 Games' },
            { id: 'space',      label: '💞 Pairing' },
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

function SettingsScreen({ profile, email, onProfileChange, onBack, onLoggedOut }) {
  const [name, setName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(profile?.display_name || '');
  }, [profile?.display_name]);

  async function saveProfile(event) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const updated = await window.__suvedaAuth?.updateProfile?.({ display_name: name });
      if (updated) onProfileChange(updated);
      setMessage('Your name has been updated.');
    } catch (error) {
      setMessage(error?.message || 'Your profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setMessage('');
    setLoggingOut(true);
    try {
      await window.__suvedaAuth?.signOut?.();
      onLoggedOut();
    } catch (error) {
      setMessage(error?.message || 'Could not log out. Please try again.');
      setLoggingOut(false);
    }
  }

  return (
    <ModulePage title="Settings" subtitle="Your Life OS account" icon="Settings" onBack={onBack}>
      <Card padding="20px" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 18,
            background: 'linear-gradient(135deg, var(--honey), var(--blue))',
            display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800,
            color: '#17272D', flexShrink: 0,
          }}>
            {(profile?.display_name || email || 'L').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 750 }}>{profile?.display_name || 'Your account'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere', marginTop: 2 }}>{email}</div>
            {profile?.handle && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 4 }}>@{profile.handle}</div>}
          </div>
        </div>

        <form onSubmit={saveProfile}>
          <label htmlFor="settings-display-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
            Display name
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="settings-display-name"
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={80}
              required
              style={{
                flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 12,
                border: '1px solid var(--line)', background: 'var(--cream)',
                color: 'var(--dark)', font: 'inherit', fontSize: 14,
              }}
            />
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Card>

      <Card padding="20px" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 8 }}>
          Privacy
        </div>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Your data stays with your account</h3>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Your profile, dashboard, chat and personal lists are isolated from every other Life OS account by database access rules.
        </p>
        <FaceIdRow />
      </Card>

      {message && (
        <div role="status" style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 2px 12px' }}>{message}</div>
      )}

      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        style={{
          width: '100%', padding: '14px 18px', borderRadius: 14,
          border: '1px solid rgba(168,66,66,0.28)', background: 'var(--white)',
          color: '#A84242', font: 'inherit', fontSize: 14, fontWeight: 750,
          cursor: loggingOut ? 'wait' : 'pointer', opacity: loggingOut ? 0.65 : 1,
        }}
      >
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </ModulePage>
  );
}

// ---------- Bottom navigation ----------
const PRIMARY_NAV = [
  { id: 'home',    label: 'Home',      icon: 'House' },
  { id: 'map',     label: 'Map',       icon: 'Map' },
  { id: 'docs',    label: 'Docs',      icon: 'FileText' },
  { id: 'budget',  label: 'Budget',    icon: 'Wallet' },
];

const MORE_NAV = [
  { id: 'settings', label: 'Settings', icon: 'Settings' },
  { id: 'notes',    label: 'Journal',  icon: 'NotebookPen' },
  { id: 'journal',  label: 'Video',    icon: 'Video' },
  { id: 'packing',  label: 'Packing',  icon: 'Package' },
  { id: 'prompt',   label: 'Prompt',   icon: 'MessageCircle' },
  { id: 'trip',     label: 'Trip',     icon: 'Luggage' },
  { id: 'call',     label: 'Call',     icon: 'Phone' },
  { id: 'games',    label: 'Games',    icon: 'Gamepad2' },
  { id: 'tasks',    label: 'Timeline', icon: 'CalendarDays' },
  { id: 'shopping', label: 'Shopping', icon: 'ShoppingCart' },
  { id: 'housing',  label: 'Housing',  icon: 'Building2' },
  { id: 'memory',   label: 'Memory',   icon: 'Camera' },
  { id: 'habits',   label: 'Habits',   icon: 'Target' },
  { id: 'people',   label: 'People',   icon: 'Users' },
  { id: 'space',    label: 'Pairing',  icon: 'Heart' },
];

// Which nav entries currently have something waiting.
function navNeedsAttention(id, unwatched, promptWaiting) {
  if (id === 'journal') return unwatched > 0;
  if (id === 'prompt') return promptWaiting;
  return false;
}

function moreNeedsAttention(current, unwatched, promptWaiting) {
  const journal = unwatched > 0 && current !== 'journal';
  const prompt = promptWaiting && current !== 'prompt';
  return journal || prompt;
}

// Small dot for "there is something waiting here".
function NavDot({ show, offset = 4 }) {
  if (!show) return null;
  return (
    <span style={{
      position: 'absolute', top: offset, right: offset,
      width: 9, height: 9, borderRadius: '50%',
      background: 'var(--honey)',
      border: '2px solid var(--white)',
    }} />
  );
}

function FaceIdRow() {
  const api = window.__lifeos;
  const [label, setLabel] = useState(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const availability = await api?.lock.lockAvailability();
      if (cancelled || !availability?.available) return;
      setLabel(availability.label);
      setEnabled(await api.lock.isLockEnabled());
    })();
    return () => { cancelled = true; };
  }, [api]);

  if (!label) return null;

  async function toggle() {
    const next = !enabled;
    // Prove it works before switching it on, so nobody locks themselves out.
    if (next) {
      const result = await api.lock.unlock(`Turn on ${label}`);
      if (result !== 'unlocked') return;
      api.lock.markUnlocked();
    }
    await api.lock.setLockEnabled(next);
    setEnabled(next);
    void api.native.tap('light');
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '14px 4px', marginTop: 8, borderTop: '1px solid var(--line)',
        background: 'none', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 18 }}>🔒</span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--dark)' }}>
        Require {label}
      </span>
      <span style={{
        width: 44, height: 26, borderRadius: 999, flexShrink: 0,
        background: enabled ? 'var(--blue)' : 'var(--line)',
        display: 'flex', alignItems: 'center',
        padding: 3, transition: 'background 0.18s',
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transform: enabled ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 0.18s',
        }} />
      </span>
    </button>
  );
}

function BottomNav({ current, onNavigate }) {
  const [playTriggers, setPlayTriggers] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const unwatched = useUnwatchedCount();
  const promptWaiting = useUnansweredToday();

  const activeMoreItem = MORE_NAV.find(item => item.id === current);

  return (
    <>
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-inner">
          {PRIMARY_NAV.map(item => {
            const active = current === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`bottom-nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                onClick={() => {
                  setPlayTriggers(t => ({ ...t, [item.id]: (t[item.id] || 0) + 1 }));
                  onNavigate(item.id);
                }}
                onMouseEnter={() => setPlayTriggers(t => ({ ...t, [item.id]: (t[item.id] || 0) + 1 }))}
              >
                <span className="bottom-nav-icon">
                  <AnimatedIcon name={item.icon} size={26} play={playTriggers[item.id] || 0} />
                </span>
                <span className="bottom-nav-label">{item.label}</span>
                <NavDot show={navNeedsAttention(item.id, unwatched, promptWaiting)} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            className={`bottom-nav-item${activeMoreItem || moreOpen ? ' is-active' : ''}`}
            aria-expanded={moreOpen}
            aria-label={activeMoreItem ? `${activeMoreItem.label}, more destinations` : 'More destinations'}
          >
            <span className="bottom-nav-icon">
              <AnimatedIcon
                name={activeMoreItem ? activeMoreItem.icon : 'LayoutGrid'}
                size={26}
                play={0}
              />
            </span>
            <span className="bottom-nav-label">{activeMoreItem ? activeMoreItem.label : 'More'}</span>
            <NavDot show={moreNeedsAttention(current, unwatched, promptWaiting)} />
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" height="auto">
          <div className="bottom-nav-more-grid">
            {MORE_NAV.map(item => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`bottom-nav-more-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                >
                  <span className="bottom-nav-more-icon">
                    <AnimatedIcon name={item.icon} size={28} play={0} />
                  </span>
                  <span className="bottom-nav-more-label">{item.label}</span>
                  <NavDot show={navNeedsAttention(item.id, unwatched, promptWaiting)} offset={8} />
                </button>
              );
            })}
          </div>
          <FaceIdRow />
      </Sheet>
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
    <div data-screen-label="Life OS App" style={{ width: '100%', height: '100%' }}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </div>
  );
}

// Expose Root on window for legacy-entry to mount
Object.assign(window, { Root });
