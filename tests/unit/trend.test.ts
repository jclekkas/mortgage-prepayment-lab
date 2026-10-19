/**
 * Change arrows separate numerical direction from economic judgment. Activity measures
 * (prepayment speed, prepaid principal, balance, average life) get a direction only; servicer
 * cash-flow and value measures are judged on their own numbers, honestly about losses.
 */
import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { explainComparison, servicingPvParts } from '../../src/domain/narrative';
import { defaultScenario } from '../../src/domain/scenario';
import { trendOf, trendOfDelta } from '../../src/domain/trend';

describe('direction-only measures', () => {
  it('prepayment speed and prepaid principal are faster/slower or higher/lower, never better or worse', () => {
    expect(trendOf('cpr', 0.08, 0.1)).toMatchObject({ direction: 'up', tone: 'neutral', word: 'faster' });
    expect(trendOf('cpr', 0.1, 0.08)).toMatchObject({ direction: 'down', tone: 'neutral', word: 'slower' });
    expect(trendOf('prepaid12', 29e6, 41e6)).toMatchObject({ direction: 'up', tone: 'neutral', word: 'higher' });
    expect(trendOf('wal', 9, 7.3)).toMatchObject({ direction: 'down', tone: 'neutral', word: 'shorter' });
    expect(trendOf('upb', 100, 200)).toMatchObject({ tone: 'neutral', word: 'higher' });
    for (const t of [trendOf('cpr', 0.08, 0.1), trendOf('prepaid12', 1e6, 2e6), trendOf('ownerInterest12', 1e6, 2e6)]) {
      expect(t!.label).not.toMatch(/better|worse/i);
      expect(t!.label).toContain('Direction only');
    }
  });
});

describe('servicer value measures', () => {
  it('positive margin: a fall is "lower" and worsened; a rise is "higher" and improved', () => {
    expect(trendOf('npv', 3_524_196, 3_053_757)).toMatchObject({ direction: 'down', tone: 'bad', word: 'lower' });
    expect(trendOf('npv', 3_053_757, 3_524_196)).toMatchObject({ direction: 'up', tone: 'good', word: 'higher' });
  });

  it('negative margin: a rise from one loss to a smaller loss is "smaller loss", and says it is not a profit', () => {
    const t = trendOf('npv', -595_769, -506_698)!;
    expect(t).toMatchObject({ direction: 'up', tone: 'good', word: 'smaller loss' });
    expect(t.label).toContain('still a loss');
    expect(t.label).toContain('lifetime servicing value in today’s dollars');
    expect(trendOf('npv', -506_698, -595_769)).toMatchObject({ tone: 'bad', word: 'larger loss' });
    expect(trendOf('npv', -100_000, 50_000)?.word).toBe('loss to gain');
    expect(trendOf('npv', 100_000, -50_000)?.word).toBe('gain to loss');
  });

  it('zero baseline: up is "higher", down is "larger loss"', () => {
    expect(trendOf('net12', 0, 5_000)).toMatchObject({ tone: 'good', word: 'higher' });
    expect(trendOf('net12', 0, -5_000)).toMatchObject({ tone: 'bad', word: 'larger loss' });
  });

  it('labels state the perspective and horizon', () => {
    expect(trendOf('net12', 100_000, 50_000)!.label).toContain('net servicing cash flow over the next 12 months');
    expect(trendOf('recapturePv', 1, 100_000)!.label).toContain('recapture contribution');
  });
});

describe('zero and small changes keep the delta visible', () => {
  it('exact zero is "no change" within the 1e-9 relative tolerance', () => {
    expect(trendOf('npv', 3_500_000, 3_500_000)).toMatchObject({ tone: 'flat', word: 'no change' });
    expect(trendOf('npv', 3_500_000, 3_500_000 + 3e-4)?.word).toBe('no change');
    expect(trendOfDelta('cpr', 0, null)?.word).toBe('no change');
  });
  it('nonzero below the display threshold is "small change", described as a display setting', () => {
    expect(trendOf('npv', 3_500_000, 3_500_001)?.word).toBe('small change');
    expect(trendOf('cpr', 0.08, 0.0804)?.word).toBe('small change');
    expect(trendOf('cpr', 0.08, 0.0806)?.word).toBe('faster');
    expect(trendOf('npv', 3_500_000, 3_500_001)?.label).toContain('not a judgment of economic importance');
  });
  it('missing values give no arrow', () => {
    expect(trendOf('wal', null, 9)).toBeNull();
    expect(trendOfDelta('npv', Number.NaN, null)).toBeNull();
  });
});

describe('reported counterexample: zero servicing fee, $100 cost, rates down 100 basis points', () => {
  const p = loadPreset('mixed');
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  base.servicingParameters.feeOverrideBps = 0;
  const scen = { ...structuredClone(base), scenarioId: 'cut' };
  scen.ratePath.shockBps = -100;
  const b = runScenario(p, base), s = runScenario(p, scen);

  it('reproduces the reported values', () => {
    expect(b.summary.servicingNpv).toBeCloseTo(-595_769, -1);
    expect(s.summary.servicingNpv).toBeCloseTo(-506_698, -1);
    expect(s.summary.servicingNpv - b.summary.servicingNpv).toBeCloseTo(89_071, -1);
  });

  it('prepayment is "faster" (not "worse"); value is a "smaller loss" (not a profit)', () => {
    const cpr = trendOf('cpr', b.summary.nextMonthCpr, s.summary.nextMonthCpr)!;
    expect(cpr).toMatchObject({ word: 'faster', tone: 'neutral' });
    expect(cpr.label).not.toMatch(/worse/);
    expect(trendOf('npv', b.summary.servicingNpv, s.summary.servicingNpv)).toMatchObject({ word: 'smaller loss', tone: 'good' });
  });

  it('the explanation shows fees and costs in today’s dollars and does not call the result a profit', () => {
    const n = explainComparison(base, b, scen, s, 'servicing');
    const text = [n.headline, ...n.points].join(' ');
    expect(text).toContain('value can change in this model only through how long loans stay');
    // Zero fee: no fees to give up; faster payoff only saves costs.
    expect(text).toContain('servicing fees do not change');
    expect(text).toMatch(/servicing costs fall by \$\d/);
    expect(text).toContain('A smaller loss is not a profit');
    expect(text).not.toMatch(/Unusually/);
  });
});

describe('standard experiment: Mixed book, default assumptions, rates down 100 basis points', () => {
  const p = loadPreset('mixed');
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const scen = { ...structuredClone(base), scenarioId: 'cut' };
  scen.ratePath.shockBps = -100;
  const b = runScenario(p, base), s = runScenario(p, scen);
  it('faster prepayment with positive margins lowers servicing value, explained as fees given up exceeding costs saved', () => {
    expect(trendOf('npv', b.summary.servicingNpv, s.summary.servicingNpv)).toMatchObject({ word: 'lower', tone: 'bad' });
    const text = explainComparison(base, b, scen, s, 'servicing').points.join(' ');
    expect(text).toMatch(/servicing fees fall by \$[\d.]+[KM] and servicing costs fall by \$[\d.]+K/);
    // The split is arithmetic: NPV = PV(fees) - PV(costs), and fees given up exceed costs saved.
    const pb = servicingPvParts(b), ps = servicingPvParts(s);
    expect(pb.fees - pb.costs).toBeCloseTo(b.summary.servicingNpv, 4);
    expect(ps.fees - ps.costs).toBeCloseTo(s.summary.servicingNpv, 4);
    expect(pb.fees - ps.fees).toBeGreaterThan(pb.costs - ps.costs);
    expect(pb.costs - ps.costs).toBeGreaterThan(0);
  });
  it('when the fee also changes, the explanation does not attribute the result to one cause', () => {
    const both = { ...structuredClone(scen), scenarioId: 'both' };
    both.servicingParameters.feeOverrideBps = 30;
    const o = runScenario(p, both);
    const text = explainComparison(base, b, both, o, 'servicing').points.join(' ');
    expect(text).toContain('this comparison does not split them');
    expect(text).not.toContain('only through how long loans stay');
  });
});
