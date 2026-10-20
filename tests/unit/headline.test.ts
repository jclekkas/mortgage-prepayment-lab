/** The short hero headline: direction and size only, honest about losses, never a cause. */
import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { shortHeadline } from '../../src/domain/headline';
import { defaultScenario } from '../../src/domain/scenario';

const p = loadPreset('mixed');
const run = (patch: (s: ReturnType<typeof defaultScenario>) => void) => {
  const s = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  patch(s);
  return runScenario(p, s).summary;
};

describe('short headline', () => {
  const base = run(() => {});
  const cut = run((s) => { s.ratePath.shockBps = -100; });

  it('servicer: value word from the trend rules, signed change, percent, and speed before and after', () => {
    expect(shortHeadline(false, 'Scenario 1', base, cut)).toBe('Scenario 1: lifetime servicing value lower, −$470.4K (−13.3%). Prepayment is faster (7.76% → 11.18%).');
  });

  it('owner: timing and average life, no value judgment', () => {
    const t = shortHeadline(true, 'Scenario 1', base, cut);
    expect(t).toBe('Scenario 1: principal comes back sooner, average life 8.95 years → 7.30 years. Prepayment is faster.');
    expect(t).not.toMatch(/better|worse|profit|value/);
  });

  it('a negative-margin book that loses less says "smaller loss", never a gain', () => {
    const z0 = run((s) => { s.servicingParameters.feeOverrideBps = 0; });
    const z1 = run((s) => { s.servicingParameters.feeOverrideBps = 0; s.ratePath.shockBps = -100; });
    const t = shortHeadline(false, 'Zero fee', z0, z1);
    expect(t).toContain('lifetime servicing value smaller loss, +$89.1K');
    expect(t).not.toMatch(/profit|gain/);
  });

  it('no change reads "no change" and "about the same"', () => {
    expect(shortHeadline(false, 'Same', base, base)).toBe('Same: lifetime servicing value no change, $0 (0.0%). Prepayment is about the same (7.76% → 7.76%).');
  });
});
