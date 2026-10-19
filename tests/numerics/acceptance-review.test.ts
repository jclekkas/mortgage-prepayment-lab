/**
 * Worked examples from docs/ACCEPTANCE_REVIEW.md. Each expected value is written out from a
 * closed form or plain arithmetic (shown in the review), not taken from the engine.
 * These check arithmetic against the stated conventions; they do not show the conventions
 * match any published standard (sources could not be retrieved; see docs/EVIDENCE.md).
 */
import { describe, expect, it } from 'vitest';
import { loanLedger, runScenario } from '../../src/domain/engine';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

const fixed6 = { mode: 'fixedCpr' as const, prepaymentParameters: { fixedCpr: 0.06, psaPercent: 100 } };

describe('acceptance review worked examples', () => {
  it('E2: 150% PSA at age 10 is 3% CPR, SMM 0.00253505', () => {
    // 0.2% x 10 = 2% at 100% PSA; x 1.5 = 3%; SMM = 1 - 0.97^(1/12).
    const loan = simpleLoan({ id: 'e2', ageMonths: 9 }); // 9 payments made: age 10 in projection month 1
    const p = makePortfolio([loan]);
    const m = loanLedger(p, scenarioFor(p, { mode: 'psa', prepaymentParameters: { fixedCpr: 0.08, psaPercent: 150 } }), 'e2')[0];
    expect(m.payoffProbability).toBeCloseTo(0.00253505, 8);
  });

  it('E3: $200,000 at 6% for 360 months, month 1 at 6% CPR', () => {
    // Payment 1,199.10; interest 1,000.00; scheduled 199.10; prepaid (200,000 - 199.10) x 0.00514301 = 1,027.58;
    // expected ending 198,773.32; fee 200,000 x 0.0025 / 12 = 41.67.
    const loan = simpleLoan({ id: 'e3', originalBalance: 200_000, noteRate: 0.06 });
    const p = makePortfolio([loan]);
    const m = loanLedger(p, scenarioFor(p, fixed6), 'e3')[0];
    expect(m.contractualPayment).toBeCloseTo(1199.10, 2);
    expect(m.interest).toBeCloseTo(1000.0, 2);
    expect(m.scheduledPrincipal).toBeCloseTo(199.10, 2);
    expect(m.prepaidPrincipal).toBeCloseTo(1027.58, 2);
    expect(m.endingBalance).toBeCloseTo(198773.32, 2);
    expect(m.grossFee).toBeCloseTo(41.67, 2);
  });

  it('E6: zero fee, $100 a year cost: value is -985.15 with no prepayment and -629.61 at 6% CPR', () => {
    // Cost only: -100/12 x sum_{t=1..360} w_t / 1.1^(t/12).
    // No prepayment: w = 1, annuity factor (1 - 1.1^-30) / (1.1^(1/12) - 1) = 118.219 -> -985.15.
    // 6% CPR: w_t = (1 - 0.00514301)^(t-1) -> -629.61. Faster payoff means fewer months of cost, so a
    // smaller loss: the direction of the zero-fee counterexample, on one loan.
    const loan = simpleLoan({ id: 'e6', originalBalance: 200_000, noteRate: 0.06 });
    const p = makePortfolio([loan]);
    const zeroFee = { servicingParameters: { feeOverrideBps: 0, costPerLoan: null, discountRate: 0.1 } };
    const none = runScenario(p, scenarioFor(p, { ...zeroFee, mode: 'fixedCpr', prepaymentParameters: { fixedCpr: 0, psaPercent: 100 } }));
    const six = runScenario(p, scenarioFor(p, { ...zeroFee, ...fixed6 }));
    expect(none.summary.servicingNpv).toBeCloseTo(-985.15, 2);
    expect(six.summary.servicingNpv).toBeCloseTo(-629.61, 2);
  });
});
