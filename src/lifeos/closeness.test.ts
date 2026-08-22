import { describe, expect, it } from 'vitest';
import {
  THOUGHT_COOLDOWN_SECONDS,
  THOUGHT_GESTURES,
  bothCheckedInRun,
  buildPulseRhythm,
  cooldownRemaining,
  countdownLabel,
  daysBetween,
  describeThought,
  formatDateKey,
  gestureById,
  isThoughtGesture,
  nextOccurrence,
  nextReunion,
  occurrenceYears,
  partnerPresence,
  relativeSince,
  resolveCoupleDates,
  reunionHeadline,
  rhythmSummary,
  shiftDateKey,
  suggestGesture,
} from './closeness';

const ABU_DHABI = 'Asia/Dubai';
const JOHANNESBURG = 'Africa/Johannesburg';

describe('thoughts', () => {
  it('offers a closed, unique vocabulary', () => {
    expect(THOUGHT_GESTURES.length).toBeGreaterThan(0);
    const ids = THOUGHT_GESTURES.map((gesture) => gesture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const gesture of THOUGHT_GESTURES) {
      expect(gesture.glyph).toBeTruthy();
      expect(gesture.label).toBeTruthy();
      expect(gesture.phrase).toBeTruthy();
    }
  });

  it('only recognises gestures it defines', () => {
    expect(isThoughtGesture('heart')).toBe(true);
    expect(isThoughtGesture('kiss')).toBe(false);
    expect(isThoughtGesture(null)).toBe(false);
    expect(gestureById('moon')?.glyph).toBe('☾');
    expect(gestureById('nonsense')).toBeNull();
  });

  it('counts the cooldown down to zero and never below', () => {
    const now = new Date('2026-08-22T10:00:30Z');
    expect(cooldownRemaining(null, now)).toBe(0);
    expect(cooldownRemaining('2026-08-22T10:00:20Z', now)).toBe(20);
    expect(cooldownRemaining('2026-08-22T10:00:00Z', now)).toBe(0);
    expect(cooldownRemaining('2026-08-22T09:00:00Z', now)).toBe(0);
  });

  it('never reports more cooldown than the limit allows', () => {
    const now = new Date('2026-08-22T10:00:00Z');
    expect(cooldownRemaining(now.toISOString(), now)).toBe(THOUGHT_COOLDOWN_SECONDS);
  });

  it('ignores an unparseable timestamp rather than blocking the button', () => {
    expect(cooldownRemaining('not-a-date', new Date())).toBe(0);
  });

  it('describes a thought from each side', () => {
    expect(describeThought('heart', 'Sam', false)).toBe('Sam is thinking of you');
    expect(describeThought('heart', 'Sam', true)).toBe('You are thinking of them');
    expect(describeThought('hug', 'Sam', true)).toBe('You are sending them a hug');
    expect(describeThought('star', 'Sam', false)).toBe('Sam is proud of you');
  });

  it('falls back gracefully for a gesture it does not know', () => {
    expect(describeThought('kiss', 'Sam', false)).toBe('Sam sent you a thought');
    expect(describeThought('kiss', 'Sam', true)).toBe('You sent a thought');
  });

  it('suggests a greeting that matches the hour where they are', () => {
    // 07:00 in Abu Dhabi.
    expect(suggestGesture(ABU_DHABI, new Date('2026-08-22T03:00:00Z'))).toBe('sun');
    // 23:00 in Abu Dhabi.
    expect(suggestGesture(ABU_DHABI, new Date('2026-08-22T19:00:00Z'))).toBe('moon');
    // 15:00 in Abu Dhabi.
    expect(suggestGesture(ABU_DHABI, new Date('2026-08-22T11:00:00Z'))).toBe('heart');
  });

  it('falls back to a heart when the zone is missing or invalid', () => {
    expect(suggestGesture(null)).toBe('heart');
    expect(suggestGesture('Not/AZone')).toBe('heart');
  });
});

describe('relative time', () => {
  const now = new Date('2026-08-22T12:00:00Z');

  it('stays terse across every scale', () => {
    expect(relativeSince('2026-08-22T11:59:30Z', now)).toBe('Just now');
    expect(relativeSince('2026-08-22T11:56:00Z', now)).toBe('4m');
    expect(relativeSince('2026-08-22T10:00:00Z', now)).toBe('2h');
    expect(relativeSince('2026-08-19T12:00:00Z', now)).toBe('3d');
    expect(relativeSince('2026-08-01T12:00:00Z', now)).toBe('3w');
  });

  it('does not go negative when a clock is slightly ahead', () => {
    expect(relativeSince('2026-08-22T12:00:30Z', now)).toBe('Just now');
  });

  it('says nothing for a missing or unparseable timestamp', () => {
    expect(relativeSince(null, now)).toBe('');
    expect(relativeSince('whenever', now)).toBe('');
  });
});

describe('dates that matter', () => {
  it('measures whole days in both directions', () => {
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0);
    expect(daysBetween('2026-08-22', '2026-09-01')).toBe(10);
    expect(daysBetween('2026-08-22', '2026-08-20')).toBe(-2);
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7);
  });

  it('crosses a leap day without drifting', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
  });

  it('returns zero rather than NaN for malformed keys', () => {
    expect(daysBetween('nope', '2026-08-22')).toBe(0);
    expect(daysBetween('2026-08-22', '22/08/2026')).toBe(0);
  });

  it('keeps a one-off on its own date even once it has passed', () => {
    expect(nextOccurrence('2026-08-20', false, '2026-08-22')).toBe('2026-08-20');
    expect(nextOccurrence('2026-09-30', false, '2026-08-22')).toBe('2026-09-30');
  });

  it('rolls a repeating date to this year, then to next', () => {
    expect(nextOccurrence('2019-11-04', true, '2026-08-22')).toBe('2026-11-04');
    expect(nextOccurrence('2019-03-04', true, '2026-08-22')).toBe('2027-03-04');
  });

  it('treats a repeating date landing on today as still ahead', () => {
    expect(nextOccurrence('2019-08-22', true, '2026-08-22')).toBe('2026-08-22');
  });

  it('lands a 29 February anniversary on the 28th in a common year', () => {
    expect(nextOccurrence('2024-02-29', true, '2027-01-01')).toBe('2027-02-28');
    expect(nextOccurrence('2024-02-29', true, '2028-01-01')).toBe('2028-02-29');
  });

  it('rejects malformed dates instead of inventing an occurrence', () => {
    expect(nextOccurrence('not-a-date', true, '2026-08-22')).toBeNull();
    expect(nextOccurrence('2026-08-22', true, 'nope')).toBeNull();
  });

  it('counts completed years only for a later occurrence', () => {
    expect(occurrenceYears('2019-11-04', '2026-11-04')).toBe(7);
    expect(occurrenceYears('2026-11-04', '2026-11-04')).toBeNull();
  });

  it('sorts soonest first and pushes passed dates to the end', () => {
    const dates = [
      { id: 1, kind: 'milestone' as const, label: 'Visa renewal', happens_on: '2026-10-01', repeats_annually: false },
      { id: 2, kind: 'reunion' as const, label: 'Sam lands', happens_on: '2026-08-30', repeats_annually: false },
      { id: 3, kind: 'milestone' as const, label: 'Moved in', happens_on: '2026-08-01', repeats_annually: false },
      { id: 4, kind: 'anniversary' as const, label: 'Us', happens_on: '2019-09-05', repeats_annually: true },
    ];
    const resolved = resolveCoupleDates(dates, '2026-08-22');
    expect(resolved.map((item) => item.date.id)).toEqual([2, 4, 1, 3]);
    expect(resolved[0].daysAway).toBe(8);
    expect(resolved[1].years).toBe(7);
    expect(resolved[3].passed).toBe(true);
    expect(resolved[3].daysAway).toBe(-21);
  });

  it('orders several passed dates most recent first', () => {
    const dates = [
      { id: 1, kind: 'milestone' as const, label: 'Older', happens_on: '2026-07-01', repeats_annually: false },
      { id: 2, kind: 'milestone' as const, label: 'Newer', happens_on: '2026-08-20', repeats_annually: false },
    ];
    expect(resolveCoupleDates(dates, '2026-08-22').map((item) => item.date.id)).toEqual([2, 1]);
  });

  it('pins the soonest reunion still ahead', () => {
    const dates = [
      { id: 1, kind: 'reunion' as const, label: 'December', happens_on: '2026-12-18', repeats_annually: false },
      { id: 2, kind: 'reunion' as const, label: 'September', happens_on: '2026-09-04', repeats_annually: false },
      { id: 3, kind: 'anniversary' as const, label: 'Us', happens_on: '2019-08-25', repeats_annually: true },
    ];
    const pinned = nextReunion(dates, '2026-08-22');
    expect(pinned?.date.id).toBe(2);
    expect(pinned?.daysAway).toBe(13);
  });

  it('holds a just-passed reunion on screen for a week, then lets it go', () => {
    const dates = [{ id: 1, kind: 'reunion' as const, label: 'Home', happens_on: '2026-08-19', repeats_annually: false }];
    expect(nextReunion(dates, '2026-08-22')?.daysAway).toBe(-3);
    expect(nextReunion(dates, '2026-08-26')?.daysAway).toBe(-7);
    expect(nextReunion(dates, '2026-08-27')).toBeNull();
  });

  it('has no reunion to pin when none is recorded', () => {
    const dates = [{ id: 3, kind: 'birthday' as const, label: 'Sam', happens_on: '1994-04-02', repeats_annually: true }];
    expect(nextReunion(dates, '2026-08-22')).toBeNull();
    expect(nextReunion([], '2026-08-22')).toBeNull();
  });

  it('phrases a countdown in plain words', () => {
    expect(countdownLabel(0)).toBe('Today');
    expect(countdownLabel(1)).toBe('Tomorrow');
    expect(countdownLabel(12)).toBe('In 12 days');
    expect(countdownLabel(-1)).toBe('Yesterday');
    expect(countdownLabel(-4)).toBe('4 days ago');
  });

  it('warms the pinned reunion line as the day approaches', () => {
    expect(reunionHeadline(0)).toMatch(/same place/i);
    expect(reunionHeadline(1)).toMatch(/one more sleep/i);
    expect(reunionHeadline(5)).toBe('5 days until you are together.');
    expect(reunionHeadline(60)).toMatch(/60 days/);
    expect(reunionHeadline(-2)).toMatch(/you made it/i);
  });

  it('formats a date key without shifting it across a zone boundary', () => {
    expect(formatDateKey('2026-01-01')).toBe('1 January 2026');
    expect(formatDateKey('2026-12-31', false)).toBe('31 December');
    expect(formatDateKey('rubbish')).toBe('');
  });
});

describe('presence', () => {
  it('reads their clock and waking state from the stored zone', () => {
    // 16:30 in Abu Dhabi, 14:30 in Johannesburg.
    const now = new Date('2026-08-22T12:30:00Z');
    const theirs = partnerPresence(ABU_DHABI, now);
    expect(theirs.known).toBe(true);
    expect(theirs.clock).toBe('16:30');
    expect(theirs.quiet).toBe(false);
    expect(theirs.label).toBe('Afternoon');
    expect(partnerPresence(JOHANNESBURG, now).clock).toBe('14:30');
  });

  it('marks the hours when a message would wake them', () => {
    // 03:00 in Abu Dhabi.
    const night = partnerPresence(ABU_DHABI, new Date('2026-08-21T23:00:00Z'));
    expect(night.quiet).toBe(true);
    expect(night.label).toBe('Asleep');
    // 22:00 in Abu Dhabi is the first quiet hour of the evening.
    expect(partnerPresence(ABU_DHABI, new Date('2026-08-22T18:00:00Z')).quiet).toBe(true);
    // 07:00 is the first waking hour.
    expect(partnerPresence(ABU_DHABI, new Date('2026-08-22T03:00:00Z')).quiet).toBe(false);
  });

  it('says nothing rather than guessing when the zone is unusable', () => {
    for (const zone of [null, undefined, '', '   ', 'Middle/Earth']) {
      const presence = partnerPresence(zone);
      expect(presence.known).toBe(false);
      expect(presence.clock).toBe('');
      expect(presence.quiet).toBe(false);
    }
  });
});

describe('pulse rhythm', () => {
  const me = 'me';
  const them = 'them';

  function checkIn(userId: string, date: string) {
    return { user_id: userId, checkin_date: date };
  }

  it('lays out a fortnight oldest first, ending today', () => {
    const rhythm = buildPulseRhythm([], me, them, '2026-08-22');
    expect(rhythm).toHaveLength(14);
    expect(rhythm[0].dateKey).toBe('2026-08-09');
    expect(rhythm[13].dateKey).toBe('2026-08-22');
  });

  it('places each person on the right day and marks the shared ones', () => {
    const rhythm = buildPulseRhythm([
      checkIn(me, '2026-08-22'),
      checkIn(them, '2026-08-22'),
      checkIn(me, '2026-08-21'),
    ], me, them, '2026-08-22', 3);

    expect(rhythm.map((day) => day.dateKey)).toEqual(['2026-08-20', '2026-08-21', '2026-08-22']);
    expect(rhythm[0]).toMatchObject({ mine: null, theirs: null, both: false });
    expect(rhythm[1].mine).not.toBeNull();
    expect(rhythm[1].theirs).toBeNull();
    expect(rhythm[1].both).toBe(false);
    expect(rhythm[2].both).toBe(true);
  });

  it('ignores check-ins from outside the window and from other people', () => {
    const rhythm = buildPulseRhythm([
      checkIn(me, '2026-07-01'),
      checkIn('someone-else', '2026-08-22'),
      checkIn(them, '2026-08-22'),
    ], me, them, '2026-08-22', 3);
    expect(rhythm.filter((day) => day.mine).length).toBe(0);
    expect(rhythm[2].theirs).not.toBeNull();
  });

  it('handles a solo space with no partner yet', () => {
    const rhythm = buildPulseRhythm([checkIn(me, '2026-08-22')], me, null, '2026-08-22', 2);
    expect(rhythm[1].mine).not.toBeNull();
    expect(rhythm[1].both).toBe(false);
  });

  it('clamps the window and refuses a malformed today', () => {
    expect(buildPulseRhythm([], me, them, '2026-08-22', 0)).toHaveLength(1);
    expect(buildPulseRhythm([], me, them, '2026-08-22', 500)).toHaveLength(60);
    expect(buildPulseRhythm([], me, them, 'today')).toEqual([]);
  });

  it('counts a run of shared days', () => {
    const days = ['2026-08-20', '2026-08-21', '2026-08-22'];
    const rhythm = buildPulseRhythm(
      days.flatMap((day) => [checkIn(me, day), checkIn(them, day)]),
      me, them, '2026-08-22', 3,
    );
    expect(bothCheckedInRun(rhythm)).toBe(3);
  });

  it('does not reset the run just because today is still incomplete', () => {
    const rhythm = buildPulseRhythm([
      checkIn(me, '2026-08-20'), checkIn(them, '2026-08-20'),
      checkIn(me, '2026-08-21'), checkIn(them, '2026-08-21'),
      checkIn(me, '2026-08-22'),
    ], me, them, '2026-08-22', 3);
    expect(rhythm[2].both).toBe(false);
    expect(bothCheckedInRun(rhythm)).toBe(2);
  });

  it('ends a run at a whole day one of you missed', () => {
    const rhythm = buildPulseRhythm([
      checkIn(me, '2026-08-19'), checkIn(them, '2026-08-19'),
      checkIn(me, '2026-08-20'),
      checkIn(me, '2026-08-21'), checkIn(them, '2026-08-21'),
      checkIn(me, '2026-08-22'), checkIn(them, '2026-08-22'),
    ], me, them, '2026-08-22', 4);
    expect(bothCheckedInRun(rhythm)).toBe(2);
  });

  it('reports no run for an empty fortnight', () => {
    expect(bothCheckedInRun(buildPulseRhythm([], me, them, '2026-08-22'))).toBe(0);
    expect(bothCheckedInRun([])).toBe(0);
  });

  it('summarises the rhythm without ever telling anyone off', () => {
    const empty = buildPulseRhythm([], me, them, '2026-08-22');
    expect(rhythmSummary(empty)).toMatch(/one tap away/i);

    const single = buildPulseRhythm(
      [checkIn(me, '2026-08-18'), checkIn(them, '2026-08-18')],
      me, them, '2026-08-22',
    );
    expect(rhythmSummary(single)).toBe('1 shared day in the last fortnight.');

    const run = buildPulseRhythm(
      ['2026-08-21', '2026-08-22'].flatMap((day) => [checkIn(me, day), checkIn(them, day)]),
      me, them, '2026-08-22',
    );
    expect(rhythmSummary(run)).toBe('2 days running that you both checked in.');
  });

  it('shifts a date key across month and year ends', () => {
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDateKey('2026-08-22', 3)).toBe('2026-08-25');
    expect(shiftDateKey('nope', -1)).toBe('nope');
  });
});
