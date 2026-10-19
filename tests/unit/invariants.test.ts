/**
 * Accounting invariants and supported exceptions, checked on the full synthetic presets.
 * These complement the per-month conservation check (N04) and the hand-derived worked examples.
 */
import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { defaultScenario, scenarioInputHash } from '../../src/domain/scenario';
import type { ScenarioInput } from '../../src/domain/types';
import { buildScenarioFile } from '../../src/storage/files';

const mixed = loadPreset('mixed');
const base = (patch: (s: ScenarioInput) => void = () => {}): ScenarioInput => {
  const s = defaultScenario(mixed.meta.hash, mixed.meta.asOfMonth);
  patch(s);
  return s;
};
const startUpb = mixed.loans.reduce((a, l) => a + l.currentBalance, 0);

describe('lifetime principal reconciles to the starting balance', () => {
  const cases: [string, ScenarioInput][] = [
    ['behavioral', base()],
    ['behavioral, rate cut', base((s) => { s.ratePath.shockBps = -100; })],
    ['fixed CPR 20%', base((s) => { s.mode = 'fixedCpr'; s.prepaymentParameters.fixedCpr = 0.2; })],
    ['PSA 300%', base((s) => { s.mode = 'psa'; s.prepaymentParameters.psaPercent = 300; })],
  ];
  for (const [name, s] of cases) {
    it(`${name}: scheduled + prepaid over all months = starting balance, and the last month ends at zero`, () => {
      const out = runScenario(mixed, s);
      const returned = out.ledger.reduce((a, m) => a + m.scheduledPrincipal + m.prepaidPrincipal, 0);
      expect(Math.abs(returned - startUpb)).toBeLessThan(0.01);
      expect(out.ledger[0].beginningUpb).toBeCloseTo(startUpb, 4);
      expect(Math.abs(out.ledger[out.ledger.length - 1].endingUpb)).toBeLessThan(0.01);
      for (const m of out.ledger) {
        expect(Math.abs(m.beginningUpb - m.scheduledPrincipal - m.prepaidPrincipal - m.endingUpb)).toBeLessThan(1e-6 * Math.max(1, m.beginningUpb));
      }
    });
  }
});

describe('"rates down means servicing value down" is a result of the margins, not a rule', () => {
  const cut = (s: ScenarioInput) => { s.ratePath.shockBps = -100; };
  it('standard book (fee above cost per loan): a rate cut lowers servicing value', () => {
    expect(runScenario(mixed, base(cut)).summary.servicingNpv).toBeLessThan(runScenario(mixed, base()).summary.servicingNpv);
  });
  it('zero fee: every loan costs more than it earns, so faster payoff raises (less negative) servicing value', () => {
    const zero = (s: ScenarioInput) => { s.servicingParameters.feeOverrideBps = 0; };
    const b = runScenario(mixed, base(zero)).summary.servicingNpv;
    const c = runScenario(mixed, base((s) => { zero(s); cut(s); })).summary.servicingNpv;
    expect(b).toBeLessThan(0);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(0);
  });
  it('a rate rise slows prepayment and raises servicing value on the standard book', () => {
    const up = runScenario(mixed, base((s) => { s.ratePath.shockBps = 100; }));
    const b = runScenario(mixed, base());
    expect(up.summary.cpr12!).toBeLessThan(b.summary.cpr12!);
    expect(up.summary.servicingNpv).toBeGreaterThan(b.summary.servicingNpv);
  });
});

describe('comparisons and exports', () => {
  it('baseline and scenario runs cover the same population', () => {
    const b = runScenario(mixed, base());
    const c = runScenario(mixed, base((s) => { s.ratePath.shockBps = -100; }));
    expect(c.population).toEqual(b.population);
    expect(c.ledger[0].beginningUpb).toBe(b.ledger[0].beginningUpb);
  });

  it('a saved file pairs each result with the assumptions that produced it', () => {
    const s = base((x) => { x.scenarioId = 's1'; x.name = 'Cut'; x.ratePath.shockBps = -100; });
    const b = base();
    const outs = [runScenario(mixed, b), runScenario(mixed, s)];
    const file = buildScenarioFile({ portfolio: mixed, baselineId: 'baseline', scenarios: [b, s], filter: {}, notes: {} }, outs);
    for (const r of file.results) {
      const sc = file.scenarios.find((x) => x.scenarioId === r.scenarioId)!;
      expect(scenarioInputHash(sc)).toBe(r.inputHash);
    }
  });

  it('refuses to save a result next to edited assumptions', () => {
    const s = base((x) => { x.scenarioId = 's1'; x.ratePath.shockBps = -100; });
    const out = runScenario(mixed, s);
    const edited = { ...structuredClone(s), ratePath: { ...s.ratePath, shockBps: -50 } };
    expect(() => buildScenarioFile({ portfolio: mixed, baselineId: 's1', scenarios: [edited], filter: {}, notes: {} }, [out])).toThrow(/different assumptions/);
  });
});
