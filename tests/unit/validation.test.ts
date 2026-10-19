import { describe, expect, it } from 'vitest';
import { runValidation } from '../../src/domain/validation';

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
});
