/** Source-backed convention checks and independent counterexamples. See docs/DOMAIN_AUDIT.md. */
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/domain/engine';
import { geometricAnnualCpr, levelPayment, periodCpr } from '../../src/domain/math';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';
import { loanProblems } from '../../src/storage/files';

describe('October 2026 mortgage-domain audit', () => {
  it('D01: period CPR uses end-of-period scheduled balances, not chained portfolio SMMs', () => {
    // Both zero-rate loans pay $1,000/month. The short loan matures inside the
    // window; only the long loan contributes to the no-prepayment month-12 balance.
    const p = makePortfolio([
      simpleLoan({ id: 'long', originalBalance: 120_000, originalTerm: 120, noteRate: 0 }),
      simpleLoan({ id: 'short', originalBalance: 24_000, originalTerm: 24, ageMonths: 12, noteRate: 0 }),
    ]);
    const s = scenarioFor(p, { mode: 'psa' });
    const out = runScenario(p, s);
    // Independent survival product for the long loan's PSA months 1..12.
    const survival = Array.from({ length: 12 }, (_, i) => (1 - 0.002 * (i + 1)) ** (1 / 12))
      .reduce((a, b) => a * b, 1);
    expect(out.summary.cpr12).toBeCloseTo(1 - survival, 12);
    expect(out.summary.cpr12).toBeCloseTo(1 - out.ledger[11].endingUpb / 108_000, 12);
    expect(out.cohorts.coupon[0].cpr12).toBeCloseTo(1 - survival, 12);
  });

  it('D02: level payment approaches the zero-rate limit continuously', () => {
    for (const rate of [1e-14, 1e-16]) {
      // First-order expansion; omitted second-order term is < $1e-19 here.
      const expected = 300_000 / 360 + 300_000 * (361 / 720) * (rate / 12);
      expect(levelPayment(300_000, rate, 360)).toBeCloseTo(expected, 9);
    }
  });

  it('D03: SIFMA SF-4/5 published first cash flow, at 150 PSA', () => {
    const p = makePortfolio([simpleLoan({ id: 'sifma', originalBalance: 1_000_000, noteRate: 0.095,
      servicingFeeBps: 50, annualCost: 0 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'psa', prepaymentParameters: { psaPercent: 150, fixedCpr: 0 } }));
    const m = out.ledger[0];
    // Source figures are fractions of par rounded to eight decimal places.
    const tol = 0.000000005 * 1_000_000;
    expect(Math.abs(m.scheduledPrincipal - 491.88)).toBeLessThan(tol);
    expect(Math.abs(m.prepaidPrincipal - 250.22)).toBeLessThan(tol);
    expect(Math.abs(m.noteInterest - 7916.67)).toBeLessThan(tol);
    expect(Math.abs(m.grossFee - 416.67)).toBeLessThan(tol);
    expect(Math.abs(m.ownerNetInterest + m.scheduledPrincipal + m.prepaidPrincipal - 8242.10)).toBeLessThan(tol);
    // SF-51 publishes 9.77844 years with a 14-day delay; this lab has no delay.
    expect(Math.abs(out.summary.wal! + 14 / 360 - 9.77844)).toBeLessThan(0.000005);
  });

  it('D04: SIFMA SF-13 published six-month aggregate CPR', () => {
    // Published balances in dollars; CPR is printed to four percentage decimals.
    expect(Math.abs(periodCpr(2_813_127.42, 2_859_330.23, 6)! - 0.032056)).toBeLessThan(0.0000005);
    expect(periodCpr(0, 100, 6)).toBe(1);
    expect(periodCpr(100, 100, 6)).toBe(0);
  });

  it('D05: PSA uses the next accrual month and scales CPR before conversion', () => {
    for (const ageMonths of [0, 1, 28, 29, 30]) {
      const p = makePortfolio([simpleLoan({ id: 'age', ageMonths })]);
      const out = runScenario(p, scenarioFor(p, { mode: 'psa', prepaymentParameters: { psaPercent: 250, fixedCpr: 0 } }));
      expect(out.summary.nextMonthCpr).toBeCloseTo(Math.min(0.002 * (ageMonths + 1), 0.06) * 2.5, 12);
    }
  });

  it('D06: differing amortization and PSA speeds require endpoint weighting even without maturities', () => {
    const p = makePortfolio([
      simpleLoan({ id: 'new', originalBalance: 120_000, originalTerm: 120, noteRate: 0, state: 'MD' }),
      simpleLoan({ id: 'seasoned', originalBalance: 24_000, originalTerm: 24, ageMonths: 10, noteRate: 0, state: 'VA' }),
    ]);
    const s = scenarioFor(p, { mode: 'psa' });
    const survival = (age: number) => Array.from({ length: 12 }, (_, i) => (1 - 0.002 * (age + i + 1)) ** (1 / 12))
      .reduce((a, b) => a * b, 1);
    const expected = 1 - (108_000 * survival(0) + 2_000 * survival(10)) / 110_000;
    const out = runScenario(p, s);
    expect(out.summary.cpr12).toBeCloseTo(expected, 12);
    expect(Math.abs(out.summary.cpr12! - geometricAnnualCpr(out.ledger.slice(0, 12).map(m => m.smm))!)).toBeGreaterThan(0.0001);
    expect(out.cohorts.coupon[0].cpr12).toBeCloseTo(expected, 12);
    expect(runScenario(p, s, { state: ['VA'] }).summary.cpr12).toBeCloseTo(1 - survival(10), 12);
  });

  it('D07: a fully matured population has no period denominator, without shortening the window', () => {
    for (const originalTerm of [1, 6, 12]) {
      const p = makePortfolio([simpleLoan({ id: 'mature', originalTerm })]);
      const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr' }));
      expect(out.summary.cpr12).toBeNull();
      expect(out.cohorts.coupon[0].cpr12).toBeNull();
    }
    const p = makePortfolio([simpleLoan({ id: 'still-alive', originalTerm: 13 })]);
    const out = runScenario(p, scenarioFor(p, { mode: 'fixedCpr' }));
    expect(out.summary.cpr12).toBeCloseTo(0.08, 12);
  });

  it('D08: near-zero-rate import validation accepts amortization and rejects a balloon-like payment', () => {
    const loan = simpleLoan({ id: 'tiny', noteRate: 1e-16, contractualPayment: 300_000 / 360 });
    expect(loanProblems(loan)).toEqual([]);
    expect(loanProblems({ ...loan, contractualPayment: 1 }).length).toBeGreaterThan(0);
  });
});
