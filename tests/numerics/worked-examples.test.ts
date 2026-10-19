/**
 * Engineering review of the mortgage calculations: independently worked examples.
 *
 * Each expected value is derived here in closed form (annuity sums, geometric series,
 * the level-payment formula), not by re-running a month-by-month loop. Neither the
 * engine nor the Python reference model is used to produce an expected value. This
 * is an engineering check of the arithmetic and conventions, not independent
 * professional model validation.
 */
import { describe, expect, it } from 'vitest';
import { loanLedger, runScenario } from '../../src/domain/engine';
import { smmToCpr } from '../../src/domain/math';
import type { ScenarioInput } from '../../src/domain/types';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

/** Closed-form contractual balance after k level payments A at monthly rate r. */
const balanceClosed = (B: number, r: number, A: number, k: number) => (r === 0 ? B - A * k : B * (1 + r) ** k - (A * ((1 + r) ** k - 1)) / r);

describe('W1 amortization and level payment', () => {
  const loan = simpleLoan({ id: 'w1', originalBalance: 300_000, noteRate: 0.065 });
  it('$300,000 at 6.5% for 360 months pays $1,896.20 a month (level-payment closed form)', () => {
    expect(loan.contractualPayment).toBeCloseTo(1896.2, 2);
  });
  it('scheduled balances match the closed-form balance after k payments, with no prepayment', () => {
    const p = makePortfolio([loan]);
    const s = scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } });
    const rows = loanLedger(p, s, 'w1');
    const r = 0.065 / 12;
    for (const k of [0, 12, 120, 300, 359]) {
      expect(rows[k].contractualBalance).toBeCloseTo(balanceClosed(300_000, r, loan.contractualPayment, k), 6);
    }
    // Interest + scheduled principal is exactly the level payment until maturity.
    for (const k of [0, 100, 358]) expect(rows[k].interest + rows[k].scheduledPrincipal).toBeCloseTo(loan.contractualPayment, 8);
    expect(rows[359].endingBalance).toBe(0);
  });
});

describe('W2 survival weighting at a constant speed', () => {
  // Fixed 10% CPR: SMM s = 1 - 0.9^(1/12). With no age effect, survival after t-1 months is (1-s)^(t-1).
  const s = 1 - 0.9 ** (1 / 12);
  const loan = simpleLoan({ id: 'w2', originalBalance: 250_000, noteRate: 0.06 });
  const p = makePortfolio([loan]);
  const sc = scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.1, psaPercent: 100 } });
  const rows = loanLedger(p, sc, 'w2');
  const r = 0.06 / 12;
  const A = loan.contractualPayment;
  for (const t of [1, 2, 60, 200, 359]) {
    it(`month ${t}: expected balance, count and payment follow (1-s)^(t-1) on the unchanged contract`, () => {
      const w = (1 - s) ** (t - 1);
      const B = balanceClosed(250_000, r, A, t - 1);
      const m = rows[t - 1];
      expect(m.survival).toBeCloseTo(w, 12);
      expect(m.beginningBalance).toBeCloseTo(w * B, 6);
      // A surviving borrower still pays the original A: expected P&I is w x A, not a recast payment.
      expect(m.interest + m.scheduledPrincipal).toBeCloseTo(w * A, 6);
      // Prepayment applies to the balance after the scheduled payment.
      expect(m.prepaidPrincipal).toBeCloseTo(w * (B - (A - B * r)) * s, 6);
    });
  }
  it('maturity month: remaining survivors repay their final scheduled balance; nothing is voluntary', () => {
    const last = rows[359];
    expect(last.prepaidPrincipal).toBe(0);
    expect(last.voluntaryPayoffs).toBe(0);
    expect(last.matured).toBeCloseTo((1 - s) ** 359, 12);
  });
});

describe('W3 PSA seasoning and month indexing', () => {
  // 100% PSA: CPR = 6% x min(age, 30) / 30, age in months since origination, month 1 = first month of life.
  const psaCpr = (age: number, pct: number) => Math.min(1, (0.06 * Math.min(age, 30)) / 30 * (pct / 100));
  const newLoan = simpleLoan({ id: 'new', ageMonths: 0 });
  const seasoned = simpleLoan({ id: 'old', ageMonths: 29 });
  const p = makePortfolio([newLoan, seasoned]);
  const sc = (pct: number): ScenarioInput => scenarioFor(p, { mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: pct } });
  it('a new loan prepays at 0.2% CPR in its first month and 6% from its 30th month at 100% PSA', () => {
    const rows = loanLedger(p, sc(100), 'new');
    for (const t of [1, 2, 15, 29, 30, 31, 120]) expect(smmToCpr(rows[t - 1].payoffProbability)).toBeCloseTo(psaCpr(t, 100), 12);
    expect(smmToCpr(rows[0].payoffProbability)).toBeCloseTo(0.002, 12);
  });
  it('a loan with 29 payments made is age 30 in the first projected month', () => {
    expect(smmToCpr(loanLedger(p, sc(100), 'old')[0].payoffProbability)).toBeCloseTo(0.06, 12);
  });
  it('250% PSA scales every month by 2.5', () => {
    const rows = loanLedger(p, sc(250), 'new');
    for (const t of [1, 10, 40]) expect(smmToCpr(rows[t - 1].payoffProbability)).toBeCloseTo(psaCpr(t, 250), 12);
  });
});

describe('W4 servicing fee units and expense timing', () => {
  const loan = simpleLoan({ id: 'w4', originalBalance: 200_000, noteRate: 0.06, annualCost: 120 });
  const p = makePortfolio([loan]);
  it('25 bps a year on $200,000 is $41.67 in month 1; $120 a year is $10 a month; PV at 10% is end of month', () => {
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } }));
    const m = out.ledger[0];
    expect(m.grossFee).toBeCloseTo((200_000 * 0.0025) / 12, 9);
    expect(m.operatingCost).toBeCloseTo(10, 9);
    expect(m.netServicing).toBeCloseTo(41.666666667 - 10, 6);
    expect(m.pvNetServicing).toBeCloseTo((41.666666667 - 10) * 1.1 ** (-1 / 12), 6);
    // The fee is the 25/600 share of the borrower's month-1 interest (fee accrues on the same beginning balance).
    expect(m.grossFee / m.noteInterest).toBeCloseTo(0.0025 / 0.06, 12);
  });
});

describe('W5 discounting and full-maturity NPV (annuity closed form)', () => {
  // A 12-month zero-rate loan, fee 0 bps, $120 a year cost, no prepayment: net = -$10 at the end of
  // each of 12 months (the loan is active at the start of its maturity month).
  const loan = simpleLoan({ id: 'w5', originalBalance: 12_000, noteRate: 0, originalTerm: 12, annualCost: 120 });
  const p = makePortfolio([loan]);
  for (const d of [0, 0.1, 0.3]) {
    it(`NPV = -10 x annuity factor at ${d * 100}%`, () => {
      const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 }, servicingParameters: { feeOverrideBps: 0, costPerLoan: null, discountRate: d } }));
      const v = (1 + d) ** (-1 / 12);
      const annuity = d === 0 ? 12 : (v * (1 - v ** 12)) / (1 - v);
      expect(out.summary.servicingNpv).toBeCloseTo(-10 * annuity, 9);
      expect(out.ledger).toHaveLength(12);
    });
  }
  it('NPV runs to full maturity regardless of the 12-month chart horizon', () => {
    const big = makePortfolio([simpleLoan({ id: 'long', originalBalance: 100_000, noteRate: 0 })]);
    const out = runScenario(big, scenarioFor(big, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 }, chartHorizon: 12, servicingParameters: { feeOverrideBps: null, costPerLoan: 0, discountRate: 0 } }));
    // Zero rate, no prepayment, zero discount: fee = 25bps/12 x sum of beginning balances = (0.0025/12) x 100,000 x (361/2).
    expect(out.summary.servicingNpv).toBeCloseTo((0.0025 / 12) * 100_000 * (361 / 2), 6);
  });
});

describe('W6 weighted-average life (closed form)', () => {
  it('a zero-rate 360-month loan with no prepayment has WAL (n+1)/24 = 15.0417 years', () => {
    const p = makePortfolio([simpleLoan({ id: 'w6', originalBalance: 360_000, noteRate: 0 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } }));
    expect(out.summary.wal).toBeCloseTo(361 / 24, 10);
  });
  it('with constant SMM s on a zero-rate loan, WAL matches its geometric-series closed form', () => {
    // Balance per survivor after k months: B(1 - k/n). Principal in month t (per unit original weight):
    // scheduled (1-s)^(t-1) B/n plus prepaid (1-s)^(t-1) B(1 - t/n) s, for t < n; final month pays the survivors' last B/n.
    const n = 360, B = 360_000, cpr = 0.12, s = 1 - (1 - cpr) ** (1 / 12);
    let num = 0;
    for (let t = 1; t <= n; t++) {
      const w = (1 - s) ** (t - 1);
      const sched = (w * B) / n;
      const prep = t < n ? w * B * (1 - t / n) * s : 0;
      num += (t / 12) * (sched + prep);
    }
    const p = makePortfolio([simpleLoan({ id: 'w6b', originalBalance: B, noteRate: 0 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: cpr, psaPercent: 100 } }));
    expect(out.summary.wal).toBeCloseTo(num / B, 9);
    expect(out.summary.wal!).toBeLessThan(361 / 24);
  });
});

describe('W7 cause probabilities and burnout timing', () => {
  // Seasoned loan (age 40, s = 1), propensity 1, flat turnover. Note 7.00%, offer 6.50%, friction 50 bps: x = 0, sigmoid = 0.5.
  const at = (noteRate: number, burnout: boolean) => {
    const loan = simpleLoan({ id: 'w7', noteRate, ageMonths: 40, refiPropensity: 1 });
    const p = makePortfolio([loan]);
    const sc = scenarioFor(p, { ratePath: { offerRate: 0.065, shockBps: 0, shape: 'immediate', customPath: [] }, behavioralParameters: { turnoverMultiplier: 1, refiMultiplier: 1, frictionBps: 50, burnout, seasonality: 'flat' } });
    return { p, sc, rows: loanLedger(p, sc, 'w7') };
  };
  it('at zero effective incentive: h_refi = 0.02, h_move = 0.003, q = 1 - e^-0.023, split in proportion', () => {
    const m = at(0.07, true).rows[0];
    const q = 1 - Math.exp(-0.023);
    expect(m.payoffProbability).toBeCloseTo(q, 15);
    expect(m.refiProbability).toBeCloseTo((q * 0.02) / 0.023, 15);
    expect(m.turnoverProbability).toBeCloseTo((q * 0.003) / 0.023, 15);
  });
  it('burnout counts only months with positive incentive: x = 0 never burns out', () => {
    const rows = at(0.07, true).rows;
    expect(rows[100].refiHazard).toBeCloseTo(rows[0].refiHazard!, 15);
  });
  it('with positive incentive, month t uses exp(-0.02 (t-1)): the current month does not count itself', () => {
    const rows = at(0.08, true).rows; // x = 100 bps
    const h1 = 0.04 * (1 / (1 + Math.exp(-2)));
    expect(rows[0].refiHazard).toBeCloseTo(h1, 15);
    for (const t of [2, 11, 51]) expect(rows[t - 1].refiHazard).toBeCloseTo(h1 * Math.exp(-0.02 * (t - 1)), 15);
    expect(at(0.08, false).rows[50].refiHazard).toBeCloseTo(h1, 15);
  });
});

describe('W8 recapture contribution and no double counting', () => {
  // Constant hazards (the W7 zero-incentive loan): q and q_refi are the same every month until maturity.
  const q = 1 - Math.exp(-0.023);
  const qRefi = (q * 0.02) / 0.023;
  const build = (count: number) => {
    const loans = Array.from({ length: count }, (_, i) => simpleLoan({ id: `w8-${i}`, noteRate: 0.07, ageMonths: 40, refiPropensity: 1 }));
    const p = makePortfolio(loans);
    return { p, sc: scenarioFor(p, {
      ratePath: { offerRate: 0.065, shockBps: 0, shape: 'immediate', customPath: [] },
      behavioralParameters: { turnoverMultiplier: 1, refiMultiplier: 1, frictionBps: 50, burnout: true, seasonality: 'flat' },
      servicingParameters: { feeOverrideBps: null, costPerLoan: null, discountRate: 0 },
      recaptureParameters: { share: 0.5, contributionPerLoan: 1000, campaignCost: 100 },
    }) };
  };
  it('one loan: PV = share x contribution x q_refi x (1 - (1-q)^(n-1)) / q - campaign cost (maturity month excluded)', () => {
    const { p, sc } = build(1);
    const n = 320; // 360 - 40 remaining payments
    const expectedLoans = (qRefi * (1 - (1 - q) ** (n - 1))) / q;
    const out = runScenario(p, sc);
    expect(out.summary.recapturedLoans).toBeCloseTo(0.5 * expectedLoans, 12);
    expect(out.summary.recapturePv).toBeCloseTo(0.5 * 1000 * expectedLoans - 100, 9);
  });
  it('the campaign cost is deducted once, not per loan or per month', () => {
    const one = runScenario(build(1).p, build(1).sc).summary.recapturePv!;
    const three = runScenario(build(3).p, build(3).sc).summary.recapturePv!;
    expect(three).toBeCloseTo(3 * (one + 100) - 100, 8);
  });
  it('recapture is kept out of servicing NPV; combined is their plain sum', () => {
    const { p, sc } = build(2);
    const withRecapture = runScenario(p, sc).summary;
    const without = runScenario(p, { ...sc, recaptureParameters: { share: 0, contributionPerLoan: 1000, campaignCost: 0 } }).summary;
    expect(withRecapture.servicingNpv).toBe(without.servicingNpv);
    expect(withRecapture.combinedContribution).toBeCloseTo(withRecapture.servicingNpv + withRecapture.recapturePv!, 9);
    expect(without.recapturePv).toBe(0);
  });
});

describe('W9 regression: a loan exactly at the refinance threshold never accrues burnout', () => {
  // Found in this review: (0.07 - 0.065) x 10,000 - 50 evaluates to +4e-14 in floating point, so
  // threshold loans counted as "positive incentive" depending on the rate pair. Both the engine and
  // the Python reference had it, so agreement between them could not catch it.
  const pairs: [number, number][] = [];
  for (let k = 0; k <= 40; k++) {
    const note = 0.03 + k * 0.00125; // 1/8-point note rates from 3% to 8%
    pairs.push([note, note - 0.005]); // offer 50 bps below: exactly at the 50 bps friction
  }
  it('every 1/8-point note rate 50 bps above the offer keeps a constant refinance hazard', () => {
    for (const [note, offer] of pairs) {
      const loan = simpleLoan({ id: 'w9', noteRate: note, ageMonths: 40, refiPropensity: 1 });
      const p = makePortfolio([loan]);
      const sc = scenarioFor(p, { ratePath: { offerRate: offer, shockBps: 0, shape: 'immediate', customPath: [] } });
      const rows = loanLedger(p, sc, 'w9');
      expect(rows[0].incentiveBps, `${note}/${offer}`).toBe(0);
      expect(rows[0].refiHazard, `${note}/${offer}`).toBeCloseTo(0.02, 15);
      expect(rows[120].burnoutMonths, `${note}/${offer}`).toBe(0);
    }
  });
  it('a real incentive of 1 bp still counts as positive', () => {
    const loan = simpleLoan({ id: 'w9b', noteRate: 0.0701, ageMonths: 40, refiPropensity: 1 });
    const p = makePortfolio([loan]);
    const rows = loanLedger(p, scenarioFor(p, { ratePath: { offerRate: 0.065, shockBps: 0, shape: 'immediate', customPath: [] } }), 'w9b');
    expect(rows[0].incentiveBps).toBeCloseTo(1, 9);
    expect(rows[10].burnoutMonths).toBe(10);
  });
});
