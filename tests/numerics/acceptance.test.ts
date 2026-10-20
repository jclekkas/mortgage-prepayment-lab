/**
 * PRD section 10 numerical acceptance checks N01-N16. Expected values are derived in
 * the test from first principles or quoted from the PRD, never copied from engine output.
 */
import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../../src/data/generator';
import { loadPreset } from '../../src/data/presets';
import { loanLedger, runScenario, simulateLoan, createContext } from '../../src/domain/engine';
import { cprToSmm, psaCpr, smmToCpr } from '../../src/domain/math';
import { scenarioInputHash } from '../../src/domain/scenario';
import type { Portfolio, RunOutput, ScenarioInput } from '../../src/domain/types';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

const mixed = loadPreset('mixed');
const base = (over: Partial<ScenarioInput> = {}) => scenarioFor(mixed, over);
const stripTiming = (o: RunOutput) => ({ ...o, durationMs: 0 });

describe('N01 CPR and SMM conversions', () => {
  it('maps the boundaries exactly', () => {
    expect(cprToSmm(0)).toBe(0);
    expect(cprToSmm(1)).toBe(1);
    expect(smmToCpr(0)).toBe(0);
    expect(smmToCpr(1)).toBe(1);
  });
  it('round-trips within 1e-12', () => {
    for (let c = 0; c <= 1; c += 0.0137) expect(Math.abs(smmToCpr(cprToSmm(c)) - c)).toBeLessThan(1e-12);
    // SMM above ~0.5 annualizes to a CPR within 1e-4 of 100%, where doubles cannot carry the
    // information back; the round trip is checked over the range where it is well-conditioned.
    for (let s = 0; s <= 0.5; s += 0.0071) expect(Math.abs(cprToSmm(smmToCpr(s)) - s)).toBeLessThan(1e-12);
  });
});

describe('N02 6% CPR worked example', () => {
  it('gives SMM 0.0051430128 and $513,786.98 of prepayment', () => {
    const smm = cprToSmm(0.06);
    expect(Math.abs(smm - 0.0051430128)).toBeLessThan(5e-11);
    const prepay = (100_000_000 - 100_000) * smm;
    expect(Math.abs(prepay - 513_786.98)).toBeLessThan(1);
  });
  it('the engine applies that SMM to eligible balance', () => {
    // 1,000 loans of $100,000: beginning UPB is exactly $100,000,000.
    const loans = Array.from({ length: 1000 }, (_, i) => simpleLoan({ id: `N02-${i}`, originalBalance: 100_000, noteRate: 0.06 }));
    const p = makePortfolio(loans);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.06, psaPercent: 100 } }));
    const m1 = out.ledger[0];
    expect(m1.beginningUpb).toBeCloseTo(100_000_000, 4);
    expect(m1.prepaidPrincipal).toBeCloseTo((m1.beginningUpb - m1.scheduledPrincipal) * cprToSmm(0.06), 6);
    expect(m1.cpr!).toBeCloseTo(0.06, 12);
  });
});

describe('N03 PSA benchmark', () => {
  it('100% PSA months 1/30/60 give 0.2%/6%/6% CPR; 200% doubles', () => {
    expect(psaCpr(1, 100)).toBeCloseTo(0.002, 15);
    expect(psaCpr(30, 100)).toBeCloseTo(0.06, 15);
    expect(psaCpr(60, 100)).toBeCloseTo(0.06, 15);
    expect(psaCpr(1, 200)).toBeCloseTo(0.004, 15);
    expect(psaCpr(30, 200)).toBeCloseTo(0.12, 15);
    expect(psaCpr(60, 200)).toBeCloseTo(0.12, 15);
  });
  it('uses each loan age, not the portfolio average age', () => {
    const young = simpleLoan({ id: 'young', ageMonths: 0 });
    const old = simpleLoan({ id: 'old', ageMonths: 58 });
    const p = makePortfolio([young, old]);
    const s = scenarioFor(p, { mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: 100 } });
    // Month 1: young age 1 (0.2% CPR), old age 59 (6% CPR). Average age 30 would give 6% for both.
    const ly = loanLedger(p, s, 'young')[0];
    const lo = loanLedger(p, s, 'old')[0];
    expect(smmToCpr(ly.payoffProbability)).toBeCloseTo(0.002, 12);
    expect(smmToCpr(lo.payoffProbability)).toBeCloseTo(0.06, 12);
  });
});

function conservationCheck(p: Portfolio, s: ScenarioInput) {
  const ctx = createContext(s, Math.max(...p.loans.map((l) => l.remainingTerm)));
  for (const loan of p.loans) {
    simulateLoan(loan, ctx, (m) => {
      const tol = Math.max(0.01, m.beginningBalance * 1e-10);
      const diff = m.beginningBalance - (m.scheduledPrincipal + m.prepaidPrincipal + m.endingBalance);
      if (Math.abs(diff) > tol) throw new Error(`loan ${loan.id} t=${m.t} leaks ${diff}`);
      if (m.endingBalance < 0 || m.scheduledPrincipal < 0 || m.prepaidPrincipal < 0) throw new Error(`negative at ${loan.id} t=${m.t}`);
    });
  }
  const out = runScenario(p, s);
  for (const m of out.ledger) {
    const tol = Math.max(0.01, m.beginningUpb * 1e-10);
    expect(Math.abs(m.beginningUpb - m.scheduledPrincipal - m.prepaidPrincipal - m.endingUpb)).toBeLessThanOrEqual(tol);
    expect(m.endingUpb).toBeGreaterThanOrEqual(0);
  }
  for (let i = 1; i < out.ledger.length; i++) {
    const prev = out.ledger[i - 1].endingUpb;
    expect(Math.abs(out.ledger[i].beginningUpb - prev)).toBeLessThanOrEqual(Math.max(0.01, prev * 1e-10));
  }
  return out;
}

describe('N04 principal conservation', () => {
  it('holds for every loan-month and portfolio-month in each mode', () => {
    conservationCheck(mixed, base());
    conservationCheck(mixed, base({ ratePath: { offerRate: 0.03, shockBps: -200, shape: 'ramp12', customPath: [] } }));
    conservationCheck(mixed, base({ mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.6, psaPercent: 100 } }));
    conservationCheck(mixed, base({ mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: 500 } }));
  });
});

describe('N05 zero prepayment', () => {
  it('returns all principal as scheduled and counts no maturity as voluntary', () => {
    const s = base({ mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } });
    const out = runScenario(mixed, s);
    expect(out.summary.lifetimePrepaid).toBe(0);
    const upb = mixed.loans.reduce((a, l) => a + l.currentBalance, 0);
    expect(Math.abs(out.summary.lifetimeScheduled - upb)).toBeLessThan(0.01);
    const last = out.ledger[out.ledger.length - 1];
    expect(last.endingUpb).toBe(0);
    expect(out.ledger.reduce((a, m) => a + m.maturedLoans, 0)).toBeCloseTo(mixed.loans.length, 9);
    expect(out.ledger.every((m) => m.voluntaryPayoffs === 0 && m.unclassifiedPayoffs === 0)).toBe(true);
    // Fixed CPR identifies no payoff cause, so the split is not applicable rather than zero.
    expect(out.ledger.every((m) => m.refiPayoffs === null && m.turnoverPayoffs === null)).toBe(true);
  });
  it('maturity month has zero voluntary payoff even when speeds are high', () => {
    const p = makePortfolio([simpleLoan({ id: 'm', ageMonths: 350 })]);
    const rows = loanLedger(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.5, psaPercent: 100 } }), 'm');
    const last = rows[rows.length - 1];
    expect(last.prepaidPrincipal).toBe(0);
    expect(last.endingBalance).toBe(0);
    expect(last.matured).toBeGreaterThan(0);
  });
});

describe('N06 zero rates and one-month loans', () => {
  it('amortizes a 0% loan in equal principal and discounts at 0% without error', () => {
    const p = makePortfolio([simpleLoan({ id: 'z', noteRate: 0, originalBalance: 120_000 })]);
    const s = scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 }, servicingParameters: { feeOverrideBps: null, costPerLoan: null, discountRate: 0 } });
    const out = runScenario(p, s);
    expect(out.ledger[0].scheduledPrincipal).toBeCloseTo(120_000 / 360, 9);
    expect(out.ledger[0].noteInterest).toBe(0);
    expect(out.ledger[359].endingUpb).toBe(0);
    expect(Number.isFinite(out.summary.servicingNpv)).toBe(true);
    expect(out.summary.servicingNpv).toBeCloseTo(out.summary.lifetimeNetServicing, 9);
  });
  it('closes a one-month loan completely', () => {
    const p = makePortfolio([simpleLoan({ id: 'one', originalTerm: 1, originalBalance: 1000 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0.3, psaPercent: 100 } }));
    expect(out.ledger).toHaveLength(1);
    expect(out.ledger[0].scheduledPrincipal).toBeCloseTo(1000, 9);
    expect(out.ledger[0].prepaidPrincipal).toBe(0);
    expect(out.ledger[0].endingUpb).toBe(0);
  });
});

describe('N07 servicing fee and cost units', () => {
  it('25 bps on $100mm is $20,833.3333 a month; 1,000 loans at $100 is $8,333.3333', () => {
    const loans = Array.from({ length: 1000 }, (_, i) => simpleLoan({ id: `N07-${i}`, originalBalance: 100_000 }));
    const p = makePortfolio(loans);
    const out = runScenario(p, scenarioFor(p));
    expect(out.ledger[0].grossFee).toBeCloseTo(20_833.3333, 3);
    expect(out.ledger[0].operatingCost).toBeCloseTo(8_333.3333, 3);
    expect(out.ledger[0].netServicing).toBeCloseTo(12_500, 3);
  });
});

describe('N08 portfolio SMM aggregates dollars', () => {
  it('is not the arithmetic average of cohort CPRs', () => {
    const big = simpleLoan({ id: 'big', originalBalance: 900_000, ageMonths: 100 });
    const small = simpleLoan({ id: 'small', originalBalance: 100_000, ageMonths: 2 });
    const p = makePortfolio([big, small]);
    const s = scenarioFor(p, { mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: 300 } });
    const out = runScenario(p, s);
    const m = out.ledger[0];
    const lb = loanLedger(p, s, 'big')[0];
    const ls = loanLedger(p, s, 'small')[0];
    const elig = lb.beginningBalance - lb.scheduledPrincipal + ls.beginningBalance - ls.scheduledPrincipal;
    const expected = (lb.prepaidPrincipal + ls.prepaidPrincipal) / elig;
    expect(m.smm!).toBeCloseTo(expected, 14);
    const avgCpr = (smmToCpr(lb.payoffProbability) + smmToCpr(ls.payoffProbability)) / 2;
    expect(Math.abs(m.cpr! - avgCpr)).toBeGreaterThan(0.01);
  });
});

describe('N09 refinance hazard behaves', () => {
  it('a lower offer rate never lowers the first-month refinance hazard', () => {
    const loan = simpleLoan({ id: 'h', noteRate: 0.07, ageMonths: 10, refiPropensity: 1.3 });
    const p = makePortfolio([loan]);
    let prev = -1;
    for (let bps = 1500; bps >= 100; bps -= 25) {
      const rate = bps / 10_000;
      const s = scenarioFor(p, { ratePath: { offerRate: rate, shockBps: 0, shape: 'immediate', customPath: [] } });
      const h = loanLedger(p, s, 'h')[0].refiHazard!;
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
  it('stays valid at input bounds', () => {
    const loan = simpleLoan({ id: 'b', noteRate: 0.15, ageMonths: 40, refiPropensity: 1.5 });
    const p = makePortfolio([loan]);
    for (const offer of [0.01, 0.15]) {
      for (const mult of [0, 2]) {
        for (const friction of [0, 200]) {
          const s = scenarioFor(p, {
            ratePath: { offerRate: offer, shockBps: 0, shape: 'immediate', customPath: [] },
            behavioralParameters: { turnoverMultiplier: mult, refiMultiplier: mult, frictionBps: friction, burnout: true, seasonality: 'seasonal' },
          });
          for (const m of loanLedger(p, s, 'b')) {
            expect(Number.isFinite(m.payoffProbability)).toBe(true);
            expect(m.payoffProbability).toBeGreaterThanOrEqual(0);
            expect(m.payoffProbability).toBeLessThan(1);
          }
        }
      }
    }
  });
});

describe('N10 cause split and survival', () => {
  it('refinance + turnover probability equals total, and survival compounds', () => {
    const s = base({ ratePath: { offerRate: 0.05, shockBps: 0, shape: 'immediate', customPath: [] } });
    const ctx = createContext(s, 360);
    for (const loan of mixed.loans.slice(0, 200)) {
      let prevW = 1, prevQ = 0;
      simulateLoan(loan, ctx, (m) => {
        expect(Math.abs(m.refiProbability! + m.turnoverProbability! - m.payoffProbability)).toBeLessThanOrEqual(1e-15);
        expect(m.unclassifiedProbability).toBe(0);
        if (m.t > 1) expect(Math.abs(m.survival - prevW * (1 - prevQ))).toBeLessThan(1e-14);
        expect(Math.abs(m.refiPayoffs! + m.turnoverPayoffs! - m.survival * m.payoffProbability)).toBeLessThan(1e-14);
        expect(m.voluntaryPayoffs).toBeCloseTo(m.survival * m.payoffProbability, 15);
        prevW = m.survival;
        prevQ = m.payoffProbability;
      });
    }
  });
  for (const mode of ['behavioral', 'fixedCpr', 'psa'] as const) {
    it(`${mode}: expected loan count falls exactly by voluntary payoffs and maturities`, () => {
      const out = runScenario(mixed, base({ mode }));
      for (let i = 1; i < out.ledger.length; i++) {
        const p = out.ledger[i - 1];
        const expected = p.beginningLoans - p.voluntaryPayoffs - p.maturedLoans;
        expect(Math.abs(out.ledger[i].beginningLoans - expected)).toBeLessThan(1e-9);
      }
    });
  }
  it('behavioral: refinance + turnover payoffs and principal equal the totals; nothing is unclassified', () => {
    const out = runScenario(mixed, base());
    for (const m of out.ledger) {
      expect(Math.abs(m.refiPayoffs! + m.turnoverPayoffs! - m.voluntaryPayoffs)).toBeLessThan(1e-9);
      expect(Math.abs(m.refiPrepaidPrincipal! + m.turnoverPrepaidPrincipal! - m.prepaidPrincipal)).toBeLessThan(1e-6);
      expect(m.unclassifiedPayoffs).toBe(0);
      expect(m.unclassifiedPrepaidPrincipal).toBe(0);
    }
  });
  for (const mode of ['fixedCpr', 'psa'] as const) {
    it(`${mode}: causes are unidentified, so every payoff is unclassified and the split is not applicable`, () => {
      const out = runScenario(mixed, base({ mode }));
      expect(out.ledger.some((m) => m.voluntaryPayoffs > 0)).toBe(true);
      for (const m of out.ledger) {
        expect(m.refiPayoffs).toBeNull();
        expect(m.turnoverPayoffs).toBeNull();
        expect(m.refiPrepaidPrincipal).toBeNull();
        expect(m.turnoverPrepaidPrincipal).toBeNull();
        expect(m.unclassifiedPayoffs).toBe(m.voluntaryPayoffs);
        // Total prepayment dollars are unchanged: all of them are unclassified.
        expect(Math.abs(m.unclassifiedPrepaidPrincipal - m.prepaidPrincipal)).toBeLessThan(1e-6);
        expect(m.recapturedLoans).toBeNull();
      }
      const loan = loanLedger(mixed, base({ mode }), mixed.loans[0].id)[0];
      expect(loan.refiProbability).toBeNull();
      expect(loan.turnoverProbability).toBeNull();
      expect(loan.unclassifiedProbability).toBe(loan.payoffProbability);
      expect(out.summary.recapturePv).toBeNull();
    });
  }
});

describe('N11 rate-insensitive modes', () => {
  for (const mode of ['fixedCpr', 'psa'] as const) {
    it(`${mode} ignores rates, behavior and recapture controls`, () => {
      const a = base({ mode });
      const b = base({
        mode,
        ratePath: { offerRate: 0.02, shockBps: -300, shape: 'ramp12', customPath: [] },
        behavioralParameters: { turnoverMultiplier: 2, refiMultiplier: 2, frictionBps: 0, burnout: false, seasonality: 'seasonal' },
        recaptureParameters: { share: 1, contributionPerLoan: 9000, campaignCost: 500_000 },
      });
      expect(scenarioInputHash(a)).toBe(scenarioInputHash(b));
      const ra = runScenario(mixed, a);
      const rb = runScenario(mixed, b);
      expect(stripTiming(rb)).toEqual(stripTiming(ra));
      expect(ra.summary.recapturePv).toBeNull();
    });
  }
  it('behavioral mode ignores the fixed CPR and PSA inputs', () => {
    const a = base();
    const b = base({ prepaymentParameters: { fixedCpr: 0.5, psaPercent: 400 } });
    expect(scenarioInputHash(a)).toBe(scenarioInputHash(b));
  });
});

describe('N12 discounting', () => {
  it('a higher discount rate lowers NPV when all net cash flows are positive', () => {
    // With per-loan cost, late months of small balances go negative, so use zero cost here.
    const s = (d: number) => base({ mode: 'fixedCpr', servicingParameters: { feeOverrideBps: null, costPerLoan: 0, discountRate: d } });
    const r = [0, 0.05, 0.1, 0.2, 0.3].map((d) => runScenario(mixed, s(d)));
    expect(r[0].ledger.every((m) => m.netServicing > 0)).toBe(true);
    for (let i = 1; i < r.length; i++) expect(r[i].summary.servicingNpv).toBeLessThan(r[i - 1].summary.servicingNpv);
  });
  it('a negative-margin book stays negative instead of being clamped', () => {
    const loans = Array.from({ length: 20 }, (_, i) => simpleLoan({ id: `neg-${i}`, originalBalance: 80_000 }));
    const p = makePortfolio(loans);
    const out = runScenario(p, scenarioFor(p, { servicingParameters: { feeOverrideBps: 5, costPerLoan: 900, discountRate: 0.1 } }));
    expect(out.summary.servicingNpv).toBeLessThan(0);
    expect(out.summary.servicingValueBps!).toBeLessThan(0);
    expect(out.warnings.some((w) => w.code === 'negative-margin')).toBe(true);
  });
});

describe('N13 chart horizon is presentation only', () => {
  it('leaves NPV, WAL and the input hash unchanged', () => {
    const outs = ([12, 36, 60] as const).map((h) => runScenario(mixed, base({ chartHorizon: h })));
    expect(new Set(outs.map((o) => o.inputHash)).size).toBe(1);
    expect(outs[1].summary.servicingNpv).toBe(outs[0].summary.servicingNpv);
    expect(outs[2].summary.wal).toBe(outs[0].summary.wal);
    expect(outs[0].ledger.length).toBe(Math.max(...mixed.loans.map((l) => l.remainingTerm)));
  });
});

describe('N14 recapture is an overlay', () => {
  it('raising the share leaves original-book runoff and NPV unchanged', () => {
    const lo = runScenario(mixed, base({ recaptureParameters: { share: 0.1, contributionPerLoan: 1500, campaignCost: 0 } }));
    const hi = runScenario(mixed, base({ recaptureParameters: { share: 0.9, contributionPerLoan: 1500, campaignCost: 0 } }));
    expect(hi.ledger.map((m) => m.prepaidPrincipal)).toEqual(lo.ledger.map((m) => m.prepaidPrincipal));
    expect(hi.summary.servicingNpv).toBe(lo.summary.servicingNpv);
    expect(hi.summary.recapturePv!).toBeGreaterThan(lo.summary.recapturePv!);
  });
  it('at 0% share the contribution is minus campaign cost only', () => {
    const out = runScenario(mixed, base({ recaptureParameters: { share: 0, contributionPerLoan: 1500, campaignCost: 75_000 } }));
    expect(out.summary.recapturePv).toBe(-75_000);
    expect(out.summary.combinedContribution).toBeCloseTo(out.summary.servicingNpv - 75_000, 6);
  });
});

describe('N15 not-applicable metrics', () => {
  it('an empty population reports null ratios, not 0 or NaN', () => {
    const out = runScenario(mixed, base(), { state: ['ZZ'] });
    expect(out.population.loanCount).toBe(0);
    expect(out.summary.nextMonthCpr).toBeNull();
    expect(out.summary.cpr12).toBeNull();
    expect(out.summary.servicingValueBps).toBeNull();
    expect(out.summary.wal).toBeNull();
    expect(out.ledger).toHaveLength(0);
    expect(JSON.stringify(out)).not.toMatch(/NaN|Infinity/);
  });
  it('month SMM is null once eligible balance is zero', () => {
    const p = makePortfolio([simpleLoan({ id: 'x', originalTerm: 2, originalBalance: 2000 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr' }));
    expect(out.ledger[1].smm).toBeNull();
    expect(out.ledger[1].cpr).toBeNull();
  });
});

describe('N16 reproducibility', () => {
  it('the seeded generator is deterministic', () => {
    const a = generatePortfolio({ seed: 42 });
    const b = generatePortfolio({ seed: 42 });
    expect(a.meta.hash).toBe(b.meta.hash);
    expect(a.loans).toEqual(b.loans);
    expect(generatePortfolio({ seed: 43 }).meta.hash).not.toBe(a.meta.hash);
  });
  it('identical inputs give identical outputs', () => {
    const a = runScenario(mixed, base({ ratePath: { offerRate: 0.0625, shockBps: -100, shape: 'ramp12', customPath: [] } }));
    const b = runScenario(loadPreset('mixed'), base({ ratePath: { offerRate: 0.0625, shockBps: -100, shape: 'ramp12', customPath: [] } }));
    expect(stripTiming(a)).toEqual(stripTiming(b));
  });
});
