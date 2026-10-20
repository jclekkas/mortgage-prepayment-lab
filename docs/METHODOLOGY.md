# Methodology

Model `mpl-engine-1.2.0`, behavioral coefficients `behavioral-coeff-1.0.0`, scenario
schema 1, generator `synthetic-gen-1.1.0`. The version policy and history are in
`src/domain/version.ts` and `docs/RELEASE_NOTES.md`; requirement-by-requirement evidence
is in `docs/EVIDENCE.md`. Implemented in `src/domain/engine.ts`;
independently re-implemented in `scripts/reference_model.py` for verification.

Everything here is an educational convention, not a calibrated market forecast. No
coefficient is a FICO parameter.

## Units

- Rates are annual decimals internally (6.25% is `0.0625`). Basis-point inputs are divided by 10,000.
- Cash is in dollars. The synthetic generator rounds each loan's payment and current balance to whole cents so the data are identical in every JavaScript engine (generator 1.1.0); the engine itself does not round during calculation, and rounding otherwise happens only in display.
- Portfolio ratios are computed from summed dollars, never by averaging loan ratios.
- A ratio with a zero denominator is `null` and displays as "Not applicable", never 0 or not a number (NaN).

## Scope

The priority-0 (P0) release covers performing, fixed-rate, fully amortizing, first-lien residential loans with monthly
payments. Not modeled: negative amortization, adjustable rates, interest-only periods,
balloons, modifications, scheduled-payment delinquency, partial curtailments. The import
validator rejects records that imply them (payment not equal to the level payment for
the original terms, balance inconsistent with the schedule, age plus remaining term not
equal to original term, balance above original).

## Timing

Projection month 1 is the month after the as-of month. Loan age in month t is reported
age + t. Fees accrue on the beginning balance; cash is received at month end and
discounted at t/12 years.

## Loan balance, scheduled payment and survival

For loan i with contractual balance B, monthly rate r = note rate / 12 and n remaining payments:

```
A = B r / (1 - (1 + r)^-n)          (A = B / n when r = 0), fixed at origination
interest = B r
S = min(B, max(0, A - interest))    scheduled principal; at maturity S = B
R = B - S
```

Each loan carries a survival weight w (initially 1). With monthly full-payoff probability q:

```
expected scheduled principal = w S
expected prepaid principal   = w R q
expected ending balance      = w R (1 - q)
next w                       = w (1 - q)
next contractual balance     = R
```

A surviving borrower keeps paying the original contractual payment on the contractual
balance; payoffs shrink the expected pool through w, not by recasting payments.
Fractional expected loan counts are intentional. In the maturity month q = 0, so maturity
is never counted as a voluntary payoff.

Conservation: beginning = scheduled + prepaid + ending for every loan-month and
portfolio-month, within max($0.01, beginning unpaid principal balance (UPB) x 1e-10). Tested in
numerical acceptance test N04 of the product requirements document (PRD).

## Speeds

Prepayment speed is expressed as single monthly mortality (SMM), the share of the
balance left after scheduled principal that prepays in the month, and its annualized
form, the conditional prepayment rate (CPR):

```
SMM = prepaid principal / (beginning UPB - scheduled principal)
CPR = 1 - (1 - SMM)^12        SMM = 1 - (1 - CPR)^(1/12)
k-month aggregate CPR = 1 - (projected ending UPB / no-prepayment ending UPB)^(12/k)
```

The period measure uses the same starting loans and endpoint; its denominator amortizes every starting loan with no voluntary payoffs during the entire window. Loans matured by that endpoint contribute zero. A zero endpoint denominator gives null, without shortening the window. This corrects the prior geometric chaining of portfolio SMMs; see `DOMAIN_AUDIT.md` D1.

Conversions use `expm1`/`log1p` for precision. The payment denominator also uses these functions to preserve its zero-rate limit (D2). CPR is a conditional annualized speed, not
the share of today's book that prepays in a year. Twelve-month prepaid dollars come from
the monthly ledger, never CPR x initial UPB.

## Fixed CPR mode

Every loan, every month: q = SMM(CPR). Rate, behavior and recapture inputs are excluded
from the effective input and the hash.

## Payoff causes

Only behavioral mode identifies why a loan pays off (refinance or turnover). Fixed CPR and
the Public Securities Association (PSA) benchmark give a speed, not a reason, so their payoffs are **unclassified voluntary payoffs**:

```
voluntary payoffs_t     = sum of w q                       (every mode)
unclassified payoffs_t  = voluntary payoffs_t, unclassified prepaid = prepaid principal   (fixed CPR, PSA)
refinance / turnover    = not applicable (null)                                           (fixed CPR, PSA)
unclassified            = 0; refinance + turnover = voluntary                             (behavioral)
```

Total prepaid principal is identical either way; only the labeling differs. The ledger,
comma-separated values (CSV) export and per-loan drill-down show the refinance and turnover split as "not applicable"
outside behavioral mode, and recapture stays disabled there because it needs refinance
payoffs.

## PSA mode

```
100% PSA annual CPR at age a = min(0.002 a, 0.06)
loan CPR = min(1, that x PSA% / 100), converted to SMM, using each loan's own age
```

PSA is an age-based benchmark, not a rate-responsive forecast. Its payoffs are
unclassified (see Payoff causes). [S2]

## Behavioral mode

```
h_move  = 0.003 x turnoverMultiplier x seasonality(calendar month)
x       = (noteRate - offerRate_t) x 10,000 - frictionBps
s       = min(age / 30, 1)
burnout = exp(-0.02 E) if enabled, else 1
h_refi  = 0.04 x refiMultiplier x propensity x s x burnout x sigmoid(x / 50)
q       = 1 - exp(-h_move - h_refi)
q_refi  = q h_refi / (h_move + h_refi);  q_move = q - q_refi   (both 0 when total hazard is 0)
```

E counts prior months with x > 0. An x smaller than 10⁻⁶ basis points (bps) is floating-point noise and is set to exactly 0, so a loan exactly at the threshold never accrues burnout (see `docs/CALCULATION_REVIEW.md`, finding F1). It starts at 0 for every synthetic loan (disclosed in
every behavioral run) and is incremented after the current month is computed. Default
seasonality is 1; the optional preset is
`0.80 0.80 0.95 1.05 1.15 1.20 1.20 1.15 1.05 0.95 0.85 0.85` (January first), mean
exactly 1. Synthetic propensity ranges 0.5 to 1.5.

Offer-rate path for month t: `level + shock x f(t)`, with f = 1 (immediate),
`min(t, 12) / 12` (12-month ramp), or a custom monthly level list (last value persists)
plus the shock. Any resulting rate outside 1% to 15% is rejected, not clamped. Every
scenario recalculates its own full path; burnout makes results path dependent.

Omitted: qualification, home equity, credit changes, cash-out demand, lender pricing.
The model makes no claim that rate cuts always raise or lower enterprise value.

## Servicing cash flow and illustrative value

```
gross fee_t  = sum over loans of expected beginning balance x annual fee bps / 10,000 / 12
cost_t       = sum over loans of survival weight x annual cost per loan / 12
net_t        = gross fee_t - cost_t          (negative allowed)
NPV          = sum over all remaining contractual months of net_t / (1 + d)^(t/12)
value (bps)  = NPV / current UPB x 10,000    (null when UPB is 0)
```

The fee is each loan's contractual fee unless a hypothetical override is set (labeled a
contract change assumption). Cost is each loan's annual cost unless overridden. The
discount rate d is an annual effective rate, independent of the mortgage-rate path.

**Excluded:** escrow and remittance float, ancillary and late fees, servicing advances,
default and foreclosure costs, taxes, hedges, any terminal value or multiple. The number
is labeled "illustrative servicing net present value (NPV)" and is never called market value or fair value.
Negative values are not clamped; a negative-margin book can violate the usual heuristic
that slower prepayment raises value. Discounting projected servicing income under
explicit prepayment, cost and discount assumptions follows the broad framing in [S1].

## Loan-owner lens

Principal (scheduled and prepaid) and note interest are shown separately from servicing
fees; owner net interest = note interest - servicing fee. Simplified: before credit
losses, funding costs, guaranty fees, remittance delays and any security structure; not a
priced agency mortgage-backed security (MBS).

```
WAL = sum over all months of (t / 12) x (scheduled_t + prepaid_t) / current UPB
```

Weighted-average life (WAL) uses the full remaining maturity, independent of the chart
window (N13).

## Recapture (behavioral mode only)

```
recaptured_t   = sum over loans of w x q_refi x share       (q_refi = 0 in maturity months)
recapture PV   = sum_t recaptured_t x contribution / (1 + d)^(t/12) - campaign cost
combined       = original-book servicing NPV + recapture PV  (illustrative, not MSR fair value)
```

Recapture does not keep the original loan alive and does not change original-book runoff
(N14). Contribution per loan excludes any replacement servicing value. The campaign cost
is deducted once. Fixed CPR and PSA modes disable recapture because the payoff cause is
undefined.

## Sensitivities

One-factor-at-a-time changes from the active scenario, labeled non-additive; their sum
is not presented as an attribution. No waterfall is shown in P0. The two-way grid is
offer rate x refinance response (behavioral, flat immediate rate per cell), fixed CPR x
discount rate (fixed), or PSA x discount rate (PSA). Each cell is a full run and can be
opened as a scenario.

`planSensitivities` / `planGrid` build the scenarios without running them;
`assembleSensitivities` / `assembleGrid` turn summaries into rows and cells. The worker
runs every planned scenario through the same chunked runner as a normal run, so a cancel
takes effect within one 250-loan chunk. A cell that fails input validation is reported
as an error in that cell; a cancel stops the whole job. Tested in
`tests/unit/sensitivity.test.ts` (expected values from hand-built scenarios) and
`tests/unit/execute.test.ts` (cancellation and equality with the synchronous path).

## Hashes and reproducibility

- Portfolio hash: Secure Hash Algorithm 256 (SHA-256) hash of canonical JavaScript Object Notation (JSON), with sorted keys and shortest round-trip
  numbers, of loans, as-of month, seed and generator version.
- Input hash: SHA-256 of the effective input: only mode-relevant fields; names, ids and
  chart horizon excluded.
- Run key: hash of input hash plus the normalized population filter.
- The brief's reproducibility hash covers every scenario's run key.
- SHA-256 is implemented in `src/domain/hash.ts` so hashes are identical in Node, the
  worker and the page (no dependency on `crypto.subtle` or a secure context).

**Comparing only like with like.** Every result records its portfolio hash, valuation
month and normalized population filter. A result is *current* only when all three match
the workspace (`src/domain/comparability.ts`). Headline cards, explanations, charts, the
cohort table, the decision room, the brief and both exports use only current results.
A result kept after a cancelled or failed recalculation, or while one runs for a new
population, is labeled and excluded, never compared, printed or exported.
`buildScenarioFile` itself refuses a result for another population, and every CSV row
states its valuation month and population.

**Import reproduction check.** After an import, every scenario is re-run and compared
with the results saved in the file (`src/storage/verify.ts`). Input hash and run key must
match exactly. Every summary metric is compared, with a missing or extra metric reported.
A null ("not applicable") matches only null. Numbers match when
`|re-run - saved| <= max(1e-6, 1e-9 x max(|re-run|, |saved|))`. The engine is
deterministic, so this tolerance only absorbs floating-point differences between
JavaScript engines. Every differing metric is listed by name.

## Validation lab (synthetic)

A 1,000-loan history book (seed 4242) is frozen at 2024-09. The frozen forecast uses
default behavior and a flat 6.75% offer rate. "Actual" outcomes use the same model
structure with different parameters (refinance response 1.35, turnover 0.85, friction 35
bps, seasonal turnover), the synthetic rate path that occurred, and seeded loan-level
Bernoulli payoffs (seed 9001), so the forecast cannot fit by construction. Scores: mean
CPR error (bias) and mean absolute error in percentage points, prepaid-dollar error,
and cohort bias by note rate, against fixed 8% CPR and 100% PSA benchmarks.

Real-data validation, a priority-1 (P1) item for a later release, needs chronological train/validation/test windows, loan-level
grouping, as-of features, censoring at observation end, and separate voluntary payoff,
default/liquidation, repurchase and maturity, keeping "unknown voluntary payoff" when the
reason is unknown.

## Credit score refresh (synthetic, not a model input)

The credit score refresh page uses deterministic synthetic score observations. No engine input
contains a credit field, so scores never change prepayment, servicing cash flow, value, input
hashes or run keys. Rules, denominators, date restrictions, the break-even arithmetic and the
unimplemented extension interface are in `docs/CREDIT_REFRESH.md`.

## Verification

- `tests/numerics/acceptance.test.ts`: PRD N01-N16 with expected values derived from first principles or quoted from the PRD.
- `tests/numerics/reference.test.ts`: ledger and summary reconciliation (relative 1e-9) against six fixtures produced by `scripts/reference_model.py`, an independent Python implementation: single loan fixed and behavioral, six-loan multi-cohort with ramp shock, seasonality and burnout, custom rate path with cost override, PSA with fee override, and zero-rate plus one-month edge cases. A planted burnout bug fails this suite.

## Source review (October 20, 2026)

Primary sources for the calculation checks have now been retrieved. `DOMAIN_AUDIT.md`, section 6, records the exact documents, dates, sections and limits; `EVIDENCE.md` maps them to tests. SIFMA B.1–3 and G.1.c, Fannie Mae servicing guidance and the OCC handbook substantiate specific conventions, not behavioral coefficients or market values. The earlier October 19 source-access failure remains part of the historical review record. Oracle is not counted as substantively verified. Professional domain approval and empirical validation remain open.
