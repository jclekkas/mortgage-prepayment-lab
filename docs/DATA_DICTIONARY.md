# Data dictionary

All data is synthetic. No names, addresses, SSNs or real account identifiers exist anywhere in the app.

## Loan (`Loan`, `src/domain/types.ts`)

| Field | Type / unit | Meaning | Import rule |
| --- | --- | --- | --- |
| `id` | string | Synthetic loan id, e.g. `SYN-0042-00001` | `[A-Za-z0-9_-]{1,40}`, unique |
| `asOfMonth` | `YYYY-MM` | Month the record describes, after that month's payment | Must equal the portfolio as-of month |
| `originalBalance` | dollars | Balance at origination | > 0, <= 5,000,000 |
| `currentBalance` | dollars | Contractual balance after `ageMonths` payments | > 0, <= original, consistent with the schedule |
| `noteRate` | annual decimal | Borrower note rate | 0 to 0.20 |
| `originalTerm` | months | Original amortization term (360 in fixtures) | integer 1-480 |
| `ageMonths` | months | Payments made | integer; age + remaining = original |
| `remainingTerm` | months | Payments left | integer 1-480 |
| `contractualPayment` | dollars/month | Level P&I payment for the original terms | Must equal the level payment (fully amortizing) |
| `servicingFeeBps` | bps/year | Contractual servicing fee | 0-100 |
| `annualCost` | dollars/year | Cost to service while active | 0-1,000 |
| `state` | 2 letters | US state code | `[A-Z]{2}` |
| `refiPropensity` | factor | Synthetic refinance propensity | 0.5-1.5 |
| `cohort` | string | Generator cohort label (reference only) | `[A-Za-z0-9_-]{1,40}` |

## Portfolio metadata (`PortfolioMeta`)

`schemaVersion` (1), `generatorVersion`, `seed`, `synthetic` (must be `true`),
`createdDate`, `hash` (SHA-256, recomputed and checked on import), `presetId`, `name`,
`description`, `asOfMonth`.

## Generator (`src/data/generator.ts`)

Seed 42, 1,000 loans, mulberry32 PRNG. Cohorts: low coupon 2.75-3.75% aged 48-72 months;
middle 4.50-5.50% aged 24-42; high 6.75-7.75% aged 3-15. Rates on a 1/8-point grid.
Original balances lognormal around $330,000 (sigma 0.35, bounded $60k-$1.2m, rounded to
$1,000). Current balance and remaining term are derived from the contractual schedule.
Fee 25 bps, cost $100. Presets weight the cohorts 1:1:1 (mixed), 7:2:1 (seasoned
low-rate), 1:2:7 (recent higher-rate).

## Scenario input (`ScenarioInput`)

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `modelVersion` | Must be supported exactly; no migration |
| `portfolioHash`, `valuationMonth` | Must match the loaded portfolio |
| `baselineId`, `scenarioId`, `name` | Identity and label (not in the input hash) |
| `mode` | `behavioral`, `fixedCpr`, `psa` |
| `ratePath` | `offerRate` (decimal), `shockBps`, `shape` (`immediate`, `ramp12`, `custom`), `customPath` (decimals) |
| `behavioralParameters` | `turnoverMultiplier`, `refiMultiplier`, `frictionBps`, `burnout`, `seasonality` |
| `prepaymentParameters` | `fixedCpr` (decimal), `psaPercent` |
| `servicingParameters` | `feeOverrideBps` (null = contractual), `costPerLoan` (null = loan data), `discountRate` |
| `recaptureParameters` | `share`, `contributionPerLoan`, `campaignCost` |
| `seed` | Recorded for reproducibility |
| `chartHorizon` | 12, 36 or 60; display only |

Bounds are in `src/domain/config.ts` (`BOUNDS`) and shared by the UI, the engine and the import schema.

## Run output (`RunOutput`)

`inputHash`, `runKey`, `modelVersion`, `portfolioHash`, `valuationMonth`, `scenarioId`, `mode`,
`population` (filter, counts, UPB), `ledger` (one `LedgerMonth` per month to the last
maturity), `cohorts` (per segment dimension), `summary` (`SummaryMetrics`), `warnings`,
`durationMs`. Per-loan monthly drill-down is computed on demand (`loanLedger`).

Ledger payoff fields: `voluntaryPayoffs` (all causes); `refiPayoffs`, `turnoverPayoffs`,
`refiPrepaidPrincipal`, `turnoverPrepaidPrincipal` (behavioral mode, otherwise `null`);
`unclassifiedPayoffs`, `unclassifiedPrepaidPrincipal` (fixed CPR and PSA, 0 in behavioral
mode); `maturedLoans` (never voluntary).

## Cash-flow CSV columns

`scenario, run_key, model_version, valuation_month, population, month_index, month,
beginning_upb, scheduled_principal, prepaid_principal, ending_upb, note_interest,
owner_net_interest, expected_beginning_loans, expected_voluntary_payoffs,
expected_refinance_payoffs, expected_turnover_payoffs, expected_unclassified_payoffs,
refinance_prepaid_principal, turnover_prepaid_principal, unclassified_prepaid_principal,
expected_matured_loans, smm, cpr_annualized, gross_servicing_fee, operating_cost,
net_servicing_cash_flow, discount_factor, pv_net_servicing, offer_rate,
expected_recaptured_loans, recapture_contribution`.

`population` describes the filter the numbers were calculated for (for example "Whole
portfolio"). In fixed CPR and PSA modes the refinance and turnover columns are
`not applicable` and every payoff is in the unclassified columns; in behavioral mode the
unclassified columns are 0. Missing values export as `not applicable`. Text beginning with
`= + - @`, tab or CR is prefixed with `'`.

## Scenario file (`mortgage-prepayment-lab/scenarios`, schema 1)

`fileType`, `schemaVersion`, `modelVersion`, `exportedAt`, `portfolio` (`{kind: "preset", presetId, hash}` or `{kind: "embedded", meta, loans}`), `baselineId`, `scenarios` (1-4), `filter`, `notes`, `results` (scenario id, input hash, run key, summary). Unknown fields are rejected. Limits: 10 MB, 10,000 loans. URLs in a file are never fetched.
