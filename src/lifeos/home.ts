// Home-screen planning model.
//
// The legacy React dashboard consumes this through window.__lifeos.home. Keeping
// the prioritisation here makes the home screen deterministic and testable while
// the rest of the app gradually moves away from global JSX modules.

export type HomeActionKind = 'document' | 'task' | 'habit' | 'packing' | 'shopping' | 'link';
export type DailyMode = 'steady' | 'focused' | 'curious';

export type DailyModeCopy = {
  id: DailyMode;
  emoji: string;
  label: string;
  shortLabel: string;
  description: string;
  heroLine: string;
  cta: string;
};

export type DailyPhrase = {
  arabic: string;
  transliteration: string;
  meaning: string;
  context: string;
};

export type ConnectionSnapshot = {
  abuDhabiTime: string;
  johannesburgTime: string;
  status: string;
  isGoodWindow: boolean;
};

export type HomeAction = {
  id: string;
  sourceId: string;
  kind: HomeActionKind;
  module: string;
  eyebrow: string;
  title: string;
  detail: string;
  emoji: string;
  toggleable: boolean;
};

type StatusItem = {
  id: string;
  name?: string;
  text?: string;
  note?: string;
  when?: string;
  status?: string;
  emoji?: string;
};

type Habit = {
  id: string;
  name: string;
  emoji?: string;
  lastDone?: string;
};

type HomeState = {
  moveDate?: string;
  dailyMode?: { date?: string; value?: DailyMode } | null;
  documents?: StatusItem[];
  tasks?: StatusItem[];
  habits?: Habit[];
  shopping?: StatusItem[];
  packing?: { rooms?: Array<{ label?: string; items?: StatusItem[] }> };
  contacts?: Array<{ phone?: string; email?: string }>;
  housing?: { rooms?: Array<{ photos?: unknown[] }> };
  budget?: {
    currency?: string;
    monthlyIncome?: number;
    monthly?: Array<{ planned?: number; spent?: number }>;
  };
};

export type JourneyPhase = {
  daysUntilMove: number;
  daysSinceMove: number;
  isAfterMove: boolean;
  eyebrow: string;
  title: string;
  description: string;
  timeLabel: string;
};

export type HomeMetric = {
  id: 'docs' | 'tasks' | 'habits';
  module: string;
  label: string;
  done: number;
  total: number;
  color: string;
};

export type MoneySnapshot = {
  currency: string;
  income: number;
  planned: number;
  spent: number;
  remaining: number;
  spentPercent: number;
};

export type HomeModel = {
  journey: JourneyPhase;
  dailyMode: DailyMode;
  dailyModeCopy: DailyModeCopy;
  phrase: DailyPhrase;
  priorities: HomeAction[];
  metrics: HomeMetric[];
  money: MoneySnapshot;
  setupDone: number;
  setupTotal: number;
  contactCount: number;
  homePhotoCount: number;
  todayKey: string;
};

export const DAILY_MODES: DailyModeCopy[] = [
  {
    id: 'steady', emoji: '🌿', label: 'Steady', shortLabel: 'Gentle pace',
    description: 'One useful thing, one caring thing.',
    heroLine: 'Handle one useful thing and one gentle thing today.',
    cta: 'Start gently',
  },
  {
    id: 'focused', emoji: '⚡', label: 'Focused', shortLabel: 'Clear the deck',
    description: 'Use your energy on the thing creating drag.',
    heroLine: 'Clear one meaningful task, then give the rest of the day back to yourself.',
    cta: 'Start the focus',
  },
  {
    id: 'curious', emoji: '✨', label: 'Curious', shortLabel: 'Explore a little',
    description: 'Make room for one new part of the city.',
    heroLine: 'Let one practical step sit beside one small Abu Dhabi discovery.',
    cta: 'Find today’s spark',
  },
];

const DAILY_PHRASES: DailyPhrase[] = [
  { arabic: 'مرحباً', transliteration: 'Marhaban', meaning: 'Hello', context: 'A warm, simple greeting.' },
  { arabic: 'شكرا', transliteration: 'Shukran', meaning: 'Thank you', context: 'The everyday essential.' },
  { arabic: 'صباح الخير', transliteration: 'Sabah al-khayr', meaning: 'Good morning', context: 'Use it to start the day warmly.' },
  { arabic: 'مساء الخير', transliteration: "Masa' al-khayr", meaning: 'Good evening', context: 'A friendly evening greeting.' },
  { arabic: 'مع السلامة', transliteration: "Ma'a as-salama", meaning: 'Goodbye', context: 'Literally, go with peace.' },
  { arabic: 'نعم', transliteration: "Na'am", meaning: 'Yes', context: 'Short, useful, and easy to remember.' },
  { arabic: 'لا، شكرا', transliteration: 'La, shukran', meaning: 'No, thank you', context: 'A polite everyday boundary.' },
];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDifference(targetKey: string | undefined, now: Date): number {
  if (!targetKey || !/^\d{4}-\d{2}-\d{2}$/.test(targetKey)) return 0;
  const [year, month, day] = targetKey.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

function dailyIndex(now: Date, length: number): number {
  const start = Date.UTC(now.getFullYear(), 0, 1);
  const current = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((current - start) / 86_400_000) % length;
}

function hourInZone(now: Date, zone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: zone,
  }).formatToParts(now).find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

function clockInZone(now: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone,
  }).format(now);
}

export function getDailyMode(state: HomeState, now = new Date()): DailyMode {
  if (state.dailyMode?.date === dateKey(now)) return state.dailyMode.value ?? 'steady';
  return 'steady';
}

export function getDailyModeCopy(mode: DailyMode): DailyModeCopy {
  return DAILY_MODES.find((item) => item.id === mode) ?? DAILY_MODES[0];
}

export function getDailyPhrase(now = new Date()): DailyPhrase {
  return DAILY_PHRASES[dailyIndex(now, DAILY_PHRASES.length)];
}

export function getConnectionSnapshot(now = new Date()): ConnectionSnapshot {
  const abuDhabiHour = hourInZone(now, 'Asia/Dubai');
  const johannesburgHour = hourInZone(now, 'Africa/Johannesburg');
  const abuDhabiQuiet = abuDhabiHour < 7 || abuDhabiHour >= 22;
  const johannesburgQuiet = johannesburgHour < 7 || johannesburgHour >= 22;
  const isGoodWindow = !abuDhabiQuiet && !johannesburgQuiet;
  const status = isGoodWindow
    ? 'A good time-zone window for a quick hello'
    : abuDhabiQuiet
      ? 'Abu Dhabi is in quiet hours'
      : johannesburgQuiet
        ? 'Johannesburg is in quiet hours'
        : 'Plan a little catch-up for later';

  return {
    abuDhabiTime: clockInZone(now, 'Asia/Dubai'),
    johannesburgTime: clockInZone(now, 'Africa/Johannesburg'),
    status,
    isGoodWindow,
  };
}

export function getJourneyPhase(moveDate: string | undefined, now = new Date()): JourneyPhase {
  const daysUntilMove = dayDifference(moveDate, now);
  // LifeOS now starts with life in the UAE. A future or missing legacy move
  // date must never push the home screen back into departure planning.
  const isAfterMove = true;
  const daysSinceMove = Math.max(0, -daysUntilMove);

  if (daysSinceMove === 0) {
    return {
      daysUntilMove,
      daysSinceMove,
      isAfterMove,
      eyebrow: 'YOUR ABU DHABI LIFE',
      title: 'Make today useful, calm, and yours.',
      description: 'Keep daily admin, local places, and the people you love within reach.',
      timeLabel: 'Living in Abu Dhabi',
    };
  }
  if (daysSinceMove <= 30) {
    return {
      daysUntilMove,
      daysSinceMove,
      isAfterMove,
      eyebrow: 'ABU DHABI · SETTLING IN',
      title: 'Build your rhythm, one step at a time.',
      description: 'Handle one useful thing and one gentle thing today.',
      timeLabel: `${daysSinceMove} ${daysSinceMove === 1 ? 'day' : 'days'} in Abu Dhabi`,
    };
  }
  if (daysSinceMove <= 90) {
    return {
      daysUntilMove,
      daysSinceMove,
      isAfterMove,
      eyebrow: 'ABU DHABI · FINDING YOUR RHYTHM',
      title: 'The unfamiliar is becoming your everyday.',
      description: 'Keep building the routines, places, and people that feel like home.',
      timeLabel: `${daysSinceMove} days into the chapter`,
    };
  }
  return {
    daysUntilMove,
    daysSinceMove,
    isAfterMove,
    eyebrow: 'YOUR UAE CHAPTER',
    title: 'This is not the move anymore. This is life.',
    description: 'Keep the parts of your new rhythm that make you feel grounded.',
    timeLabel: `${daysSinceMove} days in the UAE`,
  };
}

function pending(items: StatusItem[] | undefined): StatusItem[] {
  return (items ?? []).filter((item) => item.status !== 'done' && item.status !== 'packed');
}

function actionForDocument(item: StatusItem): HomeAction {
  return {
    id: `document-${item.id}`,
    sourceId: item.id,
    kind: 'document',
    module: 'docs',
    eyebrow: 'Residency & admin',
    title: item.name || 'Review a document',
    detail: item.note || 'Keep your UAE paperwork moving',
    emoji: item.emoji || '📄',
    toggleable: true,
  };
}

function actionForTask(item: StatusItem): HomeAction {
  return {
    id: `task-${item.id}`,
    sourceId: item.id,
    kind: 'task',
    module: 'tasks',
    eyebrow: 'Life admin',
    title: item.text || 'Complete the next task',
    detail: item.when || 'Part of your UAE life plan',
    emoji: '🌇',
    toggleable: true,
  };
}

function actionForHabit(item: Habit): HomeAction {
  return {
    id: `habit-${item.id}`,
    sourceId: item.id,
    kind: 'habit',
    module: 'habits',
    eyebrow: 'Feel grounded',
    title: item.name,
    detail: 'A small promise to yourself today',
    emoji: item.emoji || '✨',
    toggleable: true,
  };
}

function fallbackActions(): HomeAction[] {
  return [
    { id: 'link-map', sourceId: 'map', kind: 'link', module: 'map', eyebrow: 'Explore', title: 'Find a new local anchor', detail: 'Save a place that makes Abu Dhabi feel smaller', emoji: '📍', toggleable: false },
    { id: 'link-prompt', sourceId: 'prompt', kind: 'link', module: 'prompt', eyebrow: 'Reflect', title: 'Answer today’s check-in', detail: 'Notice what is starting to feel familiar', emoji: '💬', toggleable: false },
    { id: 'link-people', sourceId: 'people', kind: 'link', module: 'people', eyebrow: 'Connect', title: 'Add someone to your UAE circle', detail: 'Keep the people who can help close by', emoji: '🤝', toggleable: false },
  ];
}

export function getHomePriorities(state: HomeState, now = new Date()): HomeAction[] {
  const dailyMode = getDailyMode(state, now);
  const today = dateKey(now);
  const docs = pending(state.documents);
  const tasks = pending(state.tasks);
  const habits = (state.habits ?? []).filter((habit) => habit.lastDone !== today);
  const shoppingItem = (state.shopping ?? []).find((item) => item.status !== 'packed');
  const actions: HomeAction[] = [];

  {
    const currentDoc = docs[0];
    const currentTask = tasks.find((item) => ['Today', 'This week', 'This month', 'Ongoing', 'After'].includes(item.when || ''));
    const shoppingAction = shoppingItem ? {
        id: `shopping-${shoppingItem.id}`,
        sourceId: shoppingItem.id,
        kind: 'shopping' as const,
        module: 'shopping',
        eyebrow: 'Home base',
        title: shoppingItem.name || 'Pick up an essential',
        detail: 'One less thing between you and feeling settled',
        emoji: shoppingItem.emoji || '🛍️',
        toggleable: true,
      } : null;

    if (dailyMode === 'curious') {
      actions.push(fallbackActions()[0]);
      if (habits[0]) actions.push(actionForHabit(habits[0]));
      if (currentDoc) actions.push(actionForDocument(currentDoc));
    } else if (dailyMode === 'focused') {
      if (currentTask) actions.push(actionForTask(currentTask));
      if (currentDoc) actions.push(actionForDocument(currentDoc));
      if (shoppingAction) actions.push(shoppingAction);
      if (habits[0]) actions.push(actionForHabit(habits[0]));
    } else {
      if (currentTask) actions.push(actionForTask(currentTask));
      if (habits[0]) actions.push(actionForHabit(habits[0]));
      if (currentDoc) actions.push(actionForDocument(currentDoc));
      if (shoppingAction) actions.push(shoppingAction);
    }
  }

  const existing = new Set(actions.map((action) => action.id));
  for (const fallback of fallbackActions()) {
    if (actions.length >= 3) break;
    if (!existing.has(fallback.id)) actions.push(fallback);
  }
  return actions.slice(0, 3);
}

export function getHomeMetrics(state: HomeState, now = new Date()): HomeMetric[] {
  const documents = state.documents ?? [];
  const relevantTasks = state.tasks ?? [];
  const today = dateKey(now);
  const habits = state.habits ?? [];

  return [
    {
      id: 'docs', module: 'docs', label: 'Document vault',
      done: documents.filter((item) => item.status === 'done').length,
      total: documents.length, color: 'var(--teal)',
    },
    {
      id: 'tasks', module: 'tasks', label: 'Life admin',
      done: relevantTasks.filter((item) => item.status === 'done').length,
      total: relevantTasks.length, color: 'var(--terracotta)',
    },
    {
      id: 'habits', module: 'habits', label: 'Today',
      done: habits.filter((habit) => habit.lastDone === today).length,
      total: habits.length, color: 'var(--gold)',
    },
  ];
}

export function getMoneySnapshot(state: HomeState): MoneySnapshot {
  const monthly = state.budget?.monthly ?? [];
  const income = state.budget?.monthlyIncome ?? 0;
  const planned = monthly.reduce((sum, item) => sum + (item.planned ?? 0), 0);
  const spent = monthly.reduce((sum, item) => sum + (item.spent ?? 0), 0);
  return {
    currency: state.budget?.currency || 'AED',
    income,
    planned,
    spent,
    remaining: income - spent,
    spentPercent: income > 0 ? Math.max(0, Math.round((spent / income) * 100)) : 0,
  };
}

export function buildHomeModel(state: HomeState, now = new Date()): HomeModel {
  const metrics = getHomeMetrics(state, now);
  const setupMetrics = metrics.filter((metric) => metric.id !== 'habits');
  const dailyMode = getDailyMode(state, now);
  return {
    journey: getJourneyPhase(state.moveDate, now),
    dailyMode,
    dailyModeCopy: getDailyModeCopy(dailyMode),
    phrase: getDailyPhrase(now),
    priorities: getHomePriorities(state, now),
    metrics,
    money: getMoneySnapshot(state),
    setupDone: setupMetrics.reduce((sum, metric) => sum + metric.done, 0),
    setupTotal: setupMetrics.reduce((sum, metric) => sum + metric.total, 0),
    contactCount: (state.contacts ?? []).filter((contact) => contact.phone || contact.email).length,
    homePhotoCount: (state.housing?.rooms ?? []).reduce((sum, room) => sum + (room.photos?.length ?? 0), 0),
    todayKey: dateKey(now),
  };
}
