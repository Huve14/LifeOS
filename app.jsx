// app.jsx — Main Life OS shell

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// Live audio and video calling is hidden unless a deployment opts in. The UAE
// reserves consumer VoIP for licensed operators, so every call entry point in
// this shell — the route, the dock, the More menu, the developer jump list and
// the browser invitation link — is gated on this one flag. See
// src/lifeos/features.ts and docs/CALLS.md.
const CALLS_ENABLED = window.__lifeos.features.CALLS_ENABLED;

function createSeedState(tweaks) {
  return {
    moveDate: tweaks.moveDate,
    ...applyProgress(SEED, tweaks.progressLevel),
    habits: SEED.habits || [],
    journal: [],
    preferences: window.__lifeos?.preferences.preparePreferences(),
    // A fresh account must finish the three-screen introduction once. This
    // flag is persisted in the account's private state, so confirmation-link
    // sign-ups still land in the tour on their first authenticated visit.
    onboardingDone: false,
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
  saved.preferences = window.__lifeos?.preferences.preparePreferences(saved.preferences);
  // Existing accounts pre-date the first-run flag and should continue to go
  // straight home. New accounts are explicitly seeded with `false` above.
  if (!Object.prototype.hasOwnProperty.call(saved, 'onboardingDone')) saved.onboardingDone = true;
  if (!Object.prototype.hasOwnProperty.call(saved, 'nextFlight')) saved.nextFlight = null;
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

// A saved /join/<token> invitation can still be opened after calling was
// switched off. Answer it plainly instead of loading the call bundle.
function CallingUnavailable() {
  return (
    <div className="app" style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      padding: 'clamp(18px, 5vw, 48px)', background: 'var(--cream)', color: 'var(--dark)',
    }}>
      <main style={{ width: 'min(100%, 420px)', textAlign: 'center' }} role="alert">
        <div style={{
          width: 68, height: 68, margin: '0 auto 18px', borderRadius: 24,
          display: 'grid', placeItems: 'center', fontSize: 28,
          background: 'var(--sand)',
        }} aria-hidden="true">☎</div>
        <h1 style={{ fontSize: 'clamp(21px, 6vw, 28px)', marginBottom: 10 }}>
          Calling is unavailable
        </h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: 13, marginBottom: 22 }}>
          {window.__lifeos.features.CALLS_DISABLED_NOTICE} You can still send a
          video note or a message from inside Life OS.
        </p>
        <Button onClick={() => { window.location.href = '/'; }}>Open Life OS</Button>
      </main>
    </div>
  );
}

// Feature screens are legacy global modules, but they do not need to occupy
// memory before the user opens them. Keep one promise per bundle so taps,
// pointer preloads and repeated visits always share the same request.
const LEGACY_BUNDLE_LOADERS = {
  modules: () => import('./screens-modules.jsx'),
  tasks: () => Promise.all([
    import('./screens-modules.jsx'),
    import('./src/components/ui/glass-calendar.jsx'),
  ]),
  memory: () => Promise.all([
    import('./screens-modules.jsx'),
    import('./src/components/ui/memory-photo-grid.jsx'),
  ]),
  map: () => Promise.all([
    import('./src/components/ui/map-utils.jsx'),
    import('./screens-map.jsx'),
  ]),
  community: () => import('./community.jsx'),
  toolkit: () => import('./toolkit.jsx'),
  journal: () => import('./video-journal.jsx'),
  prompt: () => import('./daily-prompt.jsx'),
  trip: () => import('./trip-board.jsx'),
  ...(CALLS_ENABLED ? { call: () => import('./call.jsx') } : {}),
  games: () => import('./games.jsx'),
  space: () => import('./space.jsx'),
  shared: () => import('./shared-list.jsx'),
};

const VIEW_BUNDLES = {
  packing: 'modules', docs: 'modules', tasks: 'tasks', budget: 'modules',
  shopping: 'modules', housing: 'modules', habits: 'modules', people: 'modules',
  memory: 'memory', map: 'map', journal: 'journal',
  community: 'community',
  toolkit: 'toolkit',
  prompt: 'prompt', trip: 'trip', games: 'games', space: 'space',
  ...(CALLS_ENABLED ? { call: 'call' } : {}),
};

const legacyBundlePromises = new Map();
const readyLegacyBundles = new Set();

function loadLegacyBundle(bundle) {
  if (readyLegacyBundles.has(bundle)) return Promise.resolve();
  if (legacyBundlePromises.has(bundle)) return legacyBundlePromises.get(bundle);
  const promise = LEGACY_BUNDLE_LOADERS[bundle]()
    .then(() => { readyLegacyBundles.add(bundle); })
    .catch(error => {
      legacyBundlePromises.delete(bundle);
      throw error;
    });
  legacyBundlePromises.set(bundle, promise);
  return promise;
}

function preloadLegacyView(view) {
  const bundle = VIEW_BUNDLES[view];
  if (bundle) void loadLegacyBundle(bundle).catch(() => {});
}

function LazyLegacyScreen({ bundle, componentName, screenProps = {} }) {
  const [status, setStatus] = useState(() => readyLegacyBundles.has(bundle) ? 'ready' : 'loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (readyLegacyBundles.has(bundle)) {
      setStatus('ready');
      return () => { active = false; };
    }
    setStatus('loading');
    void loadLegacyBundle(bundle).then(() => {
      if (active) setStatus('ready');
    }).catch(nextError => {
      if (!active) return;
      setError(nextError?.message || 'This feature could not be opened.');
      setStatus('error');
    });
    return () => { active = false; };
  }, [bundle]);

  if (status === 'error') {
    return (
      <div className="feature-loader" role="alert">
        <strong>Could not open this feature</strong>
        <span>{error}</span>
        <button type="button" onClick={() => {
          setError('');
          setStatus('loading');
          // A retry that fails again has to land back on the error card. Without
          // the catch it left the screen on "Opening…" for good.
          void loadLegacyBundle(bundle).then(() => setStatus('ready'), nextError => {
            setError(nextError?.message || 'This feature could not be opened.');
            setStatus('error');
          });
        }}>Try again</button>
      </div>
    );
  }

  const Screen = window[componentName];
  if (status !== 'ready' || !Screen) {
    return (
      <div className="feature-loader" role="status" aria-live="polite">
        <i aria-hidden="true" />
        <strong>Opening…</strong>
      </div>
    );
  }

  return <Screen {...screenProps} />;
}

function App() {
  // Browser call invitations are guest-first: resolve them before auth and
  // onboarding so a recipient never needs a Life OS account or app install.
  const callInviteMatch = window.location.pathname.match(/^\/join\/([^/]+)/);
  if (callInviteMatch) {
    if (!CALLS_ENABLED) return <CallingUnavailable />;
    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    return (
      <LazyLegacyScreen
        bundle="call"
        componentName="GuestCallScreen"
        screenProps={{
          inviteToken: decodeURIComponent(callInviteMatch[1]),
          initialMode: requestedMode === 'video' ? 'video' : 'audio',
        }}
      />
    );
  }

  // Shared shopping list route — handle both hash (#shared/TOKEN) and path (/s/TOKEN) formats.
  // Path format catches cases where the old SW intercepts /s/ and serves index.html.
  const pathMatch = window.location.pathname.match(/^\/s\/(.+)/);
  if (pathMatch) {
    return <LazyLegacyScreen bundle="shared" componentName="SharedList" screenProps={{ token: pathMatch[1] }} />;
  }
  const hash = window.location.hash;
  if (hash.startsWith('#shared/')) {
    return <LazyLegacyScreen bundle="shared" componentName="SharedList" screenProps={{ token: hash.replace('#shared/', '') }} />;
  }

  // A local-only visual fixture for responsive browser QA. Vite removes this
  // branch from production builds because import.meta.env.DEV is false there.
  const previewParams = new URLSearchParams(window.location.search);
  const previewHome = import.meta.env.DEV && previewParams.has('preview-home');
  const previewCall = import.meta.env.DEV && CALLS_ENABLED && previewParams.has('preview-call');
  const previewGames = import.meta.env.DEV && previewParams.has('preview-games');
  const previewPairing = import.meta.env.DEV && previewParams.has('preview-pairing');
  const previewTasks = import.meta.env.DEV && previewParams.has('preview-tasks');
  const previewTrip = import.meta.env.DEV && previewParams.has('preview-trip');
  const previewCommunity = import.meta.env.DEV && previewParams.has('preview-community');
  const previewOnboarding = import.meta.env.DEV && previewParams.has('preview-onboarding');
  const previewLite = import.meta.env.DEV && previewParams.has('preview-lite');
  const previewSession = previewHome || previewCall || previewGames || previewPairing || previewTasks || previewTrip || previewCommunity || previewOnboarding;
  const requestedGameCode = (previewParams.get('game') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const requestedPairCode = window.__lifeos.couples.normalizePairCode(previewParams.get('pair') || '');
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
    home_town: 'Cape Town', emirate: 'Abu Dhabi', arrived_on: '2026-08-10', status: 'just_landed',
    interests: ['food', 'travel'], visible_in_directory: false, employer_name: null,
    ai_profile: {
      home_base: 'Abu Dhabi', priorities: 'Build a calm weekly rhythm', interests: 'Food, travel and photography',
      response_style: 'warm_practical', daily_rhythm: 'flexible', notes: '',
    },
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

  useEffect(() => {
    window.__lifeosAIProfile = profile?.ai_profile || user?.user_metadata?.ai_profile || {};
    window.__suvedaDestination = profile?.emirate || profile?.ai_profile?.home_base || 'Abu Dhabi';
    return () => {
      window.__lifeosAIProfile = {};
      window.__suvedaDestination = '';
    };
  }, [profile?.ai_profile, profile?.emirate, user?.user_metadata?.ai_profile]);

  const lock = useAppLock();

  // App state
  const [view, setView] = useState(null); // null=loading | onboarding | home | packing | docs | tasks | budget | shopping | housing
  const [callLaunch, setCallLaunch] = useState({ id: 0, mode: 'video' });
  const [state, setState] = useState(() => createSeedState(tweaks));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState('');
  const preferences = useMemo(
    () => window.__lifeos.preferences.preparePreferences(state.preferences),
    [state.preferences],
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  ));
  const appDark = preferences.colorMode === 'system'
    ? systemPrefersDark
    : preferences.colorMode === 'dark';
  const devicePerformanceMode = useMemo(
    () => window.__lifeos.performance.getPerformanceMode(),
    [],
  );
  const performanceMode = previewLite || preferences.motion === 'reduced' ? 'lite' : devicePerformanceMode;
  const [celebrate, setCelebrate] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState({ status: 'idle', message: 'Sync now', detail: '' });
  // Null until the first settled state establishes a baseline. Starting at 0
  // meant restoring an account that already had a finished module counted as a
  // completion, so the confetti fired on every launch.
  const lastPctRef = useRef(null);
  const syncResetRef = useRef(null);
  const celebrateRef = useRef(null);

  useEffect(() => () => clearTimeout(syncResetRef.current), []);
  useEffect(() => () => clearTimeout(celebrateRef.current), []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = event => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    window.__lifeosPreferences = preferences;
    return () => {
      window.__lifeosPreferences = undefined;
    };
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (previewSession) {
        setState({
          ...createSeedState({ ...tweaks, progressLevel: 'empty' }),
          moveDate: '2026-08-10',
          onboardingDone: !previewOnboarding,
        });
        setView(previewOnboarding ? 'onboarding' : previewCall ? 'call' : previewGames ? 'games' : previewPairing ? 'space' : previewTasks ? 'tasks' : previewTrip ? 'trip' : previewCommunity ? 'community' : 'home');
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
          setView(restored.onboardingDone ? 'home' : 'onboarding');
        } else {
          setState(createSeedState(tweaks));
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
  }, [previewCall, previewCommunity, previewGames, previewOnboarding, previewPairing, previewSession, previewTasks, previewTrip, store, user?.id]);

  const gameInviteHandledRef = useRef(false);
  useEffect(() => {
    if (!user?.id || !storageReady || requestedGameCode.length !== 6 || gameInviteHandledRef.current) return;
    gameInviteHandledRef.current = true;
    setView('games');
  }, [requestedGameCode, storageReady, user?.id]);

  const pairInviteHandledRef = useRef(false);
  useEffect(() => {
    if (!user?.id || !storageReady || requestedPairCode.length !== 12 || pairInviteHandledRef.current) return;
    pairInviteHandledRef.current = true;
    setView('space');
  }, [requestedPairCode, storageReady, user?.id]);

  useEffect(() => {
    if (previewSession || !user?.id || !storageReady || !store?.saveAppState) return;
    const timer = setTimeout(() => {
      void store.saveAppState(state).catch(error => {
        setSyncFeedback(current => current.status === 'syncing' ? current : {
          status: 'error',
          message: 'Sync failed',
          detail: error instanceof Error ? error.message : 'Your latest changes could not be saved.',
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
    // Wait for the account's own state to land. Anything before that is the
    // seed, and comparing the two would celebrate work finished days ago.
    if (!storageReady) {
      lastPctRef.current = null;
      return;
    }
    const mp = moduleProgress(state);
    const completed = Object.entries(mp).filter(([, v]) => v.total > 0 && v.done === v.total && !v.isMoney).length;
    const previous = lastPctRef.current;
    lastPctRef.current = completed;
    if (previous === null || completed <= previous) return;

    clearTimeout(celebrateRef.current);
    setCelebrate(true);
    celebrateRef.current = setTimeout(() => setCelebrate(false), 3500);
  }, [state, storageReady]);

  // A tapped notification names the screen it was about.
  useEffect(() => {
    function onOpenScreen(event) {
      const screen = event.detail?.screen;
      if (screen === 'call' && !CALLS_ENABLED) return;
      if (screen) setView(screen);
    }
    window.addEventListener('lifeos:open-screen', onOpenScreen);
    return () => window.removeEventListener('lifeos:open-screen', onOpenScreen);
  }, []);

  // Keep the native status bar legible against the app background.
  useEffect(() => {
    void window.__lifeos?.native.setStatusBarForTheme(appDark);
  }, [appDark]);

  // Map accent tweak to CSS variable
  const accentMap = {
    terracotta: 'var(--terracotta)',
    teal: 'var(--teal)',
    gold: 'var(--gold)',
  };

  // Apply theme attrs to root .app
  const appStyle = {
    '--accent': accentMap[tweaks.accent],
    ...window.__lifeos.preferences.getThemeTokens(preferences.palette, appDark),
    '--radius': preferences.cornerStyle === 'square' ? '10px' : preferences.cornerStyle === 'soft' ? '16px' : '22px',
    '--radius-sm': preferences.cornerStyle === 'square' ? '7px' : preferences.cornerStyle === 'soft' ? '11px' : '14px',
  };

  function updatePreferences(patch) {
    setState(current => ({
      ...current,
      preferences: window.__lifeos.preferences.preparePreferences({
        ...current.preferences,
        ...patch,
        activePreset: Object.prototype.hasOwnProperty.call(patch, 'activePreset') ? patch.activePreset : 'custom',
      }),
    }));
  }

  function openAi(prompt = '', context = '') {
    setAiPrompt(prompt);
    setAiContext(context);
    setAiOpen(true);
  }

  function openModule(id, options = {}) {
    if (id === 'call' && !CALLS_ENABLED) return;
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
    setSyncFeedback({ status: 'syncing', message: 'Syncing', detail: 'Saving your latest changes.' });

    try {
      const result = previewSession
        ? await new Promise(resolve => setTimeout(() => resolve({ sent: 0, pending: 0 }), 650))
        : await window.__lifeos.sync.syncNow(() => store.saveAppState(state));
      const message = result.sent > 0
        ? `${result.sent} ${result.sent === 1 ? 'item' : 'items'} synced`
        : 'Synced now';
      setSyncFeedback({ status: 'success', message, detail: 'Your Life OS is up to date.' });
      void window.__lifeos?.native.notifyHaptic('success');
      syncResetRef.current = setTimeout(() => {
        setSyncFeedback({ status: 'idle', message: 'Sync now', detail: '' });
      }, 2200);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Sync could not be reached.';
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
        setView('home');
      }} />;
    }

    if (view === 'home' || !view) {
      return <Dashboard state={state} setState={setState}
                onModule={openModule}
                onAsk={openAi}
                layout={tweaks.layout} progressStyle={tweaks.progressStyle}
                syncFeedback={syncFeedback}
                onSync={syncNow}
                syncDisabled={!previewSession && (!storageReady || !store?.hasConfig || !user?.id)}
                preferences={preferences}
                performanceMode={performanceMode}
                userName={displayName} />;
    }

    if (view === 'settings') {
      return <SettingsScreen
                profile={profile}
                email={user?.email || ''}
                preferences={preferences}
                onPreferencesChange={updatePreferences}
                onProfileChange={setProfile}
                onBack={() => setView('home')}
                onReplayIntro={() => {
                  setState(current => ({ ...current, onboardingDone: false }));
                  setView('onboarding');
                }}
                onLoggedOut={() => setView('onboarding')} />;
    }

    // Notes ships with Home because the dashboard and AI sheet share its
    // journal data. Avoid adding another loading boundary for code already in
    // memory.
    if (view === 'notes') {
      return <NotesJournalScreen state={state} setState={setState} onBack={() => setView('home')} />;
    }

    const commonProps = { state, setState, profile, onBack: () => setView('home'), onAsk: openAi };
    const featureScreens = {
      packing: ['modules', 'PackingScreen', commonProps],
      docs: ['modules', 'DocumentsScreen', commonProps],
      tasks: ['tasks', 'TasksScreen', commonProps],
      budget: ['modules', 'BudgetScreen', commonProps],
      shopping: ['modules', 'ShoppingScreen', commonProps],
      community: ['community', 'CommunityScreen', { onBack: () => setView('home') }],
      toolkit: ['toolkit', 'ToolkitScreen', { onBack: () => setView('home') }],
      housing: ['modules', 'HousingScreen', commonProps],
      memory: ['memory', 'MemoryScreen', commonProps],
      habits: ['modules', 'HabitsScreen', commonProps],
      people: ['modules', 'ContactsScreen', commonProps],
      map: ['map', 'MapScreen', commonProps],
      journal: ['journal', 'VideoJournalScreen', { onBack: () => setView('home') }],
      prompt: ['prompt', 'DailyPromptScreen', { onBack: () => setView('home') }],
      trip: ['trip', 'TripBoardScreen', { onBack: () => setView('home') }],
      space: ['space', 'SpaceScreen', {
        initialCode: requestedPairCode,
        demo: previewPairing,
        onBack: () => setView('home'),
        // Undefined hides the Call button in the couple space.
        onCall: CALLS_ENABLED ? () => {
          setCallLaunch(current => ({ id: current.id + 1, mode: 'video' }));
          setView('call');
        } : undefined,
      }],
      ...(CALLS_ENABLED ? {
        call: ['call', 'CallScreen', {
          launch: callLaunch,
          onLaunchHandled: () => setCallLaunch(current => ({ ...current, id: 0 })),
          onBack: () => setView('home'),
          onRecordInstead: () => {
            window.dispatchEvent(new CustomEvent('lifeos:record-video-note'));
            setView('journal');
          },
        }],
      } : {}),
      games: ['games', 'GamesScreen', {
        profile,
        initialCode: requestedGameCode,
        demo: previewGames,
        onBack: () => setView('home'),
      }],
    };
    const feature = featureScreens[view];
    if (!feature) return null;
    return <LazyLegacyScreen bundle={feature[0]} componentName={feature[1]} screenProps={feature[2]} />;
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
      setView('home');
    }} />;
  }

  return (
    <div
      className={`app${view === 'onboarding' ? ' app-onboarding' : ''}`}
      data-dark={appDark}
      data-density={preferences.density === 'compact' ? 'compact' : 'cozy'}
      data-palette={preferences.palette}
      data-motion={preferences.motion}
      data-text-size={preferences.textSize}
      data-contrast={preferences.highContrast ? 'high' : 'standard'}
      data-glass={preferences.glassEffects ? 'on' : 'off'}
      data-corners={preferences.cornerStyle}
      data-performance={performanceMode}
      style={{
        ...appStyle,
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(at 20% 0%, color-mix(in srgb, var(--honey) 16%, transparent) 0%, transparent 40%),' +
          'radial-gradient(at 100% 100%, color-mix(in srgb, var(--blue) 20%, transparent) 0%, transparent 50%)',
        color: 'var(--dark)',
        position: 'relative',
      }}
    >
      {renderContent()}

      {/* Personal AI companion — available everywhere except the intro,
          settings and full-screen game room. */}
      {view !== 'onboarding' && view !== 'settings' && view !== 'games' && view !== 'space' && (
        <button
          type="button"
          onClick={() => openAi()}
          className="ai-launcher ai-pulse"
          aria-label="Ask Huve, your Life OS AI assistant"
          title="Ask Huve"
          style={{
            background: 'linear-gradient(135deg, var(--honey) 0%, var(--butter) 100%)',
            boxShadow: '0 8px 24px -6px rgba(45, 114, 139, 0.5), 0 4px 10px rgba(0,0,0,0.1)',
          }}
        >
          <img src="/huve-avatar.jpg" width="42" height="42" alt="Huve AI assistant" />
        </button>
      )}

      {/* Bottom navigation (hidden during onboarding) */}
      {view !== 'onboarding' && (
        <BottomNav current={view} onNavigate={setView} preferences={preferences} />
      )}

      <AskHuveSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onModule={setView}
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
            { id: 'prompt',     label: '💬 Prompt' },
            { id: 'trip',       label: '🧳 Trip' },
            ...(CALLS_ENABLED ? [{ id: 'call', label: '📞 Calls & video' }] : []),
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

const SETTINGS_HOME_SECTIONS = [
  { id: 'priorities', label: 'Today’s priorities', description: 'Your clearest next actions', icon: '✓' },
  CALLS_ENABLED
    ? { id: 'connection', label: 'Calls & daily Arabic', description: 'Connection windows and a local phrase', icon: '☎' }
    : { id: 'connection', label: 'Time together & daily Arabic', description: 'Good-hours windows and a local phrase', icon: '◷' },
  { id: 'overview', label: 'Life at a glance', description: 'Progress across your key areas', icon: '◫' },
  { id: 'snapshots', label: 'Money & UAE map', description: 'Budget and saved-place snapshots', icon: '⌖' },
  { id: 'games', label: 'Game night', description: 'A shortcut into shared games', icon: '♠' },
  { id: 'settling', label: 'Settling-in guide', description: 'Useful during your first month', icon: '☀' },
  { id: 'wellbeing', label: 'Wellbeing', description: 'Habits and your private note', icon: '♡' },
  { id: 'assistant', label: 'Personal AI', description: 'Local answers and personalised guidance', icon: '✦' },
  { id: 'tools', label: 'Life hub', description: 'Every Life OS tool in one place', icon: '⌘' },
];

const SETTINGS_PALETTES = [
  { id: 'honey', label: 'Honey Sky', colors: ['#F6D110', '#81CEEB', '#FFF9C7'] },
  { id: 'oasis', label: 'Oasis', colors: ['#D8E86E', '#79D2C5', '#F4F8D9'] },
  { id: 'sunset', label: 'Sunset', colors: ['#FFB95F', '#F2AAA3', '#FFF0DD'] },
  { id: 'lavender', label: 'Lavender', colors: ['#C7ADF5', '#94D7ED', '#F2ECFF'] },
];

const SETTINGS_LIFE_MODES = [
  { id: 'calm', label: 'Calm', icon: '◌', description: 'Only the essentials, with gentle motion.' },
  { id: 'explorer', label: 'Explorer', icon: '⌖', description: 'Places, trips and local tools come first.' },
  { id: 'connected', label: 'Connected', icon: '♥', description: CALLS_ENABLED ? 'Calls, games and your people lead the day.' : 'Games, notes and your people lead the day.' },
  { id: 'everything', label: 'Everything', icon: '□', description: 'The full Life OS experience.' },
];

function SettingsToggle({ checked, onChange, label, description, icon, disabled = false }) {
  return (
    <button
      type="button"
      className="settings-toggle-row"
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      disabled={disabled}
    >
      {icon && <span className="settings-toggle-icon" aria-hidden="true">{icon}</span>}
      <span className="settings-toggle-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <span className={`settings-switch${checked ? ' is-on' : ''}`} aria-hidden="true"><i /></span>
    </button>
  );
}

function SettingsSegmented({ value, onChange, options, label }) {
  return (
    <div className="settings-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PwaUpdateSettings() {
  const updater = window.__lifeos.pwa;
  const [status, setStatus] = useState(() => updater.getPwaUpdateStatus());

  useEffect(() => updater.subscribePwaUpdateStatus(setStatus), [updater]);

  const checking = status.phase === 'checking' || status.phase === 'downloading';
  const unsupported = status.phase === 'unsupported';
  const automaticLabel = unsupported ? 'Platform managed' : 'Automatic';
  const lastChecked = status.lastCheckedAt
    ? `Last checked ${new Date(status.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Checks automatically when you open or return to Life OS';

  return (
    <Card padding="20px" className="settings-studio-card settings-update-card" style={{ marginBottom: 14 }}>
      <div className="settings-card-heading">
        <div><span>App updates</span><h3>Always on the newest Life OS</h3></div>
        <small>No deleting or reinstalling needed</small>
      </div>
      <div className={`settings-update-state is-${status.phase}`} aria-live="polite">
        <span className="settings-update-icon" aria-hidden="true">↻</span>
        <span className="settings-update-copy">
          <strong>{unsupported ? 'Updates are managed by your platform' : 'Automatic updates are on'}</strong>
          <small>{updater.pwaUpdateMessage(status)}</small>
        </span>
        <span className="settings-update-badge"><i /> {automaticLabel}</span>
      </div>
      <div className="settings-update-footer">
        <small>{lastChecked}</small>
        <button
          type="button"
          onClick={() => { void updater.checkForPwaUpdate(); }}
          disabled={checking || unsupported}
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
    </Card>
  );
}

function AutomationSettings() {
  const api = window.__lifeos.automations;
  const [preferences, setPreferences] = useState(null);
  const [rateTarget, setRateTarget] = useState('');
  const [status, setStatus] = useState('Loading your alerts…');

  useEffect(() => {
    let active = true;
    void api.loadAutomationPreferences().then(next => {
      if (!active) return;
      setPreferences(next);
      setRateTarget(next.fxTarget ? String(next.fxTarget) : '');
      setStatus('Alerts use the existing private notification queue.');
    }).catch(() => {
      if (active) setStatus('Alert settings will appear after the automation migration is deployed.');
    });
    return () => { active = false; };
  }, [api]);

  async function change(patch) {
    if (!preferences) return;
    const optimistic = { ...preferences, ...patch };
    setPreferences(optimistic);
    setStatus('Saving…');
    try {
      await api.saveAutomationPreferences(patch);
      setStatus('Saved. Life OS will only notify you when there is something useful.');
    } catch (error) {
      setPreferences(preferences);
      setStatus(error?.message || 'That alert could not be saved.');
    }
  }

  return (
    <Card padding="20px" className="settings-studio-card settings-automation-card" style={{ marginBottom: 14 }}>
      <div className="settings-card-heading">
        <div><span>Quiet automations</span><h3>Let Life OS watch the useful things</h3></div>
        <small>Private, optional and easy to switch off</small>
      </div>
      {preferences && <div className="settings-toggle-list">
        <SettingsToggle checked={preferences.priceWatchAlerts} onChange={value => change({ priceWatchAlerts: value })} icon="↓" label="Price-drop alerts" description="One notification when a watched price reaches your target" />
        <SettingsToggle checked={preferences.weeklyDealsDigest} onChange={value => change({ weeklyDealsDigest: value })} icon="◷" label="Sunday deal digest" description="New deals and changes on your private watchlist" />
        <SettingsToggle checked={preferences.eventReminders} onChange={value => change({ eventReminders: value })} icon="◎" label="Event reminders" description="A useful nudge 24 hours and 2 hours before events you joined" />
        <SettingsToggle checked={preferences.newcomerBuddy} onChange={value => change({ newcomerBuddy: value })} icon="↔" label="Newcomer buddy matching" description="Opt in to a same-home-town match with a settled directory member" />
      </div>}
      {preferences && <div className="settings-fx-alert">
        <SettingsToggle checked={preferences.fxAlerts} onChange={value => change({ fxAlerts: value })} icon="R" label="AED → ZAR target" description="Hear when the send-money rate crosses your number" />
        <div className="settings-fx-fields">
          <label><span>Notify when 1 AED is</span><select value={preferences.fxDirection} onChange={event => change({ fxDirection: event.target.value })}><option value="above">at or above</option><option value="below">at or below</option></select></label>
          <label><span>Target in rand</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={rateTarget} onChange={event => setRateTarget(event.target.value)} onBlur={() => { const value = Number(rateTarget); if (Number.isFinite(value) && value > 0) void change({ fxTarget: value }); }} placeholder="e.g. 4.95" /></label>
        </div>
      </div>}
      <p className="settings-automation-status" role="status">{status}</p>
    </Card>
  );
}

function SettingsScreen({ profile, email, preferences, onPreferencesChange, onProfileChange, onBack, onLoggedOut, onReplayIntro }) {
  const [name, setName] = useState(profile?.display_name || '');
  const [accountProfile, setAccountProfile] = useState({
    home_town: profile?.home_town || '',
    emirate: profile?.emirate || 'Abu Dhabi',
    arrived_on: profile?.arrived_on || '',
    status: profile?.status || 'just_landed',
    employer_name: profile?.employer_name || '',
    visible_in_directory: profile?.visible_in_directory === true,
  });
  const [aiProfile, setAIProfile] = useState(() => window.__lifeos?.aiProfile.prepareAIProfile(profile?.ai_profile));
  const [saving, setSaving] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const prefs = window.__lifeos.preferences.preparePreferences(preferences);
  const hiddenSections = new Set(prefs.hiddenHomeSections);
  const visibleSectionCount = prefs.homeOrder.length - prefs.hiddenHomeSections.length;

  useEffect(() => {
    setName(profile?.display_name || '');
    setAccountProfile({
      home_town: profile?.home_town || '',
      emirate: profile?.emirate || 'Abu Dhabi',
      arrived_on: profile?.arrived_on || '',
      status: profile?.status || 'just_landed',
      employer_name: profile?.employer_name || '',
      visible_in_directory: profile?.visible_in_directory === true,
    });
  }, [
    profile?.arrived_on,
    profile?.display_name,
    profile?.emirate,
    profile?.employer_name,
    profile?.home_town,
    profile?.status,
    profile?.visible_in_directory,
  ]);

  useEffect(() => {
    setAIProfile(window.__lifeos?.aiProfile.prepareAIProfile(profile?.ai_profile));
  }, [profile?.ai_profile]);

  function changePreferences(patch) {
    onPreferencesChange(patch);
    void window.__lifeos?.native.tap('light');
  }

  function applyLifeMode(modeId) {
    changePreferences(window.__lifeos.preferences.applyLifeMode(prefs, modeId));
    setMessage(`${SETTINGS_LIFE_MODES.find(mode => mode.id === modeId)?.label || 'Your'} mode is ready.`);
  }

  function toggleHomeSection(sectionId, show) {
    const hidden = new Set(prefs.hiddenHomeSections);
    if (show) hidden.delete(sectionId);
    else hidden.add(sectionId);
    changePreferences({ hiddenHomeSections: [...hidden] });
  }

  function moveSection(sectionId, direction) {
    changePreferences({
      homeOrder: window.__lifeos.preferences.moveHomeSection(prefs, sectionId, direction),
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const updated = await window.__suvedaAuth?.updateProfile?.({ display_name: name, ...accountProfile });
      if (updated) onProfileChange(updated);
      setMessage('Your profile has been updated.');
    } catch (error) {
      setMessage(error?.message || 'Your profile could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  function updateAIProfile(field, value) {
    setAIProfile(current => ({ ...current, [field]: value }));
  }

  async function saveAIProfile(event) {
    event.preventDefault();
    setMessage('');
    setSavingAI(true);
    try {
      const updated = await window.__suvedaAuth?.updateProfile?.({ ai_profile: aiProfile });
      if (updated) onProfileChange(updated);
      setMessage('Your personal AI preferences have been saved.');
    } catch (error) {
      setMessage(error?.message || 'Your preferences could not be updated.');
    } finally {
      setSavingAI(false);
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
    <ModulePage title="Settings" subtitle="Make Life OS feel like yours" icon="Settings" onBack={onBack}>
      <section className="settings-personalization-hero">
        <div className="settings-hero-copy">
          <span className="settings-hero-kicker">YOUR LIFE, YOUR LAYOUT</span>
          <h2>Shape the app around you.</h2>
          <p>Choose a mood, decide what Home shows, and put the tools you use most within one tap.</p>
          <span className="settings-auto-save"><i /> Preferences sync automatically</span>
        </div>
        <div className="settings-live-preview" aria-label={`${SETTINGS_PALETTES.find(item => item.id === prefs.palette)?.label || 'Custom'} appearance selected`}>
          <div className="settings-preview-top"><span /><span /><span /></div>
          <div className="settings-preview-hero"><i /><b /></div>
          <div className="settings-preview-grid"><span /><span /><span /></div>
          <div className="settings-preview-dock"><i /><i /><i /><i /></div>
        </div>
      </section>

      <Card padding="20px" className="settings-studio-card settings-modes-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Quick start</span><h3>Choose a Life mode</h3></div>
          <small>Changes layout, colour and shortcuts together</small>
        </div>
        <div className="settings-life-modes">
          {SETTINGS_LIFE_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              className={prefs.activePreset === mode.id ? 'is-active' : ''}
              onClick={() => applyLifeMode(mode.id)}
              aria-pressed={prefs.activePreset === mode.id}
            >
              <span>{mode.icon}</span>
              <strong>{mode.label}</strong>
              <small>{mode.description}</small>
              {prefs.activePreset === mode.id && <b>Selected</b>}
            </button>
          ))}
        </div>
      </Card>

      <Card padding="20px" className="settings-studio-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Appearance</span><h3>Set the feeling</h3></div>
          <small>Previewed instantly across the whole app</small>
        </div>

        <div className="settings-control-label">Colour palette</div>
        <div className="settings-palette-grid">
          {SETTINGS_PALETTES.map(palette => (
            <button
              key={palette.id}
              type="button"
              className={prefs.palette === palette.id ? 'is-active' : ''}
              onClick={() => changePreferences({ palette: palette.id })}
              aria-pressed={prefs.palette === palette.id}
            >
              <span className="settings-palette-dots">
                {palette.colors.map(color => <i key={color} style={{ background: color }} />)}
              </span>
              <strong>{palette.label}</strong>
              <small>{prefs.palette === palette.id ? 'Using now' : 'Try palette'}</small>
            </button>
          ))}
        </div>

        <div className="settings-control-grid">
          <label>
            <span className="settings-control-label">Colour mode</span>
            <SettingsSegmented
              label="Colour mode"
              value={prefs.colorMode}
              onChange={value => changePreferences({ colorMode: value })}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }]}
            />
          </label>
          <label>
            <span className="settings-control-label">Spacing</span>
            <SettingsSegmented
              label="Interface spacing"
              value={prefs.density}
              onChange={value => changePreferences({ density: value })}
              options={[{ value: 'comfortable', label: 'Comfort' }, { value: 'compact', label: 'Compact' }]}
            />
          </label>
          <label>
            <span className="settings-control-label">Corners</span>
            <SettingsSegmented
              label="Corner style"
              value={prefs.cornerStyle}
              onChange={value => changePreferences({ cornerStyle: value })}
              options={[{ value: 'square', label: 'Clean' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]}
            />
          </label>
        </div>
      </Card>

      <Card padding="20px" className="settings-studio-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Home screen</span><h3>Put your day in your order</h3></div>
          <small>Show, hide or move every section</small>
        </div>
        <div className="settings-home-order-list">
          {prefs.homeOrder.map((sectionId, index) => {
            const section = SETTINGS_HOME_SECTIONS.find(item => item.id === sectionId);
            if (!section) return null;
            const shown = !hiddenSections.has(sectionId);
            return (
              <div key={sectionId} className={`settings-home-order-item${shown ? '' : ' is-hidden'}`}>
                <span className="settings-home-order-icon" aria-hidden="true">{section.icon}</span>
                <span className="settings-home-order-copy"><strong>{section.label}</strong><small>{section.description}</small></span>
                <div className="settings-order-actions">
                  <button type="button" onClick={() => moveSection(sectionId, -1)} disabled={index === 0} aria-label={`Move ${section.label} up`}>↑</button>
                  <button type="button" onClick={() => moveSection(sectionId, 1)} disabled={index === prefs.homeOrder.length - 1} aria-label={`Move ${section.label} down`}>↓</button>
                </div>
                <button
                  type="button"
                  className={`settings-visibility-button${shown ? ' is-visible' : ''}`}
                  onClick={() => toggleHomeSection(sectionId, !shown)}
                  disabled={shown && visibleSectionCount <= 1}
                  aria-label={`${shown ? 'Hide' : 'Show'} ${section.label}`}
                  aria-pressed={shown}
                >
                  {shown ? 'Shown' : 'Hidden'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card padding="20px" className="settings-studio-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Quick dock</span><h3>Choose your three one-tap tools</h3></div>
          <small>Home always stays in the first position</small>
        </div>
        <div className="settings-dock-preview" aria-label="Bottom navigation preview">
          <span><AnimatedIcon name="House" size={22} play={0} /><small>Home</small></span>
          {prefs.quickNav.map(itemId => {
            const item = NAV_CATALOG.find(navItem => navItem.id === itemId);
            return <span key={itemId}><AnimatedIcon name={item?.icon || 'LayoutGrid'} size={22} play={0} /><small>{item?.label}</small></span>;
          })}
          <span><AnimatedIcon name="LayoutGrid" size={22} play={0} /><small>More</small></span>
        </div>
        <div className="settings-dock-selects">
          {prefs.quickNav.map((itemId, index) => (
            <label key={`${index}-${itemId}`}>
              <span>Shortcut {index + 1}</span>
              <select
                value={itemId}
                onChange={event => changePreferences({
                  quickNav: window.__lifeos.preferences.setQuickNavSlot(prefs, index, event.target.value),
                })}
              >
                {QUICK_NAV_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card padding="20px" className="settings-studio-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Comfort & accessibility</span><h3>Make every interaction easier</h3></div>
          <small>These controls affect the full app</small>
        </div>
        <div className="settings-comfort-grid">
          <div className="settings-comfort-segment">
            <span className="settings-control-label">Text size</span>
            <SettingsSegmented
              label="Text size"
              value={prefs.textSize}
              onChange={value => changePreferences({ textSize: value })}
              options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Larger' }]}
            />
          </div>
          <div className="settings-comfort-segment">
            <span className="settings-control-label">Animation</span>
            <SettingsSegmented
              label="Animation amount"
              value={prefs.motion}
              onChange={value => changePreferences({ motion: value })}
              options={[{ value: 'full', label: 'Full' }, { value: 'gentle', label: 'Gentle' }, { value: 'reduced', label: 'Still' }]}
            />
          </div>
        </div>
        <div className="settings-toggle-list">
          <SettingsToggle checked={prefs.highContrast} onChange={value => changePreferences({ highContrast: value })} icon="◐" label="Higher contrast" description="Stronger borders and easier-to-read supporting text" />
          <SettingsToggle checked={prefs.glassEffects} onChange={value => changePreferences({ glassEffects: value })} icon="◫" label="Liquid glass effects" description="Blurred navigation and floating surfaces" />
          <SettingsToggle checked={prefs.haptics} onChange={value => changePreferences({ haptics: value })} icon="≈" label="Haptic feedback" description="A gentle tap for important actions on iPhone" />
        </div>
      </Card>

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
          <div className="settings-ai-grid" style={{ marginTop: 14 }}>
            <label className="auth-profile-field"><span>SA home town</span><input value={accountProfile.home_town} onChange={event => setAccountProfile(current => ({ ...current, home_town: event.target.value }))} placeholder="e.g. Durban" /></label>
            <label className="auth-profile-field"><span>Emirate</span><select value={accountProfile.emirate} onChange={event => setAccountProfile(current => ({ ...current, emirate: event.target.value }))}><option>Abu Dhabi</option><option>Dubai</option><option>Sharjah</option><option>Ajman</option><option>Ras Al Khaimah</option><option>Fujairah</option><option>Umm Al Quwain</option></select></label>
            <label className="auth-profile-field"><span>Your UAE chapter</span><select value={accountProfile.status} onChange={event => setAccountProfile(current => ({ ...current, status: event.target.value }))}><option value="landing_soon">Landing soon</option><option value="just_landed">Just landed</option><option value="settled">Settled in</option></select></label>
            <label className="auth-profile-field"><span>Arrival date</span><input type="date" value={accountProfile.arrived_on} onChange={event => setAccountProfile(current => ({ ...current, arrived_on: event.target.value }))} /></label>
            <label className="auth-profile-field"><span>Employer <small>private</small></span><input value={accountProfile.employer_name} onChange={event => setAccountProfile(current => ({ ...current, employer_name: event.target.value }))} placeholder="Used to label your benefits" autoComplete="organization" /></label>
          </div>
          <SettingsToggle
            checked={accountProfile.visible_in_directory}
            onChange={value => setAccountProfile(current => ({ ...current, visible_in_directory: value }))}
            icon="◎"
            label="Show me in the Community directory"
            description="Off by default. Only your profile and community details become discoverable."
          />
        </form>
      </Card>

      <Card padding="20px" className="settings-ai-card" style={{ marginBottom: 14 }}>
        <div className="settings-ai-heading">
          <span aria-hidden="true">◎</span>
          <div>
            <div className="settings-ai-eyebrow">Your personal AI</div>
            <h3>Teach your assistant what helps you</h3>
            <p>Share only what you are comfortable with. Your private AI profile tailors answers to your routines, priorities and preferred style.</p>
          </div>
        </div>

        <form onSubmit={saveAIProfile} className="settings-ai-form">
          <div className="settings-ai-grid">
            <label className="auth-profile-field">
              <span>Home base</span>
              <input
                value={aiProfile?.home_base || ''}
                onChange={event => updateAIProfile('home_base', event.target.value)}
                placeholder="e.g. Abu Dhabi"
                maxLength={120}
              />
            </label>
            <label className="auth-profile-field">
              <span>Daily rhythm</span>
              <select
                value={aiProfile?.daily_rhythm || 'flexible'}
                onChange={event => updateAIProfile('daily_rhythm', event.target.value)}
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
              value={aiProfile?.priorities || ''}
              onChange={event => updateAIProfile('priorities', event.target.value)}
              placeholder="Goals, responsibilities, or things you want help organising"
              maxLength={500}
              rows={3}
            />
          </label>

          <label className="auth-profile-field">
            <span>Interests and favourite things</span>
            <input
              value={aiProfile?.interests || ''}
              onChange={event => updateAIProfile('interests', event.target.value)}
              placeholder="e.g. food, fitness, books, travel"
              maxLength={500}
            />
          </label>

          <label className="auth-profile-field">
            <span>Preferred guidance style</span>
            <select
              value={aiProfile?.response_style || 'warm_practical'}
              onChange={event => updateAIProfile('response_style', event.target.value)}
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
              value={aiProfile?.notes || ''}
              onChange={event => updateAIProfile('notes', event.target.value)}
              placeholder="Preferences, routines, accessibility needs, or useful context"
              maxLength={700}
              rows={3}
            />
          </label>

          <div className="settings-ai-actions">
            <span>AI context private to your account</span>
            <Button type="submit" size="sm" disabled={savingAI}>
              {savingAI ? 'Saving…' : 'Save AI preferences'}
            </Button>
          </div>
        </form>
      </Card>

      <PwaUpdateSettings />

      <AutomationSettings />

      <Card padding="20px" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 8 }}>
          Privacy
        </div>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Your data stays with your account</h3>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
          Your profile, preferences, dashboard and personal lists are isolated from every other Life OS account by database access rules.
        </p>
        <FaceIdRow />
      </Card>

      <Card padding="20px" className="settings-studio-card" style={{ marginBottom: 14 }}>
        <div className="settings-card-heading">
          <div><span>Experience</span><h3>Start fresh when you want to</h3></div>
          <small>Your content and account stay untouched</small>
        </div>
        <div className="settings-secondary-actions">
          <button type="button" onClick={onReplayIntro}><span>◎</span><strong>Replay welcome tour</strong><small>See the three introduction screens again</small></button>
          <button type="button" onClick={() => setResetOpen(true)}><span>↺</span><strong>Reset customisation</strong><small>Restore the original layout and appearance</small></button>
        </div>
      </Card>

      {message && (
        <div className="settings-status-message" role="status">{message}</div>
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

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset customisation?">
        <p className="settings-reset-copy">
          This restores the original palette, Home sections and dock. Your journal, budget, documents, profile and personal preferences will not be changed.
        </p>
        <div className="settings-reset-actions">
          <Button variant="ghost" onClick={() => setResetOpen(false)}>Keep mine</Button>
          <Button onClick={() => {
            changePreferences(window.__lifeos.preferences.applyLifeMode({}, 'everything'));
            setResetOpen(false);
            setMessage('Your original Life OS layout has been restored.');
          }}>Reset layout</Button>
        </div>
      </Modal>
    </ModulePage>
  );
}

// ---------- Bottom navigation ----------
const NAV_CATALOG = [
  { id: 'home',    label: 'Home',      icon: 'House' },
  { id: 'map',     label: 'Map',       icon: 'Map' },
  { id: 'community', label: 'Community', icon: 'Users' },
  { id: 'shopping', label: 'Shop & Save', icon: 'ShoppingCart' },
  { id: 'settings', label: 'Settings', icon: 'Settings' },
  { id: 'notes',    label: 'Journal',  icon: 'NotebookPen' },
  { id: 'budget',  label: 'Budget',    icon: 'Wallet' },
  // With calling hidden, the slot carries the video journal instead, so
  // unwatched video notes keep a home in the dock and the More menu.
  ...(CALLS_ENABLED
    ? [{ id: 'call', label: 'Calls', icon: 'Phone' }]
    : [{ id: 'journal', label: 'Video notes', icon: 'Video' }]),
  { id: 'games',    label: 'Games',    icon: 'Gamepad2' },
  { id: 'docs',    label: 'Documents', icon: 'FileText' },
  { id: 'habits',   label: 'Habits',   icon: 'Target' },
  { id: 'people',   label: 'People',   icon: 'Users' },
  { id: 'prompt',   label: 'Prompt',   icon: 'MessageCircle' },
  { id: 'housing',  label: 'Housing',  icon: 'Building2' },
  { id: 'space',    label: 'Pairing',  icon: 'Heart' },
  { id: 'toolkit',  label: 'Toolkit',  icon: 'ShieldCheck' },
];

const QUICK_NAV_OPTIONS = NAV_CATALOG.filter(item => (
  ['map', 'community', 'shopping', 'notes', 'budget', 'games', 'docs', 'habits', 'people']
    .concat(CALLS_ENABLED ? ['call'] : [])
    .includes(item.id)
));

// The dock entry that carries the unwatched-video-note dot.
const VIDEO_NOTE_NAV_ID = CALLS_ENABLED ? 'call' : 'journal';

// Which nav entries currently have something waiting.
function navNeedsAttention(id, unwatched, promptWaiting) {
  if (id === VIDEO_NOTE_NAV_ID) return unwatched > 0;
  if (id === 'prompt') return promptWaiting;
  return false;
}

function moreNeedsAttention(current, unwatched, promptWaiting) {
  const journal = unwatched > 0 && current !== 'journal' && current !== VIDEO_NOTE_NAV_ID;
  const prompt = promptWaiting && current !== 'prompt';
  return journal || prompt;
}

function navItemIsActive(itemId, current) {
  return itemId === current || (CALLS_ENABLED && itemId === 'call' && current === 'journal');
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

function BottomNav({ current, onNavigate, preferences }) {
  const [playTriggers, setPlayTriggers] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const playNavItem = (id) => {
    setPlayTriggers(triggers => ({
      ...triggers,
      [id]: (triggers[id] || 0) + 1,
    }));
  };
  // Attention badges used to import the complete video journal and daily
  // prompt bundles on every app launch. Their counts are non-essential and
  // can remain dormant until those screens are opened.
  const unwatched = 0;
  const promptWaiting = false;
  const { primaryNav, moreNav } = useMemo(() => {
    const prepared = window.__lifeos.preferences.preparePreferences(preferences);
    const primaryIds = new Set(['home', ...prepared.quickNav]);
    return {
      primaryNav: [
        NAV_CATALOG[0],
        ...prepared.quickNav.map(id => NAV_CATALOG.find(item => item.id === id)).filter(Boolean),
      ],
      moreNav: NAV_CATALOG.filter(item => !primaryIds.has(item.id)),
    };
  }, [preferences]);

  const activeMoreItem = moreNav.find(item => navItemIsActive(item.id, current));

  return (
    <>
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-inner">
          {primaryNav.map(item => {
            const active = navItemIsActive(item.id, current);
            return (
              <button
                key={item.id}
                type="button"
                className={`bottom-nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                onPointerDown={() => preloadLegacyView(item.id)}
                onFocus={() => preloadLegacyView(item.id)}
                onClick={() => {
                  playNavItem(item.id);
                  onNavigate(item.id);
                }}
                onMouseEnter={() => {
                  preloadLegacyView(item.id);
                  playNavItem(item.id);
                }}
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
            onClick={() => {
              playNavItem('more');
              setMoreOpen(open => !open);
            }}
            className={`bottom-nav-item${activeMoreItem || moreOpen ? ' is-active' : ''}`}
            aria-expanded={moreOpen}
            aria-label="Settings and more destinations"
          >
            <span className="bottom-nav-icon">
              <AnimatedIcon
                name="Settings"
                size={26}
                play={playTriggers.more || 0}
              />
            </span>
            <span className="bottom-nav-label">Settings</span>
            <NavDot show={moreNeedsAttention(current, unwatched, promptWaiting)} />
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Settings & tools" height="auto" lightweight>
          <div className="bottom-nav-more-grid">
            {moreNav.map(item => {
              const active = navItemIsActive(item.id, current);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`bottom-nav-more-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onPointerDown={() => preloadLegacyView(item.id)}
                  onMouseEnter={() => preloadLegacyView(item.id)}
                  onFocus={() => preloadLegacyView(item.id)}
                  onClick={() => {
                    playNavItem(item.id);
                    onNavigate(item.id);
                    setMoreOpen(false);
                  }}
                >
                  <span className="bottom-nav-more-icon">
                    <AnimatedIcon name={item.icon} size={28} play={playTriggers[item.id] || 0} />
                  </span>
                  <span className="bottom-nav-more-label">{item.label}</span>
                  <NavDot show={navNeedsAttention(item.id, unwatched, promptWaiting)} offset={8} />
                </button>
              );
            })}
          </div>
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
