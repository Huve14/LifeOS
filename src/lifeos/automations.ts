import { getAuthClient, getCurrentUser, hasConfig } from '../supabase';

export type AutomationPreferences = {
  userId: string;
  priceWatchAlerts: boolean;
  fxAlerts: boolean;
  fxTarget: number | null;
  fxDirection: 'above' | 'below';
  weeklyDealsDigest: boolean;
  eventReminders: boolean;
  newcomerBuddy: boolean;
};

export type ArrivalTask = {
  id: string;
  key: string;
  title: string;
  detail: string;
  dueOn: string | null;
  status: 'pending' | 'done' | 'not_needed';
};

export type DailyBrief = {
  date: string;
  generatedAt: string;
  weather: { temperatureC: number | null; code: number | null; label: string };
  prayer: { fajr: string; dhuhr: string; asr: string; maghrib: string; isha: string };
  fx: { rate: number | null; date: string; base: 'AED'; quote: 'ZAR' };
  events: Array<{ id?: string; slug?: string; title: string; starts_at: string; location?: string; venue?: string; category?: string }>;
  nextDeadline: { id: string; title: string; detail: string; due_on: string } | null;
  stale: boolean;
};

export type ToolkitItem = {
  slug: string;
  category: 'visa' | 'emergency' | 'embassy' | 'arrival';
  title: string;
  summary: string;
  steps: string[];
  phone: string | null;
  url: string | null;
  sortOrder: number;
};

export type WelcomeDraft = {
  title: string;
  body: string;
  publishedAt: string | null;
};

export type BuddyMatch = {
  userId: string;
  displayName: string;
  homeTown: string;
  emirate: string;
};

type Row = Record<string, unknown>;

export const OFFLINE_TOOLKIT: ToolkitItem[] = [
  {
    slug: 'uae-emergency', category: 'emergency', title: 'UAE emergency numbers',
    summary: 'Keep these available without signal.',
    steps: ['Police: 999', 'Ambulance: 998', 'Fire: 997', 'Save your insurer and building security numbers too.'],
    phone: '999', url: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies', sortOrder: 10,
  },
  {
    slug: 'sa-embassy', category: 'embassy', title: 'South African Embassy · Abu Dhabi',
    summary: 'Consular help for South African citizens in the UAE.',
    steps: ['Check the official page before travelling.', 'Keep a copy of your passport and UAE residence details.', 'Use emergency numbers first for immediate danger.'],
    phone: null, url: 'https://dirco.gov.za/abu-dhabi/', sortOrder: 20,
  },
  {
    slug: 'residence-visa', category: 'visa', title: 'Residence visa essentials',
    summary: 'A calm checklist for the usual residence process.',
    steps: ['Keep entry permit and passport copies private.', 'Complete the required medical fitness step.', 'Follow biometrics and Emirates ID status.', 'Confirm exact requirements with ICP or your sponsor.'],
    phone: null, url: 'https://icp.gov.ae/', sortOrder: 30,
  },
  {
    slug: 'emirates-id', category: 'visa', title: 'Emirates ID follow-up',
    summary: 'Track biometrics, delivery and the digital ID copy.',
    steps: ['Keep the application number.', 'Check status through ICP.', 'Update banks and services after receiving it.'],
    phone: null, url: 'https://icp.gov.ae/', sortOrder: 40,
  },
  {
    slug: 'first-48-hours', category: 'arrival', title: 'Your first 48 hours',
    summary: 'The practical minimum for a calm landing.',
    steps: ['Get a working SIM or eSIM.', 'Save home and work in Maps.', 'Stock water, simple food and medication.', 'Tell someone you arrived safely.'],
    phone: null, url: null, sortOrder: 50,
  },
];

const EMPTY_BRIEF: DailyBrief = {
  date: localDateKey(), generatedAt: new Date().toISOString(),
  weather: { temperatureC: null, code: null, label: 'Weather updates when online' },
  prayer: { fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' },
  fx: { rate: null, date: '', base: 'AED', quote: 'ZAR' },
  events: [], nextDeadline: null, stale: true,
};

export function localDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function addDays(dateKey: string, days: number): string {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : localDateKey();
  const date = new Date(`${valid}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildArrivalTasks(arrivedOn: string): Array<Omit<ArrivalTask, 'id'>> {
  return [
    { key: 'medical_fitness', title: 'Book your medical fitness screening', detail: 'Keep the result with your private documents.', dueOn: addDays(arrivedOn, 30), status: 'pending' },
    { key: 'emirates_id', title: 'Follow up on your Emirates ID', detail: 'Track biometrics and application status.', dueOn: addDays(arrivedOn, 35), status: 'pending' },
    { key: 'driving_licence', title: 'Check your driving licence conversion', detail: 'Confirm current eligibility and the required eye test.', dueOn: addDays(arrivedOn, 90), status: 'pending' },
  ];
}

export function shouldNotifyFx(rate: number, target: number, direction: 'above' | 'below'): boolean {
  if (!Number.isFinite(rate) || !Number.isFinite(target) || target <= 0) return false;
  return direction === 'below' ? rate <= target : rate >= target;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asRow(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

export function prepareDailyBrief(value: unknown, stale = false): DailyBrief {
  const row = asRow(value);
  const weather = asRow(row.weather);
  const prayer = asRow(row.prayer);
  const fx = asRow(row.fx);
  const deadline = asRow(row.nextDeadline);
  const events = Array.isArray(row.events) ? row.events.map(asRow).filter(event => string(event.title)) : [];
  return {
    date: string(row.date) || localDateKey(),
    generatedAt: string(row.generatedAt) || new Date().toISOString(),
    weather: {
      temperatureC: numberOrNull(weather.temperatureC),
      code: numberOrNull(weather.code), label: string(weather.label) || 'Weather updates when online',
    },
    prayer: {
      fajr: string(prayer.fajr), dhuhr: string(prayer.dhuhr), asr: string(prayer.asr),
      maghrib: string(prayer.maghrib), isha: string(prayer.isha),
    },
    fx: { rate: numberOrNull(fx.rate), date: string(fx.date), base: 'AED', quote: 'ZAR' },
    events: events.map(event => ({
      id: string(event.id) || undefined, slug: string(event.slug) || undefined,
      title: string(event.title), starts_at: string(event.starts_at),
      location: string(event.location) || undefined, venue: string(event.venue) || undefined,
      category: string(event.category) || undefined,
    })),
    nextDeadline: string(deadline.title) ? {
      id: string(deadline.id), title: string(deadline.title), detail: string(deadline.detail), due_on: string(deadline.due_on),
    } : null,
    stale: stale || row.stale === true,
  };
}

function currentUserId(): string {
  const id = getCurrentUser()?.id;
  if (!id) throw new Error('Sign in to manage automations.');
  return id;
}

export async function loadDailyBrief(): Promise<DailyBrief> {
  if (!hasConfig || !getCurrentUser()) return { ...EMPTY_BRIEF, date: localDateKey(), generatedAt: new Date().toISOString() };
  const client = getAuthClient();
  const invoked = await client.functions.invoke('automations', { body: { action: 'brief' } });
  if (!invoked.error && invoked.data) return prepareDailyBrief(invoked.data);
  const cached = await client.from('lifeos_daily_briefs').select('payload').order('brief_date', { ascending: false }).limit(1).maybeSingle();
  return cached.data?.payload ? prepareDailyBrief(cached.data.payload, true) : { ...EMPTY_BRIEF, date: localDateKey() };
}

export async function loadArrivalTasks(): Promise<ArrivalTask[]> {
  if (!hasConfig || !getCurrentUser()) return [];
  const { data, error } = await getAuthClient().from('lifeos_arrival_tasks')
    .select('id, task_key, title, detail, due_on, status').order('due_on');
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id, key: row.task_key, title: row.title, detail: row.detail,
    dueOn: row.due_on, status: row.status as ArrivalTask['status'],
  }));
}

export async function setArrivalTaskStatus(id: string, status: ArrivalTask['status']): Promise<void> {
  currentUserId();
  const { error } = await getAuthClient().from('lifeos_arrival_tasks').update({
    status, completed_at: status === 'done' ? new Date().toISOString() : null,
  }).eq('id', id);
  if (error) throw error;
}

export async function loadAutomationPreferences(): Promise<AutomationPreferences> {
  const userId = currentUserId();
  const { data, error } = await getAuthClient().from('lifeos_automation_preferences')
    .select('user_id, price_watch_alerts, fx_alerts, fx_target, fx_direction, weekly_deals_digest, event_reminders, newcomer_buddy')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const row = asRow(data);
  return {
    userId, priceWatchAlerts: row.price_watch_alerts !== false, fxAlerts: row.fx_alerts === true,
    fxTarget: numberOrNull(row.fx_target), fxDirection: row.fx_direction === 'below' ? 'below' : 'above',
    weeklyDealsDigest: row.weekly_deals_digest !== false, eventReminders: row.event_reminders !== false,
    newcomerBuddy: row.newcomer_buddy === true,
  };
}

export async function saveAutomationPreferences(patch: Partial<Omit<AutomationPreferences, 'userId'>>): Promise<void> {
  const userId = currentUserId();
  const payload: Row = { user_id: userId };
  if (typeof patch.priceWatchAlerts === 'boolean') payload.price_watch_alerts = patch.priceWatchAlerts;
  if (typeof patch.fxAlerts === 'boolean') payload.fx_alerts = patch.fxAlerts;
  if (patch.fxTarget === null || Number.isFinite(patch.fxTarget)) payload.fx_target = patch.fxTarget;
  if (patch.fxDirection) payload.fx_direction = patch.fxDirection;
  if (typeof patch.weeklyDealsDigest === 'boolean') payload.weekly_deals_digest = patch.weeklyDealsDigest;
  if (typeof patch.eventReminders === 'boolean') payload.event_reminders = patch.eventReminders;
  if (typeof patch.newcomerBuddy === 'boolean') payload.newcomer_buddy = patch.newcomerBuddy;
  const { error } = await getAuthClient().from('lifeos_automation_preferences').upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  if (typeof patch.newcomerBuddy === 'boolean') {
    const buddy = await getAuthClient().from('lifeos_buddy_preferences').upsert({ user_id: userId, enabled: patch.newcomerBuddy }, { onConflict: 'user_id' });
    if (buddy.error) throw buddy.error;
  }
}

export async function loadToolkit(): Promise<ToolkitItem[]> {
  if (!hasConfig || !getCurrentUser()) return OFFLINE_TOOLKIT;
  const { data } = await getAuthClient().from('lifeos_toolkit_items')
    .select('slug, category, title, summary, steps, phone, url, sort_order').order('sort_order');
  if (!data?.length) return OFFLINE_TOOLKIT;
  return data.map(row => ({
    slug: row.slug, category: row.category as ToolkitItem['category'], title: row.title,
    summary: row.summary, steps: Array.isArray(row.steps) ? row.steps : [],
    phone: row.phone, url: row.url, sortOrder: row.sort_order,
  }));
}

export async function loadWelcomeDraft(): Promise<WelcomeDraft | null> {
  if (!hasConfig || !getCurrentUser()) return null;
  const { data } = await getAuthClient().from('lifeos_welcome_drafts')
    .select('title, body, published_at').maybeSingle();
  return data ? { title: data.title, body: data.body, publishedAt: data.published_at } : null;
}

export async function updateWelcomeDraft(title: string, body: string): Promise<void> {
  const ownerId = currentUserId();
  const { error } = await getAuthClient().from('lifeos_welcome_drafts')
    .update({ title: title.trim().slice(0, 220), body: body.trim().slice(0, 4000) }).eq('owner_id', ownerId);
  if (error) throw error;
}

export async function publishWelcomeDraft(): Promise<string> {
  currentUserId();
  const { data, error } = await getAuthClient().rpc('lifeos_publish_welcome_intro');
  if (error) throw error;
  return String(data);
}

export async function findBuddy(): Promise<BuddyMatch | null> {
  currentUserId();
  const { data, error } = await getAuthClient().rpc('lifeos_find_newcomer_buddy');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? {
    userId: row.user_id, displayName: row.display_name || 'Community member',
    homeTown: row.home_town || '', emirate: row.emirate || 'Abu Dhabi',
  } : null;
}
