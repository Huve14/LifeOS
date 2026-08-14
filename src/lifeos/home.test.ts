import { describe, expect, it } from 'vitest';
import {
  buildHomeModel,
  getConnectionSnapshot,
  getDailyMode,
  getDailyPhrase,
  getHomePriorities,
  getLifeGlance,
  getJourneyPhase,
  getMoneySnapshot,
} from './home';

const state = {
  moveDate: '2026-08-10',
  documents: [
    { id: 'passport', name: 'Passport', status: 'done' },
    { id: 'medical', name: 'Medical fitness test', status: 'pending', note: 'Book after arrival' },
    { id: 'eid', name: 'Emirates ID', status: 'pending' },
  ],
  tasks: [
    { id: 'before', text: 'Book flight', when: '30 days', status: 'done' },
    { id: 'bank', text: 'Open a UAE bank account', when: 'After', status: 'pending' },
  ],
  habits: [
    { id: 'water', name: 'Drink water', emoji: '💧', lastDone: '' },
    { id: 'walk', name: 'Take a walk', emoji: '🚶', lastDone: '2026-08-14' },
  ],
  shopping: [{ id: 'bedding', name: 'Bedding', status: 'toBuy' }],
  packing: { rooms: [] },
  contacts: [{ phone: '+971' }, {}],
  housing: { rooms: [{ photos: ['one.jpg'] }, { photos: [] }] },
  budget: {
    currency: 'AED',
    monthlyIncome: 8_800,
    monthly: [
      { planned: 1_200, spent: 400 },
      { planned: 500, spent: 100 },
    ],
  },
};

describe('getJourneyPhase', () => {
  it('turns a passed move date into a settling-in chapter', () => {
    const phase = getJourneyPhase('2026-08-10', new Date(2026, 7, 14, 12));
    expect(phase.isAfterMove).toBe(true);
    expect(phase.daysSinceMove).toBe(4);
    expect(phase.eyebrow).toContain('SETTLING IN');
    expect(phase.timeLabel).toBe('4 days in Abu Dhabi');
  });

  it('never returns to departure planning for a legacy future move date', () => {
    const phase = getJourneyPhase('2026-08-18', new Date(2026, 7, 14, 12));
    expect(phase.isAfterMove).toBe(true);
    expect(phase.daysUntilMove).toBe(4);
    expect(phase.daysSinceMove).toBe(0);
    expect(phase.eyebrow).toBe('YOUR ABU DHABI LIFE');
    expect(`${phase.title} ${phase.description} ${phase.timeLabel}`).not.toMatch(/move|fly|departure|to go/i);
  });
});

describe('getHomePriorities', () => {
  it('mixes current life admin, wellbeing, and the document vault', () => {
    const priorities = getHomePriorities(state, new Date(2026, 7, 14, 12));
    expect(priorities.map((item) => item.kind)).toEqual(['task', 'habit', 'document']);
    expect(priorities.map((item) => item.title)).toEqual([
      'Open a UAE bank account',
      'Drink water',
      'Medical fitness test',
    ]);
  });

  it('always returns three useful destinations when all checklists are complete', () => {
    const complete = {
      ...state,
      documents: state.documents.map((item) => ({ ...item, status: 'done' })),
      tasks: state.tasks.map((item) => ({ ...item, status: 'done' })),
      habits: state.habits.map((item) => ({ ...item, lastDone: '2026-08-14' })),
      shopping: state.shopping.map((item) => ({ ...item, status: 'packed' })),
    };
    const priorities = getHomePriorities(complete, new Date(2026, 7, 14, 12));
    expect(priorities).toHaveLength(3);
    expect(priorities.every((item) => item.kind === 'link')).toBe(true);
  });

  it('does not surface a retired departure task or packing item', () => {
    const beforeMove = {
      ...state,
      moveDate: '2026-09-10',
      tasks: [{ id: 'flight', text: 'Book the flight', when: '30 days', status: 'pending' }],
      packing: {
        rooms: [{ label: 'Carry-on', items: [{ id: 'charger', name: 'Pack the charger', status: 'pending' }] }],
      },
    };
    const priorities = getHomePriorities(beforeMove, new Date(2026, 7, 14, 12));
    expect(priorities.map((item) => item.kind)).toEqual(['habit', 'document', 'shopping']);
    expect(priorities.map((item) => item.title)).not.toContain('Book the flight');
    expect(priorities.map((item) => item.title)).not.toContain('Pack the charger');
  });

  it('turns discovery into the first step on a curious day', () => {
    const curiousState = {
      ...state,
      dailyMode: { date: '2026-08-14', value: 'curious' as const },
    };
    const priorities = getHomePriorities(curiousState, new Date(2026, 7, 14, 12));
    expect(priorities[0]).toMatchObject({ module: 'map', title: 'Find a new local anchor' });
    expect(priorities[1].kind).toBe('habit');
  });
});

describe('daily life helpers', () => {
  it('resets yesterday’s selected pace back to steady', () => {
    expect(getDailyMode({ dailyMode: { date: '2026-08-13', value: 'focused' } }, new Date(2026, 7, 14, 12))).toBe('steady');
    expect(getDailyMode({ dailyMode: { date: '2026-08-14', value: 'focused' } }, new Date(2026, 7, 14, 12))).toBe('focused');
  });

  it('keeps the phrase stable for the whole calendar day', () => {
    const morning = getDailyPhrase(new Date(2026, 7, 14, 8));
    const evening = getDailyPhrase(new Date(2026, 7, 14, 21));
    expect(morning).toEqual(evening);
    expect(morning.arabic.length).toBeGreaterThan(0);
    expect(morning.transliteration.length).toBeGreaterThan(0);
  });

  it('shows both relationship clocks and recognises a sensible call window', () => {
    const connection = getConnectionSnapshot(new Date('2026-08-14T12:00:00Z'));
    expect(connection).toMatchObject({
      abuDhabiTime: '16:00',
      johannesburgTime: '14:00',
      isGoodWindow: true,
    });
  });
});

describe('home snapshots', () => {
  it('calculates the AED amount still available this month', () => {
    expect(getMoneySnapshot(state)).toMatchObject({
      currency: 'AED', income: 8_800, planned: 1_700, spent: 500, remaining: 8_300, spentPercent: 6,
    });
  });

  it('counts current life admin, support contacts, and home photos', () => {
    const model = buildHomeModel(state, new Date(2026, 7, 14, 12));
    expect(model.setupDone).toBe(2);
    expect(model.setupTotal).toBe(5);
    expect(model.contactCount).toBe(1);
    expect(model.homePhotoCount).toBe(1);
  });

  it('builds an actionable life-at-a-glance summary from live user data', () => {
    const glance = getLifeGlance({
      ...state,
      tasks: [
        { id: 'late', text: 'Renew parking', dueDate: '2026-08-13', status: 'pending' },
        { id: 'today', text: 'Call the bank', dueDate: '2026-08-14', status: 'pending' },
        { id: 'done', text: 'Buy groceries', dueDate: '2026-08-12', status: 'done' },
      ],
    }, new Date(2026, 7, 14, 12));

    expect(glance).toMatchObject({
      openTasks: 2,
      dueToday: 1,
      overdue: 1,
      nextTaskTitle: 'Renew parking',
      nextTaskTiming: '1 day overdue',
      documentsPending: 2,
      habitsDone: 1,
      habitsTotal: 2,
    });
    expect(glance.score).toBe(38);
  });
});
