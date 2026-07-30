import { describe, expect, it } from 'vitest';
import { getObjectiveForDate, resolveObjectiveAnchorDate } from '../objective-utils';

describe('getObjectiveForDate', () => {
  it('uses the objective configured for the requested month', () => {
    const result = getObjectiveForDate({
      monthlyObjective: 1000,
      monthlyObjectives: {
        '2026-06': 2000,
        '2026-07': 3000,
      },
    }, new Date(2026, 6, 15));

    expect(result).toEqual({ value: 3000, sourceMonth: '2026-07' });
  });

  it('falls back to the latest previous configured month', () => {
    const result = getObjectiveForDate({
      monthlyObjective: 1000,
      monthlyObjectives: {
        '2026-03': 2000,
        '2026-05': 2500,
      },
    }, new Date(2026, 6, 1));

    expect(result).toEqual({ value: 2500, sourceMonth: '2026-05' });
  });

  it('falls back to the legacy objective when no monthly objective applies', () => {
    const result = getObjectiveForDate({
      monthlyObjective: 1000,
      monthlyObjectives: {
        '2026-09': 3000,
      },
    }, new Date(2026, 6, 1));

    expect(result).toEqual({ value: 1000, sourceMonth: null });
  });
});

describe('resolveObjectiveAnchorDate', () => {
  it('keeps showing the active month until the configured visibility date ends', () => {
    const result = resolveObjectiveAnchorDate(new Date(2026, 7, 2, 10), {
      activeMonthKey: '2026-07',
      visibleUntil: '2026-08-03',
    });

    expect(result).toEqual(new Date(2026, 6, 1));
  });

  it('uses today after the visibility window expires', () => {
    const today = new Date(2026, 7, 4, 10);

    expect(resolveObjectiveAnchorDate(today, {
      activeMonthKey: '2026-07',
      visibleUntil: '2026-08-03',
    })).toBe(today);
  });
});
