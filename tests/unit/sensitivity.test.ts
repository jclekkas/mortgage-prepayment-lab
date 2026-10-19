/**
 * Sensitivity and grid tests. Expected values come from scenarios built by hand in the
 * test and run through runScenario, never from the module under test.
 */
import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import {
  assembleSensitivities,
  gridAxes,
  oneFactorSensitivities,
  planGrid,
  planSensitivities,
  sensitivityGrid,
  SKIPPED_OUT_OF_RANGE,
} from '../../src/domain/sensitivity';
import type { ScenarioInput } from '../../src/domain/types';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

const p = loadPreset('mixed');
const base = (over: Partial<ScenarioInput> = {}) => scenarioFor(p, over);
const npv = (s: ScenarioInput) => runScenario(p, s).summary.servicingNpv;
const row = (rows: ReturnType<typeof oneFactorSensitivities>, id: string) => rows.find((r) => r.id === id)!;

describe('one-factor sensitivities', () => {
  it('lists the factors that apply to each mode', () => {
    expect(planSensitivities(p, base()).map((x) => x.id)).toEqual(['rate', 'refi', 'turnover', 'friction', 'discount', 'cost']);
    expect(planSensitivities(p, base({ mode: 'fixedCpr' })).map((x) => x.id)).toEqual(['cpr', 'discount', 'cost']);
    expect(planSensitivities(p, base({ mode: 'psa' })).map((x) => x.id)).toEqual(['psa', 'discount', 'cost']);
  });

  it('each delta equals a hand-built one-change scenario minus the base', () => {
    const s = base();
    const rows = oneFactorSensitivities(p, s, {});
    const b = npv(s);
    const hand: Record<string, ScenarioInput> = {
      rate: { ...s, ratePath: { ...s.ratePath, shockBps: -100 } },
      refi: { ...s, behavioralParameters: { ...s.behavioralParameters, refiMultiplier: 1.25 } },
      turnover: { ...s, behavioralParameters: { ...s.behavioralParameters, turnoverMultiplier: 1.25 } },
      friction: { ...s, behavioralParameters: { ...s.behavioralParameters, frictionBps: 25 } },
      discount: { ...s, servicingParameters: { ...s.servicingParameters, discountRate: 0.11 } },
      cost: { ...s, servicingParameters: { ...s.servicingParameters, costPerLoan: 125 } }, // every preset loan costs $100
    };
    for (const [id, sc] of Object.entries(hand)) {
      expect(row(rows, id).npvDelta, id).toBeCloseTo(npv(sc) - b, 6);
      expect(row(rows, id).skippedReason, id).toBeNull();
    }
    const shocked = runScenario(p, hand.rate).summary;
    const plain = runScenario(p, s).summary;
    expect(row(rows, 'rate').prepaid12Delta).toBeCloseTo(shocked.prepaid12 - plain.prepaid12, 6);
    expect(row(rows, 'rate').nextMonthCprDelta).toBeCloseTo(shocked.nextMonthCpr! - plain.nextMonthCpr!, 12);
  });

  it('moves in the economically expected direction on a positive-margin book', () => {
    const rows = oneFactorSensitivities(p, base(), {});
    expect(row(rows, 'rate').prepaid12Delta!).toBeGreaterThan(0); // lower rates, more payoffs
    expect(row(rows, 'rate').npvDelta!).toBeLessThan(0); // payoffs end fees
    expect(row(rows, 'discount').npvDelta!).toBeLessThan(0);
    expect(row(rows, 'discount').prepaid12Delta).toBe(0); // discounting does not change runoff
    expect(row(rows, 'cost').npvDelta!).toBeLessThan(0);
    const fixed = oneFactorSensitivities(p, base({ mode: 'fixedCpr' }), {});
    expect(row(fixed, 'cpr').nextMonthCprDelta).toBeCloseTo(0.04, 12);
    const psa = oneFactorSensitivities(p, base({ mode: 'psa' }), {});
    expect(row(psa, 'psa').prepaid12Delta!).toBeGreaterThan(0);
  });

  it('skips, with a reason, any change that would leave the supported range', () => {
    const atEdges = base({
      ratePath: { offerRate: 0.0625, shockBps: -250, shape: 'immediate', customPath: [] }, // -100 more = -350
      behavioralParameters: { turnoverMultiplier: 1.9, refiMultiplier: 2, frictionBps: 10, burnout: true, seasonality: 'flat' },
      servicingParameters: { feeOverrideBps: null, costPerLoan: 990, discountRate: 0.3 },
    });
    const rows = oneFactorSensitivities(p, atEdges, {});
    for (const id of ['rate', 'refi', 'turnover', 'friction', 'discount', 'cost']) {
      expect(row(rows, id).skippedReason, id).toBe(SKIPPED_OUT_OF_RANGE);
      expect(row(rows, id).npvDelta, id).toBeNull();
      expect(row(rows, id).prepaid12Delta, id).toBeNull();
    }
    expect(row(oneFactorSensitivities(p, base({ mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.58, psaPercent: 100 } }), {}), 'cpr').skippedReason).toBe(SKIPPED_OUT_OF_RANGE);
    expect(row(oneFactorSensitivities(p, base({ mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: 480 } }), {}), 'psa').skippedReason).toBe(SKIPPED_OUT_OF_RANGE);
  });

  it('cost bump: uses the override when set, and skips when loans have different costs', () => {
    const withOverride = oneFactorSensitivities(p, base({ servicingParameters: { feeOverrideBps: null, costPerLoan: 300, discountRate: 0.1 } }), {});
    const s300 = base({ servicingParameters: { feeOverrideBps: null, costPerLoan: 300, discountRate: 0.1 } });
    const s325 = base({ servicingParameters: { feeOverrideBps: null, costPerLoan: 325, discountRate: 0.1 } });
    expect(row(withOverride, 'cost').npvDelta).toBeCloseTo(npv(s325) - npv(s300), 6);
    const mixedCost = makePortfolio([simpleLoan({ id: 'a', annualCost: 100 }), simpleLoan({ id: 'b', annualCost: 140 })]);
    const r = oneFactorSensitivities(mixedCost, scenarioFor(mixedCost), {});
    expect(row(r, 'cost').skippedReason).toBe(SKIPPED_OUT_OF_RANGE);
  });

  it('is labeled non-additive for a reason: the sum differs from the joint change', () => {
    const s = base();
    const rows = oneFactorSensitivities(p, s, {});
    const sum = row(rows, 'rate').npvDelta! + row(rows, 'refi').npvDelta!;
    const joint = npv({ ...s, ratePath: { ...s.ratePath, shockBps: -100 }, behavioralParameters: { ...s.behavioralParameters, refiMultiplier: 1.25 } }) - npv(s);
    expect(Math.abs(joint - sum)).toBeGreaterThan(1000);
  });

  it('respects the population filter', () => {
    const filter = { coupon: ['ge7'] };
    const rows = oneFactorSensitivities(p, base(), filter);
    const s = base();
    const expected = runScenario(p, { ...s, ratePath: { ...s.ratePath, shockBps: -100 } }, filter).summary.servicingNpv - runScenario(p, s, filter).summary.servicingNpv;
    expect(row(rows, 'rate').npvDelta).toBeCloseTo(expected, 6);
  });

  it('assemble treats a missing result as skipped', () => {
    const plan = planSensitivities(p, base({ mode: 'fixedCpr' }));
    const b = runScenario(p, base({ mode: 'fixedCpr' })).summary;
    const rows = assembleSensitivities(plan, b, plan.map(() => null));
    expect(rows.every((r) => r.npvDelta === null && r.skippedReason !== null)).toBe(true);
  });
});

describe('two-way grid', () => {
  it('uses the documented axes for each mode', () => {
    const beh = gridAxes(base());
    expect(beh.rowAxis.id).toBe('offer');
    expect(beh.rowAxis.values).toEqual([0.0425, 0.0525, 0.0625, 0.0725, 0.0825]);
    expect(beh.colAxis.values).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    const fixed = gridAxes(base({ mode: 'fixedCpr' }));
    expect([fixed.rowAxis.id, fixed.colAxis.id]).toEqual(['cpr', 'discount']);
    expect(fixed.colAxis.values).toEqual([0.06, 0.08, 0.1, 0.12, 0.14]);
    const psa = gridAxes(base({ mode: 'psa' }));
    expect([psa.rowAxis.id, psa.colAxis.id]).toEqual(['psa', 'discount']);
  });

  it('drops axis values outside the supported range instead of clamping them', () => {
    const lowRate = gridAxes(base({ ratePath: { offerRate: 0.015, shockBps: 0, shape: 'immediate', customPath: [] } }));
    expect(lowRate.rowAxis.values).toEqual([0.015, 0.025, 0.035]);
    const lowDiscount = gridAxes(base({ mode: 'fixedCpr', servicingParameters: { feeOverrideBps: null, costPerLoan: null, discountRate: 0.01 } }));
    expect(lowDiscount.colAxis.values).toEqual([0.01, 0.03, 0.05]);
  });

  it('a behavioral cell is a flat immediate offer rate with the cell refinance response', () => {
    const s = base({ ratePath: { offerRate: 0.0625, shockBps: -50, shape: 'ramp12', customPath: [] } });
    const plan = planGrid(s);
    const cell = plan.cells.find((c) => c.row === 0 && c.col === 4)!;
    expect(cell.scenario.ratePath).toEqual({ offerRate: 0.0375, shockBps: 0, shape: 'immediate', customPath: [] });
    expect(cell.scenario.behavioralParameters.refiMultiplier).toBe(1.5);
    expect(cell.scenario.servicingParameters).toEqual(s.servicingParameters);
  });

  it('every cell value equals a direct run of a hand-built scenario', () => {
    const s = base({ mode: 'fixedCpr' });
    const g = sensitivityGrid(p, s, {});
    expect(g.cells).toHaveLength(25);
    for (const c of g.cells) {
      const hand = { ...s, prepaymentParameters: { ...s.prepaymentParameters, fixedCpr: g.rowAxis.values[c.row] }, servicingParameters: { ...s.servicingParameters, discountRate: g.colAxis.values[c.col] } };
      expect(c.servicingNpv).toBeCloseTo(npv(hand), 6);
      expect(c.error).toBeNull();
    }
  });

  it('fixed-mode grid NPV falls with faster CPR and with a higher discount rate', () => {
    const g = sensitivityGrid(p, base({ mode: 'fixedCpr' }), {});
    const at = (r: number, c: number) => g.cells.find((x) => x.row === r && x.col === c)!.servicingNpv!;
    for (let r = 0; r < 5; r++) for (let c = 1; c < 5; c++) expect(at(r, c)).toBeLessThan(at(r, c - 1));
    for (let c = 0; c < 5; c++) for (let r = 1; r < 5; r++) expect(at(r, c)).toBeLessThan(at(r - 1, c));
  });

  it('reports progress for every cell', () => {
    const seen: number[] = [];
    sensitivityGrid(p, base({ mode: 'psa' }), {}, (d, t) => {
      expect(t).toBe(25);
      seen.push(d);
    });
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});
