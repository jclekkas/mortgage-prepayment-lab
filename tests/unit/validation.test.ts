import { describe, expect, it } from 'vitest';
import { frozenForecastScenario, historyBook, runValidation } from '../../src/domain/validation';
import { runScenario } from '../../src/domain/engine';

describe('validation lab', () => {
  const v = runValidation();
  it('is deterministic', () => {
    expect(runValidation()).toEqual(v);
  });
  it('does not fit trivially: the frozen forecast has non-zero error', () => {
    const frozen = v.scores.find((s) => s.id === 'frozen')!;
    expect(Math.abs(frozen.meanError!)).toBeGreaterThan(0.002);
    expect(v.months).toHaveLength(24);
  });
  it('re-running with actual rates removes part of the error (rate error vs behavior error)', () => {
    const frozen = v.scores.find((s) => s.id === 'frozen')!;
    const ar = v.scores.find((s) => s.id === 'actualRates')!;
    expect(Math.abs(ar.prepaidError)).toBeLessThan(Math.abs(frozen.prepaidError));
  });
  it('cohort actuals sum to portfolio actuals', () => {
    const total = v.months.reduce((a, m) => a + m.actualPrepaid, 0);
    const sum = v.cohorts.reduce((a, c) => a + c.actualPrepaid, 0);
    expect(Math.abs(total - sum)).toBeLessThan(0.01);
  });
  it('24-month cohort CPR reconciles to the matching no-prepayment endpoint', () => {
    const p = historyBook();
    const s = frozenForecastScenario(p);
    for (const c of v.cohorts) {
      const filter = { coupon: [c.key] };
      const projected = runScenario(p, s, filter).ledger[23].endingUpb;
      const scheduled = runScenario(p, { ...s, mode: 'fixedCpr',
        prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } }, filter).ledger[23].endingUpb;
      expect(c.forecastCpr).toBeCloseTo(1 - (projected / scheduled) ** (12 / 24), 12);
    }
  });
});
