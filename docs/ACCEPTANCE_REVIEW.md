# Acceptance review

> Historical review. The October 20 source checks, period-CPR correction and current status are in [DOMAIN_AUDIT.md](DOMAIN_AUDIT.md). Earlier blocked-source statements and numerical snapshots below describe that review date.

Model `mpl-engine-1.1.0`. Synthetic data. October 19, 2026.

Passing tests show that the arithmetic matches the stated rules. They do not show that the rules match market conventions, or that the model predicts real borrowers. **This review is not complete:** the source checks in section 3 are blocked, and the learner check in section 4 has not been run with a real learner.

## 1. Zero-fee controlled comparison

**What it isolates.** The two scenarios are identical except for the rate shock:
- same Mixed book, all 1,000 loans;
- same September 2026 valuation month;
- servicing fee overridden to 0 in both;
- loan-data cost of $100 a year per loan in both;
- same discount rate and behavior settings.

Rate shock 0 versus -100 basis points is the only difference. The test asserts that exactly one input differs.

**Steps in the app (fresh start):**

1. On the start page, pick **Mixed book**, then **Skip the guide and open the dashboard**.
2. Open **Scenario lab** (left menu). The scenario tab **2 Scenario 1** is selected at the top.
3. In the assumptions panel, under *Business decisions*, tick **Use a hypothetical servicing fee instead of the contract (25 basis points)**.
4. Set **Annual servicing fee (hypothetical)** to **0**. Press **Run** (top right).
5. At the bottom of the assumptions panel, press **Make baseline**. The zero-fee, no-shock run is now the frozen baseline (tab **1**) that everything is compared against.
6. Select the tab **2 Scenario 1** again. It still has the fee at 0.
7. Set **Rate shock** to **-100**. Press **Run**.
8. Read the headline cards and the explanation.

**Results.** Each delta is calculated as rate cut minus baseline.

| Measure | Zero fee, no shock (baseline) | Zero fee, -100 bps | Difference |
|---|---|---|---|
| Next-month prepayment speed | 7.76% | 11.18% | +3.41 pts, faster |
| 12-month prepaid principal | $29.21M | $41.20M | +$11.99M |
| 12-month net servicing cash flow | -$96,156 | -$94,453 | +$1,702, smaller loss |
| Servicing value today (NPV) | -$595,769 | -$506,698 | +$89,071, smaller loss |
| of which fees, in today's dollars | $0 | $0 | $0 |
| of which costs, in today's dollars | $595,769 | $506,698 | -$89,071 |
| Principal average life | 8.95 years | 7.30 years | -1.66 years |

Differences use unrounded values. Subtracting the rounded figures can differ by one unit in the last place: 11.18% - 7.76% would show 3.42 points, but the unrounded difference is 3.41.

**Reading the result.**
- With no fee, every month a loan stays costs the servicer $100 a year and earns nothing.
- Faster payoff means fewer of those months, so the loss shrinks.
- It is still a loss. The app labels it "smaller loss" and says "A smaller loss is not a profit."

**Evidence.**
- `tests/e2e/zero-fee.spec.ts` performs these exact steps by their visible labels in Chromium. It checks the displayed numbers against the engine and confirms only the rate shock differs.
- **Correction.** An earlier acceptance check told the reader to set the fee to 0 and the shock to -100 on one scenario, then compare against the default, positive-fee baseline. That compares two changes at once and does not isolate faster prepayment. The steps above replace it.

## 2. Worked examples (independent of the engine)

Each expected value below is derived from the stated rule with plain arithmetic. The engine was then checked against it (`tests/numerics/acceptance-review.test.ts`, plus the earlier W1 to W9 and N01 to N16).

| # | Example | Working | Expected | Engine |
|---|---|---|---|---|
| E1 | 6% CPR as a monthly rate | 1 - 0.94^(1/12) | SMM 0.00514301 | matches (N02) |
| E2 | 150% PSA, loan in its 10th month | 0.2% x 10 = 2%; x 1.5 = 3% CPR; 1 - 0.97^(1/12) | SMM 0.00253505 | matches |
| E3 | $200,000, 6%, 360 months, month 1 at 6% CPR | payment 200,000 x 0.005 / (1 - 1.005^-360) = 1,199.10; interest 1,000.00; scheduled 199.10; prepaid (200,000 - 199.10) x 0.00514301 = 1,027.58; ending 198,773.32; fee 200,000 x 0.0025 / 12 = 41.67 | as shown | matches to the cent |
| E4 | $100 received at month 12, 10% a year | 100 / 1.1 | $90.91 | matches the convention in W4 and W5 |
| E5 | Average life, zero-rate 360-month loan, no prepayment | (360 + 1) / 24 | 15.0417 years | matches (W6) |
| E6 | One loan, zero fee, $100 a year cost, 10% discount | no prepayment: -100/12 x (1 - 1.1^-30) / (1.1^(1/12) - 1) = -100/12 x 118.219; at 6% CPR, each month's cost weighted by the survival probability (1 - 0.00514301)^(t-1) | -$985.15; -$629.61 | matches |

E6 is the single-loan version of section 1: faster payoff cuts the months of cost, so the loss shrinks.

## 3. Evidence, separated by kind

### 3a. Arithmetic and software behavior: checked

These items are checked by tests with independently derived expected values:
- Every rule in the worked examples above.
- Principal conservation every month.
- Lifetime principal reconciles to the starting balance.
- Recapture does not change servicing value.
- The display horizon does not change valuation.
- Disabled inputs do not change results.
- Comparisons use the same population.
- Exports refuse results paired with edited assumptions.
- Arrows are neutral for speed and loss-aware for value.

Tests: `docs/EVIDENCE.md`, invariants table; `tests/numerics`; `tests/unit/invariants.test.ts`; `tests/unit/trend.test.ts`.

The Python reference model agreeing with the engine is **not** counted here as independent validation, because the same reading of the spec underlies both.

### 3b. Financial conventions supported by retrieved sources: none

No source document was retrieved. Every attempt was refused by the build environment's network policy:
- the first round tried SIFMA, OCC, Oracle, MathWorks, SEC and Wikipedia;
- this round tried SIFMA, OCC, Fannie Mae, Freddie Mac, Ginnie Mae, the Federal Reserve, CFPB, FHFA and the Internet Archive.

Web-search snippets were seen but are not counted as reading a source. Further retries from this environment would fail the same way.

**Exact missing evidence:**

| Convention used | Document needed | What to confirm |
|---|---|---|
| SMM to CPR conversion | SIFMA *Uniform Practices*, Chapter SF (Standard Formulas), prepayment section | the formula and that SMM applies to the balance after scheduled principal |
| 100% PSA = 0.2% CPR per month of age, capped at 6% from month 30 | same chapter, PSA benchmark | **whether the first projected month counts as age k + 1 (as implemented) or age k** |
| Weighted-average life | same chapter, average life | full maturity, principal-weighted, and any delay-day adjustment |
| Servicing fee as annual basis points of balance, accrued monthly; servicing value as discounted net cash flow | OCC Comptroller's Handbook, *Mortgage Banking*, servicing-rights sections | fee base (beginning, scheduled or collected balance) and what a valuation normally includes (float, ancillary income) |

### 3c. Illustrative assumptions: no empirical calibration

These are teaching values chosen for clarity, not fitted to any data:
- behavioral hazard coefficients (turnover 0.3% a month, refinance 4% scale, 50 bps friction, 30-month seasoning, burnout 0.02);
- burnout history starting at zero;
- flat $100 cost per loan;
- flat 10% discount rate;
- no float, ancillary income or default costs;
- recapture contribution of $1,500 per loan;
- the synthetic books and their offer rate.

The "Forecast check" page tests the model against data generated by a model of the same shape, so it cannot reveal a wrong structure.

**Role wording.** The app now uses role-based wording ("Principal repayment belongs to the loan owner. The servicer administers the loan and earns servicing fees. One organization may perform both roles."). It has not been checked against a source: the source sites this wording would need (for example the Consumer Financial Protection Bureau, consumerfinance.gov) are blocked by the same network policy. It stays under source review.

### 3d. Needs a qualified mortgage reviewer

All questions are in `docs/DOMAIN_REVIEW_QUESTIONS.md`. The most consequential are:
- Q1, PSA month numbering;
- Q3, fee base and timing;
- Q4, the turnover and refinance shapes, including whether "turnover does not depend on rates" needs a stronger warning;
- Q6, whether a flat 10% discount rate is a fair teaching default.

## 4. Review history

These are engineering and product reviews of the code and behavior. None of them is a formal model validation.

| Reviewed version | Reviewer | What it found | Status |
|---|---|---|---|
| `3ce4cf5` | Independent external review | Mixed-population comparisons, unknown payoff causes reported as turnover, partial reproduction check (R1 to R3) | Fixed in `805f912` |
| `b2016bd` | Independent external review | Broken lesson sequence, prepayment speed labeled as an economic judgment, inconsistent perspective, quick experiments that silently switched the model, no calculation version bump | Fixed in the commits after it (through `a4ecaa2`, with `8262ce0` for expected values); regression tests listed in `docs/RELEASE_NOTES.md` |
| `fdf028f` and later | Not yet independently re-reviewed | | Open |

## 5. Beginner comprehension check: prepared, not user-tested

Ask these after the guided experiment ("Start with a 3-minute guided experiment"). No real learner has taken it yet, so it does not show that the guide works.

1. **When a borrower refinances and pays off the old loan early, who gets the remaining principal?**
   *Answer guide:* the loan owner. Principal repayment belongs to the loan owner. The servicer administers the loan and earns servicing fees. One organization may perform both roles. In the servicer role, a payoff ends the future fee on that loan and the cost of servicing it.
2. **After the offer rate fell 1 percentage point, did loans pay off faster or slower, and why, in this model?**
   *Answer guide:* faster. In this illustrative model, the lower offered rate increases the modeled likelihood of refinancing. It does not determine whether refinancing is worthwhile for an individual borrower. Every borrower's modeled incentive rose by the same 1 point; the modeled response differs by group.
3. **Why did the estimated value today of servicing fall in the guided example?**
   *Answer guide:* the loans that left early gave up more in fees ($559.5K in today's dollars) than the servicer saved in costs ($89.1K).
4. **Is "faster payoffs are always bad for the servicer" true?**
   *Answer guide:* no. It depends on whether a loan earns more in fees than it costs. With a zero fee, faster payoff makes the loss smaller, but it is still a loss.
5. **Does the $3.05M figure tell you what this servicing business would sell for?**
   *Answer guide:* no. The loans are synthetic and the assumptions are illustrative. It leaves out things a real valuation includes, and its real-world accuracy has not been established.

**Pass mark** (suggested, untested): 4 of 5, with the reason, not just the direction.
