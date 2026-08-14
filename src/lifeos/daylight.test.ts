import { describe, expect, it } from 'vitest';
import {
  getAbuDhabiSunTimes,
  getNextAbuDhabiLightChange,
  isNightInAbuDhabi,
} from './daylight';

const abuDhabiClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

describe('Abu Dhabi daylight', () => {
  it('calculates realistic summer sunrise and sunset times', () => {
    const times = getAbuDhabiSunTimes(new Date('2026-08-14T08:00:00Z'));
    expect(abuDhabiClock.format(times.sunrise)).toMatch(/^05:5\d$/);
    expect(abuDhabiClock.format(times.sunset)).toMatch(/^18:5\d$/);
  });

  it('uses Abu Dhabi daylight even when given UTC timestamps', () => {
    expect(isNightInAbuDhabi(new Date('2026-08-14T08:00:00Z'))).toBe(false);
    expect(isNightInAbuDhabi(new Date('2026-08-14T16:00:00Z'))).toBe(true);
  });

  it('selects sunset during the day and next sunrise after sunset', () => {
    const daytime = new Date('2026-08-14T08:00:00Z');
    const nighttime = new Date('2026-08-14T16:00:00Z');
    expect(getNextAbuDhabiLightChange(daytime).getTime())
      .toBe(getAbuDhabiSunTimes(daytime).sunset.getTime());
    expect(getNextAbuDhabiLightChange(nighttime).getTime()).toBeGreaterThan(nighttime.getTime());
    expect(abuDhabiClock.format(getNextAbuDhabiLightChange(nighttime))).toMatch(/^05:5\d$/);
  });
});
