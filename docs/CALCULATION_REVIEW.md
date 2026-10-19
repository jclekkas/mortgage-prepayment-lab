# Engineering review of the mortgage calculations

October 19, 2026 · reviewed at the PR head `805f912`, with fixes in the following commit.

**This is an engineering review of the arithmetic and conventions in an educational
simulator. It is not independent professional model validation.** It checks that the
code does what the PRD's calculation contract and standard market conventions say. It does
not check whether the behavioral model is realistic, calibrated or fit for valuation.

## Method

Agreement between the TypeScript engine and the Python reference model only shows that
two implementations of one reading of the PRD agree. So this review adds
`tests/numerics/worked-examples.test.ts`. Its expected values are derived **in closed
form**: published figures, annuity sums, geometric series and power formulas. None comes
from either implementation or from a month-by-month loop that mirrors the engine. The
review then changed only what those examples proved wrong.

**Sources.** The conventions are the standard ones in SIFMA (formerly PSA/Bond Market
Association) *Uniform Practices*, Chapter SF, "Standard Formulas", and the PRD's S1 to S3.
The review environment's network policy blocked sifma.org, mathworks.com and
docs.oracle.com, so the definitions below are stated from the reviewer's knowledge of
those documents, **not re-read during this review**. A reviewer with access should confirm
the SF chapter's month-numbering and average-life wording against the text.

## What was checked

| Area | Convention implemented | Independent check (closed form) | Result |
| --- | --- | --- | --- |
| Level payment | A = B r / (1 − (1+r)^−n) | $300,000 at 6.5% for 360 months = $1,896.20, the textbook figure | Pass (W1) |
| Scheduled amortization | Interest on the beginning balance; principal = A − interest; payoff forced at maturity | Balance after k payments B(1+r)^k − A((1+r)^k − 1)/r at k = 12, 120, 300, 359; interest + principal = A every month | Pass (W1) |
| Scheduled vs voluntary | Voluntary payoff applies to the balance *after* the scheduled payment; maturity is not voluntary | Month-t prepaid = w (B − (A − rB)) s; maturity month prepaid = 0 and matured = (1−s)^359 | Pass (W2, N05) |
| Survival weighting | Expected balance = w × contractual balance; survivors keep the original payment | At constant SMM s: w = (1−s)^(t−1), balance = w B_(t−1), expected P&I = w A (no recast), at months 1, 2, 60, 200, 359 | Pass (W2) |
| SMM and CPR | SMM = prepaid / (beginning − scheduled); CPR = 1 − (1 − SMM)^12 | 6% CPR gives SMM 0.5143%, not 0.5% (N02); portfolio SMM from summed dollars, not averaged CPRs (N08) | Pass |
| PSA seasoning and month index | CPR = 6% × min(age, 30)/30 × PSA%/100, age = months since origination, so the first month of life is age 1 | New loan: 0.2% in month 1 and 6% from month 30; a loan with 29 payments made is age 30 in its first projected month; 250% PSA scales every month | Pass (W3, N03) |
| Fee units and timing | Annual bps ÷ 10,000 ÷ 12 on the beginning balance; cost per expected active loan ÷ 12; received at month end | 25 bps on $200,000 = $41.67; $120 a year = $10 a month; PV at 10% = net × 1.1^(−1/12); fee is exactly fee/note rate of the month's interest | Pass (W4, N07) |
| Discounting and NPV | Σ net_t (1+d)^(−t/12) over every remaining contractual month | 12-month loan at −$10 a month equals −10 × the annuity factor at 0%, 10% and 30%; a 12-month chart horizon still values all 360 months (zero-rate closed form (0.0025/12) × B × 361/2) | Pass (W5, N13) |
| Weighted-average life | Σ (t/12)(scheduled + prepaid) / starting UPB, full maturity | Zero-rate, no prepayment: (n+1)/24 = 15.0417 years; at 12% CPR, the geometric-series sum | Pass (W6) |
| Cause probabilities | q = 1 − e^(−(h_move + h_refi)); split in proportion to hazards | At zero incentive: h_refi = 0.02, h_move = 0.003, q = 1 − e^(−0.023) and its split | Pass (W7) |
| Burnout timing | E counts *prior* months with positive incentive | Month t factor = exp(−0.02 (t−1)): the current month does not count itself; zero incentive never accrues | **Failed, then fixed (F1)** |
| Recapture | Share × refinance payoffs × contribution, discounted, minus the campaign cost once; maturity month excluded | One loan at constant hazards: share × contribution × q_refi (1 − (1−q)^(n−1))/q − cost; three loans give 3 × gross − cost once; servicing NPV unchanged; combined = NPV + recapture | Pass after F1 (W8, N14) |

## Finding F1 (fixed): floating-point noise turned "zero incentive" into "positive"

The effective incentive is x = (note rate − offer rate) × 10,000 − friction. In floating
point, (0.07 − 0.065) × 10,000 − 50 evaluates to **+4.3 × 10⁻¹⁴**, not 0. Whether a
threshold loan came out slightly positive or slightly negative depended arbitrarily on
the rate pair:

| Note / offer | x (bps) | Burnout before the fix |
| --- | --- | --- |
| 7.00% / 6.50% | +4.3e−14 | accrued every month |
| 6.75% / 6.25% | +4.3e−14 | accrued every month |
| 6.00% / 5.50% | −2.8e−14 | none |
| 7.25% / 6.75% | −9.2e−14 | none |

Loans exactly at the threshold therefore burned out as if they had a real incentive. Note
rates sit on a ⅛-point grid, so this is common: every 6.75% loan against the default 6.25%
offer and 50 bps friction was affected. The Python reference computed it identically, so
the two implementations always agreed, and one reference fixture had been carrying the
error (its ramped offer rate passes exactly 50 bps below the 6.50% note rate in month 3).

**Fix.** An incentive smaller than 10⁻⁶ bps is treated as exactly zero
(`INCENTIVE_EPSILON_BPS` in `engine.ts`), in both the engine and the reference.
Real incentives are whole or fractional basis points, far above this threshold.

**Regression tests.**

- W7: zero incentive never burns out.
- W8: the recapture closed form, which assumes constant hazards.
- W9: every ⅛-point note rate from 3% to 8% set exactly 50 bps above the offer keeps a constant hazard, and a real 1 bp incentive still counts.

Removing the fix fails three tests.

**Impact on the default books** (baseline assumptions; the −100 bps scenarios are unchanged
because no shocked rate lands exactly on the threshold):

| Book | Loans at 6.75% | Illustrative servicing NPV | WAL |
| --- | --- | --- | --- |
| Mixed | 22 | $3,545,316 → $3,524,196 (−0.6%) | 9.04 → 8.95 years |
| Seasoned low-rate | 4 | $3,728,139 → $3,722,887 (−0.1%) | 10.03 → 10.01 years |
| Recent higher-rate | 44 | $3,139,315 → $3,097,286 (−1.3%) | 7.48 → 7.31 years |

## Illustrative assumptions (by design, documented, not errors)

1. **Expected values, not discrete loans.** Survival weights give fractional expected loan counts; there is no loan-level randomness except in the synthetic validation history.
2. **Full-month fee and cost in the payoff month.** A loan that pays off during month t earns that month's fee on its beginning balance and incurs that month's cost. Mid-month payoff timing, interest-through-payoff-date and compensating interest are not modeled.
3. **End-of-month cash and no float.** Cash is discounted at t/12 years. Remittance delays, escrow float and the delay days in MBS cash flows are excluded.
4. **WAL from the projection start.** Measured in months from the as-of date ÷ 12, without the settlement or delay adjustment some market conventions apply.
5. **Constant fee and cost.** No cost inflation, no fee step-downs; one cost per active loan regardless of balance.
6. **Turnover has no seasoning ramp.** Only the refinance hazard seasons (min(age/30, 1)), as the PRD specifies. Real turnover also ramps with age.
7. **Burnout history starts at zero** for every synthetic loan, disclosed in every behavioral run.
8. **Recapture** uses the servicing discount rate, books the contribution in the payoff month, charges the campaign cost once at time zero, and excludes replacement servicing value. The uplift is an assumption, not a measured causal effect.
9. **Behavioral coefficients** (0.003, 0.04, 50 bps, 30 months, 0.02) are illustrative, versioned teaching values, not calibrated estimates and not FICO parameters.
10. **Payoff causes** are identified only in behavioral mode; fixed CPR and PSA payoffs are unclassified.

## Unresolved limitations

- Not professional model validation: no out-of-sample testing on real loan data, no benchmark against a vendor prepayment model, no sensitivity of results to coefficient uncertainty.
- The primary sources could not be re-read during this review (network policy); conventions should be confirmed against SIFMA Chapter SF by someone with access.
- The synthetic validation lab measures error against data generated by the same model structure; it cannot reveal structural misspecification.
- No delinquency, default, curtailment, modification, ARM, interest-only or balloon cash flows (P1 scope).
