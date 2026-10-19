import { describe, expect, it } from 'vitest';
import { progress, weekStart } from '../src/shared/streak';

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('weekStart', () => {
  it('starts weeks on Monday', () => {
    expect(new Date(weekStart(day(2026, 10, 18))).getDay()).toBe(1); // a Sunday -> previous Monday
    expect(weekStart(day(2026, 10, 19))).toBe(new Date(2026, 9, 19).getTime());
  });
});

describe('progress', () => {
  const now = day(2026, 10, 21); // Wednesday
  it('counts this week and the streak of prior weeks meeting the goal', () => {
    const times = [
      day(2026, 10, 19), day(2026, 10, 20), // this week: 2
      day(2026, 10, 13), day(2026, 10, 14), // last week: 2
      day(2026, 10, 6), day(2026, 10, 7), // two weeks ago: 2
      day(2026, 9, 29), // three weeks ago: 1 (breaks)
    ];
    expect(progress(times, 2, now)).toEqual({ thisWeek: 2, goal: 2, streakWeeks: 3 });
  });
  it('does not count an unfinished current week against the streak', () => {
    expect(progress([day(2026, 10, 13), day(2026, 10, 14)], 2, now)).toEqual({ thisWeek: 0, goal: 2, streakWeeks: 1 });
  });
});
