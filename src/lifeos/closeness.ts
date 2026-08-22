// Closeness without a call.
//
// Live calling is hidden for UAE compliance, which takes away the one channel
// that carried an unplanned "I'm thinking of you". What is left — notes, the
// daily question, the adventure jar — all ask you to compose something. This
// module holds the pure logic behind the surfaces that do not:
//
//   thoughts   one tap, no words, lands on their phone
//   dates      the shared countdowns a distance runs on
//   presence   their clock, so you know before you send
//   rhythm     whether the two of you are actually keeping this up
//
// Everything here is a pure function of its arguments so the couple screen can
// stay a thin renderer and every rule is testable without Supabase.

// ---------------------------------------------------------------------------
// Thoughts
// ---------------------------------------------------------------------------

export type ThoughtGesture = 'heart' | 'hug' | 'smile' | 'star' | 'moon' | 'sun';

export type ThoughtGestureDef = {
  id: ThoughtGesture;
  glyph: string;
  label: string;
  /** What the recipient is told, and what the push notification says. */
  phrase: string;
};

/**
 * A closed vocabulary, deliberately. The whole value of a thought is that it
 * costs one tap; a free-text field would just be a slower note. Two of the six
 * are greetings, because that is the gesture a shared day loses first when the
 * two of you wake up hours apart.
 */
export const THOUGHT_GESTURES: readonly ThoughtGestureDef[] = [
  { id: 'heart', glyph: '♥', label: 'Thinking of you', phrase: 'is thinking of you' },
  { id: 'hug', glyph: '◡', label: 'A hug', phrase: 'is sending you a hug' },
  { id: 'smile', glyph: '☺', label: 'You made me smile', phrase: 'is smiling about you' },
  { id: 'star', glyph: '✦', label: 'Proud of you', phrase: 'is proud of you' },
  { id: 'sun', glyph: '☀', label: 'Good morning', phrase: 'is wishing you a good morning' },
  { id: 'moon', glyph: '☾', label: 'Goodnight', phrase: 'is wishing you goodnight' },
];

/** Matches the rate limit enforced by the database trigger. */
export const THOUGHT_COOLDOWN_SECONDS = 30;

export function gestureById(id: unknown): ThoughtGestureDef | null {
  return THOUGHT_GESTURES.find((gesture) => gesture.id === id) ?? null;
}

export function isThoughtGesture(value: unknown): value is ThoughtGesture {
  return gestureById(value) !== null;
}

/**
 * Seconds left before another thought may be sent. The button stays visible
 * and counts down rather than disappearing, so a double tap reads as "not yet"
 * instead of "broken".
 */
export function cooldownRemaining(lastSentAt: string | null | undefined, now = new Date()): number {
  if (!lastSentAt) return 0;
  const sent = new Date(lastSentAt).getTime();
  if (!Number.isFinite(sent)) return 0;
  const elapsed = (now.getTime() - sent) / 1000;
  return Math.max(0, Math.ceil(THOUGHT_COOLDOWN_SECONDS - elapsed));
}

/**
 * The line shown under a thought. First person for your own, so the strip
 * reads as a conversation rather than a log.
 */
export function describeThought(
  gesture: unknown,
  senderName: string,
  isMine: boolean,
): string {
  const found = gestureById(gesture);
  if (!found) return isMine ? 'You sent a thought' : `${senderName} sent you a thought`;
  const theirs = found.phrase;
  if (!isMine) return `${senderName} ${theirs}`;
  // "is thinking of you" -> "You are thinking of them".
  return `You ${theirs.replace(/^is /, 'are ').replace(/\byou\b/g, 'them')}`;
}

/**
 * Which gesture to offer first, based on the hour where they are. Sending
 * "goodnight" while they are at breakfast is the sort of small wrongness that
 * makes an app feel like it is not paying attention.
 */
export function suggestGesture(partnerZone: string | null | undefined, now = new Date()): ThoughtGesture {
  if (!partnerZone) return 'heart';
  const hour = hourInZone(partnerZone, now);
  if (hour === null) return 'heart';
  if (hour >= 5 && hour < 11) return 'sun';
  if (hour >= 21 || hour < 5) return 'moon';
  return 'heart';
}

/**
 * "Just now", "4m", "2h", "3d". Deliberately terse: a thought strip is a row of
 * small chips, and "about 4 minutes ago" would be longer than the thought.
 */
export function relativeSince(value: string | null | undefined, now = new Date()): string {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// ---------------------------------------------------------------------------
// Dates that matter
// ---------------------------------------------------------------------------

export type CoupleDateKind = 'reunion' | 'anniversary' | 'birthday' | 'milestone';

export type CoupleDateKindDef = {
  id: CoupleDateKind;
  glyph: string;
  label: string;
  /** Anniversaries and birthdays come round again; a flight does not. */
  repeatsByDefault: boolean;
};

export const COUPLE_DATE_KINDS: readonly CoupleDateKindDef[] = [
  { id: 'reunion', glyph: '✈', label: 'Together again', repeatsByDefault: false },
  { id: 'anniversary', glyph: '♥', label: 'Anniversary', repeatsByDefault: true },
  { id: 'birthday', glyph: '✦', label: 'Birthday', repeatsByDefault: true },
  { id: 'milestone', glyph: '◈', label: 'Milestone', repeatsByDefault: false },
];

export function dateKindById(id: unknown): CoupleDateKindDef | null {
  return COUPLE_DATE_KINDS.find((kind) => kind.id === id) ?? null;
}

export type CoupleDateLike = {
  id: number;
  kind: CoupleDateKind;
  label: string;
  happens_on: string;
  repeats_annually: boolean;
};

export type ResolvedCoupleDate<T extends CoupleDateLike = CoupleDateLike> = {
  date: T;
  /** The occurrence being counted down to, YYYY-MM-DD. */
  occursOn: string;
  daysAway: number;
  /** Non-repeating dates whose day has passed. Kept, not hidden. */
  passed: boolean;
  /** Completed years for a repeating date, when the original year is known. */
  years: number | null;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Days in a month, where month is 1-12. Day 0 of the next month is this one's last. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A 29 February anniversary has to land somewhere in a common year. It lands
 * on the 28th: the couple marking it will have already decided that is the
 * day, and rolling forward to 1 March would put it in the wrong month.
 */
function clampedKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, lastDayOfMonth(year, month)))}`;
}

/** Whole days from one calendar day to another. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  if (!isDateKey(from) || !isDateKey(to)) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * The occurrence a countdown should point at.
 *
 * A one-off keeps its own date even once it is behind you, because "that was
 * 4 days ago" is information the couple still wants. A repeating date rolls to
 * this year, or next year once this year's has passed.
 */
export function nextOccurrence(
  happensOn: string,
  repeatsAnnually: boolean,
  today: string,
): string | null {
  if (!isDateKey(happensOn) || !isDateKey(today)) return null;
  if (!repeatsAnnually) return happensOn;

  const [, month, day] = happensOn.split('-').map(Number);
  const thisYear = Number(today.slice(0, 4));
  const candidate = clampedKey(thisYear, month, day);
  return daysBetween(today, candidate) >= 0 ? candidate : clampedKey(thisYear + 1, month, day);
}

/**
 * Completed years at the given occurrence, for "3 years today". Null when the
 * date does not repeat or the occurrence is the original.
 */
export function occurrenceYears(happensOn: string, occursOn: string): number | null {
  if (!isDateKey(happensOn) || !isDateKey(occursOn)) return null;
  const years = Number(occursOn.slice(0, 4)) - Number(happensOn.slice(0, 4));
  return years > 0 ? years : null;
}

export function resolveCoupleDate<T extends CoupleDateLike>(
  date: T,
  today: string,
): ResolvedCoupleDate<T> | null {
  const occursOn = nextOccurrence(date.happens_on, date.repeats_annually, today);
  if (!occursOn) return null;
  const daysAway = daysBetween(today, occursOn);
  return {
    date,
    occursOn,
    daysAway,
    passed: daysAway < 0,
    years: date.repeats_annually ? occurrenceYears(date.happens_on, occursOn) : null,
  };
}

/**
 * Soonest first, with anything already behind you sorted to the end rather
 * than dropped — a reunion that happened yesterday is the most interesting
 * thing on the list for one more day.
 */
export function resolveCoupleDates<T extends CoupleDateLike>(
  dates: readonly T[],
  today: string,
): ResolvedCoupleDate<T>[] {
  return dates
    .map((date) => resolveCoupleDate(date, today))
    .filter((resolved): resolved is ResolvedCoupleDate<T> => resolved !== null)
    .sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1;
      if (a.daysAway !== b.daysAway) return a.passed ? b.daysAway - a.daysAway : a.daysAway - b.daysAway;
      return a.date.label.localeCompare(b.date.label);
    });
}

/**
 * The one date that gets pinned. A reunion still ahead beats everything; the
 * day itself beats a future one; and a reunion that has just passed is held on
 * screen for a week so "you made it" does not vanish overnight.
 */
export function nextReunion<T extends CoupleDateLike>(
  dates: readonly T[],
  today: string,
): ResolvedCoupleDate<T> | null {
  const reunions = resolveCoupleDates(dates, today).filter((item) => item.date.kind === 'reunion');
  const ahead = reunions.find((item) => !item.passed);
  if (ahead) return ahead;
  const recent = reunions.find((item) => item.daysAway >= -7);
  return recent ?? null;
}

/** "Today", "Tomorrow", "In 12 days", "4 days ago". */
export function countdownLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  if (daysAway === -1) return 'Yesterday';
  if (daysAway > 1) return `In ${daysAway} days`;
  return `${Math.abs(daysAway)} days ago`;
}

/** The warmer line for a pinned reunion. */
export function reunionHeadline(daysAway: number): string {
  if (daysAway === 0) return 'Today. You are in the same place.';
  if (daysAway === 1) return 'Tomorrow. One more sleep.';
  if (daysAway < 0) return 'You made it. Set the next one when you know it.';
  if (daysAway <= 7) return `${daysAway} days until you are together.`;
  return `${daysAway} days until you are in the same place.`;
}

/** "13 August 2026", in the reader's locale ordering but a fixed calendar. */
export function formatDateKey(key: string, withYear = true): string {
  if (!isDateKey(key)) return '';
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/** Hour 0-23 in a zone, or null when the zone is not one the browser knows. */
export function hourInZone(zone: string, now = new Date()): number | null {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', hourCycle: 'h23', timeZone: zone,
    }).formatToParts(now).find((part) => part.type === 'hour')?.value;
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clockInZone(zone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone,
    }).format(now);
  } catch {
    return '';
  }
}

export type Presence = {
  zone: string;
  clock: string;
  /** Outside 07:00-22:00 where they are. */
  quiet: boolean;
  /** Short state word for the pill: "Morning", "Asleep", and so on. */
  label: string;
  known: boolean;
};

/**
 * Their clock, shown next to their name. The couple screen is where you decide
 * whether to send something; knowing it is 04:00 for them is the difference
 * between a nice surprise and waking them up. The zone is already stored on
 * every member and was, until now, never shown.
 */
export function partnerPresence(zone: string | null | undefined, now = new Date()): Presence {
  const resolved = (zone || '').trim();
  const hour = resolved ? hourInZone(resolved, now) : null;
  if (hour === null) {
    return { zone: resolved, clock: '', quiet: false, label: '', known: false };
  }
  const quiet = hour < 7 || hour >= 22;
  const label = hour < 5 ? 'Asleep'
    : hour < 12 ? 'Morning'
      : hour < 17 ? 'Afternoon'
        : hour < 22 ? 'Evening'
          : 'Winding down';
  return { zone: resolved, clock: clockInZone(resolved, now), quiet, label, known: true };
}

// ---------------------------------------------------------------------------
// Pulse rhythm
// ---------------------------------------------------------------------------

export type CheckInLike = { user_id: string; checkin_date: string };

export type PulseDay<T extends CheckInLike = CheckInLike> = {
  dateKey: string;
  mine: T | null;
  theirs: T | null;
  both: boolean;
};

export function shiftDateKey(key: string, days: number): string {
  if (!isDateKey(key)) return key;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A fortnight of check-ins, oldest first, with gaps kept as gaps. The point is
 * to show a rhythm, not to score anyone, so a missed day renders as an empty
 * mark rather than a red one.
 */
export function buildPulseRhythm<T extends CheckInLike>(
  checkIns: readonly T[],
  myId: string | null | undefined,
  partnerId: string | null | undefined,
  todayKey: string,
  days = 14,
): PulseDay<T>[] {
  if (!isDateKey(todayKey)) return [];
  const span = Math.max(1, Math.min(60, Math.round(days)));
  const rhythm: PulseDay<T>[] = [];
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const dateKey = shiftDateKey(todayKey, -offset);
    const onDay = checkIns.filter((item) => item.checkin_date === dateKey);
    const mine = (myId && onDay.find((item) => item.user_id === myId)) || null;
    const theirs = (partnerId && onDay.find((item) => item.user_id === partnerId)) || null;
    rhythm.push({ dateKey, mine, theirs, both: Boolean(mine && theirs) });
  }
  return rhythm;
}

/**
 * Consecutive days both of you checked in.
 *
 * Counting stops at the most recent completed day rather than today, so the
 * number does not drop to zero every morning before either of you has opened
 * the app. A run only ends when a whole day passed with one of you missing.
 */
export function bothCheckedInRun(rhythm: readonly PulseDay[]): number {
  if (rhythm.length === 0) return 0;
  let index = rhythm.length - 1;
  // Today counts when it is already complete; when it is not, it is simply not
  // yet part of the run and yesterday is the place to start.
  if (!rhythm[index].both) index -= 1;
  let run = 0;
  for (; index >= 0; index -= 1) {
    if (!rhythm[index].both) break;
    run += 1;
  }
  return run;
}

/** The quiet one-liner under the rhythm strip. Never a reprimand. */
export function rhythmSummary(rhythm: readonly PulseDay[]): string {
  const run = bothCheckedInRun(rhythm);
  if (run >= 2) return `${run} days running that you both checked in.`;
  const shared = rhythm.filter((day) => day.both).length;
  if (shared > 0) return `${shared} shared ${shared === 1 ? 'day' : 'days'} in the last fortnight.`;
  return 'Your first shared day is one tap away.';
}
