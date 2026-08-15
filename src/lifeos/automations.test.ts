import { describe, expect, it } from 'vitest';
import { addDays, buildArrivalTasks, prepareDailyBrief, shouldNotifyFx } from './automations';

describe('arrival automation helpers', () => {
  it('builds stable deadline-aware tasks from the arrival date', () => {
    expect(addDays('2026-08-15', 30)).toBe('2026-09-14');
    expect(buildArrivalTasks('2026-08-15').map(task => task.dueOn)).toEqual([
      '2026-09-14', '2026-09-19', '2026-11-13',
    ]);
  });

  it('evaluates both rate alert directions', () => {
    expect(shouldNotifyFx(4.95, 4.9, 'above')).toBe(true);
    expect(shouldNotifyFx(4.85, 4.9, 'above')).toBe(false);
    expect(shouldNotifyFx(4.85, 4.9, 'below')).toBe(true);
  });
});

describe('daily brief preparation', () => {
  it('normalises server payload and marks cached data stale', () => {
    const brief = prepareDailyBrief({
      date: '2026-08-15', weather: { temperatureC: 39, label: 'Clear sky' },
      prayer: { fajr: '04:32', maghrib: '18:53' }, fx: { rate: 4.91 },
      events: [{ title: 'Braai', starts_at: '2026-08-15T17:00:00+04:00' }],
      nextDeadline: { id: 'one', title: 'Medical', detail: 'Book it', due_on: '2026-08-30' },
    }, true);
    expect(brief.weather.temperatureC).toBe(39);
    expect(brief.prayer.maghrib).toBe('18:53');
    expect(brief.events[0].title).toBe('Braai');
    expect(brief.nextDeadline?.title).toBe('Medical');
    expect(brief.stale).toBe(true);
  });

  it('preserves missing numeric data as unavailable instead of zero', () => {
    const brief = prepareDailyBrief({ weather: { temperatureC: null, code: '' }, fx: { rate: null } });
    expect(brief.weather.temperatureC).toBeNull();
    expect(brief.weather.code).toBeNull();
    expect(brief.fx.rate).toBeNull();
  });
});
