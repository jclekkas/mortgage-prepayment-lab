/**
 * Change arrows: direction comes from the sign of the change; color comes from the effect
 * for the servicer, so faster prepayment is never shown as good just because it went up.
 */
import { describe, expect, it } from 'vitest';
import { trendOf, trendOfDelta } from '../../src/domain/trend';

describe('trend arrows', () => {
  it('higher servicing value is up and better; lower is down and worse', () => {
    expect(trendOf('npv', 3_500_000, 3_600_000, 'servicing')).toMatchObject({ direction: 'up', tone: 'good', word: 'better' });
    expect(trendOf('npv', 3_500_000, 3_400_000, 'servicing')).toMatchObject({ direction: 'down', tone: 'bad', word: 'worse' });
  });

  it('faster prepayment is up but worse for the servicer', () => {
    expect(trendOf('cpr', 0.08, 0.1, 'servicing')).toMatchObject({ direction: 'up', tone: 'bad' });
    expect(trendOf('prepaid12', 29e6, 35e6, 'learn')).toMatchObject({ direction: 'up', tone: 'bad' });
    expect(trendOf('cpr', 0.1, 0.08, 'servicing')).toMatchObject({ direction: 'down', tone: 'good' });
  });

  it('in the loan owner view, prepayment speed has a direction but no good or bad color', () => {
    const t = trendOf('cpr', 0.08, 0.1, 'investor')!;
    expect(t).toMatchObject({ direction: 'up', tone: 'neutral', word: 'not assessed' });
    expect(t.label).toContain('can affect investment value');
    expect(t.label).toContain('does not determine whether that is favorable');
    expect(t.label).not.toMatch(/not value/);
  });

  it('balance and weighted-average life are never judged good or bad', () => {
    expect(trendOf('upb', 100, 200, 'servicing')).toMatchObject({ direction: 'up', tone: 'neutral' });
    expect(trendOf('wal', 9, 8, 'servicing')).toMatchObject({ direction: 'down', tone: 'neutral' });
  });

  it('exact zero is "no change"; nonzero changes below the display threshold are "small change"', () => {
    expect(trendOf('npv', 3_500_000, 3_500_000, 'servicing')).toMatchObject({ direction: 'flat', tone: 'flat', word: 'no change' });
    expect(trendOf('npv', 3_500_000, 3_500_000 + 3e-4, 'servicing')?.word).toBe('no change'); // within 1e-9 relative
    expect(trendOf('npv', 3_500_000, 3_500_001, 'servicing')?.word).toBe('small change');
    expect(trendOfDelta('npv', 0.4, null, 'servicing')?.word).toBe('small change');
    expect(trendOfDelta('cpr', 0, null, 'servicing')?.word).toBe('no change');
    expect(trendOf('npv', 3_500_000, 3_500_001, 'servicing')?.label).toContain('not a judgment of economic importance');
  });

  it('display thresholds by metric', () => {
    expect(trendOf('cpr', 0.08, 0.0804, 'servicing')).toMatchObject({ direction: 'flat', tone: 'flat', word: 'small change' }); // 0.04 points
    expect(trendOf('cpr', 0.08, 0.0806, 'servicing')?.direction).toBe('up'); // 0.06 points
    expect(trendOf('npv', 3_500_000, 3_510_000, 'servicing')?.tone).toBe('flat'); // 0.29%
    expect(trendOf('npv', 3_500_000, 3_520_000, 'servicing')?.tone).toBe('good'); // 0.57%
    expect(trendOf('npvBps', 106.2, 106.5, 'servicing')?.tone).toBe('flat');
    expect(trendOf('wal', 8.95, 8.97, 'servicing')?.tone).toBe('flat');
    expect(trendOfDelta('npv', -25_000, null, 'servicing')?.tone).toBe('bad');
  });

  it('missing values give no arrow', () => {
    expect(trendOf('wal', null, 9, 'servicing')).toBeNull();
    expect(trendOfDelta('npv', null, null, 'servicing')).toBeNull();
    expect(trendOfDelta('npv', Number.NaN, null, 'servicing')).toBeNull();
  });

  it('every arrow carries a screen-reader sentence', () => {
    for (const t of [trendOf('npv', 1, 2e6, 'servicing'), trendOf('cpr', 0.05, 0.2, 'investor'), trendOf('npv', 1e6, 1e6, 'servicing')]) {
      expect(t?.label.length).toBeGreaterThan(10);
    }
  });
});
