# Requirements-to-evidence checklist

Model `mpl-engine-1.1.0`. Status as of October 19, 2026.

This checklist records, for each calculation rule, what is implemented and where the rule comes from. It also gives an expected result worked out independently of the code, the test that checks it, and what is still uncertain.

It is engineering evidence. It is not professional model validation, and it does not establish real-world accuracy.

## Source access: incomplete

Every attempt in this work session to retrieve and read an external source failed because the environment's network policy denied the host (DNS lookup refused). The failed hosts were:

- www.sifma.org: the Standard Formulas chapter, `chsf.pdf`;
- www.comptrollerofthecurrency.gov and occ.treas.gov: the Comptroller's Handbook, *Mortgage Banking*;
- docs.oracle.com: *PSA Method*;
- www.mathworks.com: `psaspeed2rate`, `mbswal`;
- en.wikipedia.org;
- www.sec.gov.

A web search did find these documents. Search snippets are not the documents, though, so they are not counted as reading them.

Consequences:

- **No row below is marked "source verified".** Where a rule is an industry convention, the row names the document that should confirm it and marks the check **incomplete**.
- `docs/METHODOLOGY.md` previously said its sources were "checked October 18, 2026". The session records show no successful retrieval of any of them, so that heading now says the sources are cited but not verified.
- The cross-check against `scripts/reference_model.py` shows that two implementations of the same written specification agree. It catches coding slips. It cannot catch a wrong specification, because the same author wrote both, so it is **not** independent validation.

The expected results below were derived by hand or by closed-form formulas. They come from the stated rule, not from running the engine.

## Checklist

| # | Topic | Implemented rule | Source or labeled assumption | Independent expected result | Test | Unresolved |
|---|---|---|---|---|---|---|
| 1 | Annual and monthly speed conversion | SMM = 1 - (1 - CPR)^(1/12); CPR = 1 - (1 - SMM)^12. k-month CPR is annualized geometrically. | Industry convention; should be confirmed by the SIFMA Uniform Practices *Standard Formulas* chapter, section B. Source check **incomplete**. | 6% CPR gives SMM = 1 - 0.94^(1/12) = 0.0051430128. Applied to $99.9M of eligible balance, that is $513,786.98 prepaid. | `tests/numerics/acceptance.test.ts` N01, N02 | Wording and notation of the standard not confirmed. |
| 2 | PSA age indexing | 100% PSA CPR at age a = min(0.2% x a, 6%). Age in projection month t = reported age + t, so a loan with 29 payments made is age 30 in the first projected month. | Convention; should be confirmed by SIFMA *Standard Formulas* (PSA benchmark). Source check **incomplete**. | A new loan: 0.2% CPR in month 1, 6% from month 30. A loan with 29 payments made: 6% in month 1. 250% PSA multiplies each month by 2.5. | `worked-examples.test.ts` W3; `acceptance.test.ts` N03 | **Open:** whether the standard counts the first projected month as age 1 or age 0. One month of offset changes early-life speeds. Domain reviewer question Q1. |
| 3 | Scheduled versus voluntary principal | Scheduled principal comes first. SMM applies to the balance left after it. In the maturity month the payoff probability is 0, so maturity is never counted as a voluntary payoff. | SMM definition, same SIFMA source. Source check **incomplete**. | Level payment on $300,000 at 6.5% over 360 months = $1,896.20 (closed form). A zero-prepayment run returns all principal as scheduled. | W1; N02; N05 | Partial prepayments (curtailments) are not modeled. |
| 4 | Survival weighting | Each loan has an expected-survival weight w. Each month, w becomes w(1 - q). Survivors keep the original contractual payment, and loan counts can be fractional. | **Teaching assumption** (expected-value pool), stated in METHODOLOGY. | At constant monthly speed s, the month-t balance, count and payment equal the contractual values times (1 - s)^(t-1). | W2; N10 | This is an expected value, not a simulation of individual payoffs. Domain reviewer question Q2. |
| 5 | Fee and cost units and timing | Fee = beginning balance x annual bps / 10,000 / 12. Cost = survival weight x annual cost per loan / 12. Both are received at month end and discounted at t/12 years. | **Teaching assumption** for timing and fee base. The OCC *Mortgage Banking* handbook is cited only for broad framing; source check **incomplete**. | 25 bps on $200,000 = $41.67 in month 1. $120 a year = $10 a month. Month-1 net of $31.67 has a present value at 10% of 31.67 / 1.1^(1/12) = $31.42. 25 bps on $100M = $20,833.33 a month. | W4; N07 | Real contracts may accrue the fee on the scheduled balance or on collected interest, and remittance delays and float are excluded. Domain reviewer question Q3. |
| 6 | Discounting and full-maturity valuation | NPV = sum over all remaining contractual months of net_t / (1 + d)^(t/12). d is an annual effective rate. No terminal value. | **Teaching assumption**: d is a flat illustrative rate, not market-calibrated. | A constant -$10 a month equals -10 times the annuity factor at d. The chart horizon (12 versus 36 months) leaves NPV, WAL and the input hash unchanged. | W5; N12; N13 | A single flat discount rate; no option-adjusted or market valuation. |
| 7 | Weighted-average life | WAL = sum (t / 12) x (scheduled_t + prepaid_t) / current UPB, over the full maturity. | Standard definition; should be confirmed by SIFMA *Standard Formulas*. Source check **incomplete**. | A zero-rate 360-month loan with no prepayment: (n + 1) / 24 = 15.0417 years. A constant-SMM zero-rate loan matches its geometric-series closed form. | W6 | None mathematically. The definition's source wording is not confirmed. |
| 8 | Refinance and turnover allocation | q = 1 - exp(-(h_move + h_refi)). The refinance share of q is q x h_refi / (h_move + h_refi). | **Teaching assumption** (competing hazards with a proportional split). Coefficients are illustrative and uncalibrated. | Zero effective incentive, seasoned loan: h_refi = 0.02, h_move = 0.003, q = 1 - e^-0.023 = 0.022738, refinance part 0.019772. | W7; N09; N10 | Functional form and coefficients are not calibrated to any data. Domain reviewer question Q4. |
| 9 | Burnout timing and threshold boundary | Burnout = exp(-0.02 E), where E counts *prior* months with incentive above zero. The current month does not count itself. Incentives within 1e-6 bps of zero are exactly zero. | **Teaching assumption**. The boundary rule is an engineering correction (CALCULATION_REVIEW finding F1; model 1.1.0). | A loan exactly 50 bps above the offer rate (zero effective incentive) keeps a constant hazard every month. A real 1 bp incentive still counts as positive. | W7; W9 | Burnout starts at 0 for every synthetic loan; history before the as-of date is ignored. |
| 10 | Recapture and campaign cost | Recaptured loans = sum of w x q_refi x share. Recapture PV = sum of recaptured_t x contribution / (1 + d)^(t/12) - campaign cost, with the cost deducted once. Recapture is reported separately from servicing NPV and never changes original-book runoff. | **Teaching assumption**. | One loan: PV = share x contribution x q_refi x (1 - (1 - q)^(n-1)) / q - cost. Raising the share leaves servicing NPV and runoff unchanged. | W8; N14 | The contribution per loan is a flat input; it excludes the new loan's own servicing value. |
| 11 | Cohort aggregation and filtering | Portfolio and cohort SMM come from summed dollars, never averages of ratios. A filtered result is current only for the same portfolio, valuation month and filter. | Arithmetic definition; no source needed. | Portfolio SMM differs from the simple average of cohort CPRs on a two-cohort example. | N08; `tests/unit/comparability.test.ts` | None known. |

## Invariants

| Invariant | Test |
|---|---|
| Beginning balance = scheduled + prepaid + ending, every loan-month and portfolio-month, all modes | N04; `tests/unit/invariants.test.ts` |
| Lifetime scheduled + prepaid principal = starting balance, and the final balance is zero | `invariants.test.ts` (behavioral, rate cut, fixed CPR 20%, PSA 300%) |
| Recapture does not alter servicing value or runoff | N14; W8 |
| The display horizon does not change valuation | N13; W5 |
| Inputs disabled for the selected model do not affect results | N11 (fixed CPR and PSA ignore rate, behavior and recapture; behavioral ignores fixed CPR and PSA) |
| Comparisons use the same population | `comparability.test.ts`; `invariants.test.ts` |
| Exports pair each result with the assumptions actually used | `invariants.test.ts` (an export with edited assumptions is refused); `comparability.test.ts` |
| "Rates down, value down" is not forced | `invariants.test.ts` covers three cases: standard book falls; zero-fee book rises and stays a loss; a rate rise raises value. `tests/unit/trend.test.ts` checks the labels. |
| Cross-engine determinism of the synthetic data | `tests/unit/generator-determinism.test.ts` (pinned preset fingerprints; verified identical in V8, Chromium and JavaScriptCore) |

## Acceptance review

`docs/ACCEPTANCE_REVIEW.md` separates what is checked (arithmetic), what is supported by retrieved sources (nothing yet), what is illustrative, and what needs a reviewer. It lists the exact documents still missing and adds worked examples E1 to E6 (`tests/numerics/acceptance-review.test.ts`).

## What would close the open items

1. Retrieve and read the source documents from a network that allows them, then confirm rows 1, 2, 3 and 7 against their actual text.
2. Have a qualified mortgage-domain reviewer answer `docs/DOMAIN_REVIEW_QUESTIONS.md`.
3. Compare against real loan performance data (out of scope; listed as a later item in the product requirements).
