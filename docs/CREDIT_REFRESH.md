# Credit score refresh (synthetic, educational)

Route `#/credit`, in the Analyze menu between Loan groups and Decision room, with a compact
card on the Overview. Code: `src/domain/credit.ts` (data and calculations),
`src/features/credit/` (page and card).

> A score refresh gives us newer information. It does not itself improve a borrower's credit
> or generate investment returns.

## What is synthetic

Everything. Scores are generated in the browser from the synthetic loan identifiers and the
portfolio hash by an integer hash (fixture `synthetic-credit-1.0.0`). No credit bureau is
contacted, no score is ordered, no real borrower data can be entered, and no FICO scoring
algorithm is used or implied. Every screen and export carries the label "Illustrative score
data, not actual FICO Scores". This is an independent teaching project, not the FICO Score
Mortgage Simulator or any FICO product.

## Data model

Score observations are kept apart from loan economics; they reference a loan only by its
synthetic id. Each observation records: loan id; status (`scored`, `missing`, `unscorable`);
score (whole number 300 to 850, or null); score model and version; source; observed date;
available date; snapshot id; provenance (`synthetic-fixture`). Observations and snapshots are
frozen objects. A refresh adds a snapshot; it never overwrites an earlier one.

| Snapshot | Id (Mixed book) | Observed | Available | Contents |
|---|---|---|---|---|
| At origination | `origination` | month before each loan was made | same day | about 1.5% missing |
| Earlier refresh | `refresh-2025-09` | Sept 12, 2025 | Sept 19, 2025 | loans that existed then; about 3% missing, 1% unscorable |
| Newest refresh (simulated) | `refresh-2026-09` | Sept 12, 2026 | Sept 19, 2026 | about 25% unchanged, 37% up, 38% down; 3% missing, 1% unscorable, 5% on another score version, 2% from another source, 2% arriving Oct 14, 2026 |

Dates are relative to the portfolio's as-of month, so every preset gets the same structure.
The fixture is deterministic: pressing "Simulate score refresh" never draws new numbers.
Each snapshot has a SHA-256 fingerprint of its observations; the Mixed book fingerprints are
pinned in `tests/unit/credit.test.ts`.

## Rules

- **Analysis date** is the last day of the portfolio's as-of month (September 30, 2026). A
  record counts only if its available date is on or before it. Late records are excluded and
  the loan falls back to its earlier usable score.
- **Usable** means scored, available, and on the reference version (`Synthetic score model A,
  version 1.0`). For each loan the most recent usable score in the snapshots in use is the one
  analyzed; its age is whole months from its observed date to the analysis date.
- **A change** is computed only when the earlier and newer scores are both usable, on the same
  version and from the same source. Version changes and source changes are counted as excluded
  with their reason, never subtracted.
- **Denominators.** Every table states its denominator. Coverage, age, band and direction tables
  reconcile to the selected population (count and balance); band movement and the migration
  matrix reconcile to the comparable pairs. Loans without a usable score stay in the population
  and in every balance total.
- **Population** is the same `selectPopulation(portfolio, filter)` the engine uses.
- **No color judgment.** Increases and decreases are shown in neutral text; green and red stay
  reserved for servicer better/worse tags elsewhere.

## Workflow

1. Context: portfolio, population, analysis date, snapshots in use with provenance.
2. Coverage and score age of the information in use.
3. "Simulate score refresh (synthetic)" shows a preview; nothing is applied.
4. Tab A shows the information changes for the preview.
5. "Apply to the educational analysis" makes the newest snapshot the information in use;
   "Discard preview" drops it; "Revert to the earlier information" undoes an apply.
6. After applying, tab A keeps the comparison with the earlier information.

## Three kinds of result

- **A. Information changes**, computed directly from the fixtures.
- **B. Forecast revisions: "Not estimated: the current prepayment model does not use credit
  scores."** No engine input contains a credit field, so applying or reverting changes no
  prepayment or servicing calculation. The page shows the active scenario's input fingerprint
  and run key, which are the same before and after; unit and end-to-end tests assert this. No
  default or delinquency is inferred from score bands.
- **C. Break-even calculator (optional).** Inputs: billable refreshes, cost per refresh, fixed
  implementation cost, incremental action or campaign cost, assumed incremental successful
  outcomes, net contribution per outcome. All start at 0. Outputs: refresh cost, total
  incremental cost, incremental contribution, net benefit, and break-even outcomes = total cost
  / contribution per outcome, undefined when contribution per outcome is 0 or less. Horizon:
  one decision period, undiscounted (enter present values for multi-year outcomes). The app
  supplies no pricing, uplift, savings or return. To avoid double counting, an outcome that is
  a retained refinance must be counted here or in the Scenario lab's recapture contribution,
  not both, and the result is never added to a scenario's value.

## Extension interface (not implemented)

`ScoreAwarePrepaymentModel` in `src/domain/credit.ts` defines how a future score-aware model
would plug in. `SCORE_AWARE_MODEL` is `null` and the app offers nothing. A
`ScoreAwareForecastRequest` carries one `ScenarioInput` and one filter shared by both runs, so
portfolio, valuation month, analysis date, market assumptions (rate path), model version and
every non-credit input are held fixed and only the credit information (`earlier`, `newer`, each
with snapshot ids and fingerprints) differs. An implementation reports a forecast revision, not
realized profit, and must cite out-of-sample evidence on real, permitted data.

## State, files and migration

- Credit selection (`appliedSnapshotIds`, break-even inputs) is workspace state, saved on the
  device with the rest of the workspace. The preview flag is not saved.
- It is **not** part of any scenario input, input hash, run key, population key or result.
  Loan generation, the generator version, the model version (`mpl-engine-1.1.0`) and every
  numerical result are unchanged.
- Scenario files gain an optional, additive `credit` block (schema version stays 1): fixture
  version, data label, analysis date, `usedByPrepaymentResults: false`, the applied snapshots
  (id, kind, label, dates, record count, fingerprint, provenance) and the break-even inputs.
- **Migration.** Files and saved workspaces without the block (every earlier build) import
  unchanged and use the earlier information (origination plus earlier refresh). A block with a
  different fixture version, unknown snapshot ids or a fingerprint that does not match is not
  trusted: the workspace uses the earlier information and the import shows why; scenarios,
  notes and saved results are unaffected. A block claiming the results used scores, or with a
  negative cost, fails the strict schema and the file is refused, as with any malformed file.
- Changing the portfolio resets the credit selection.
- Export: "Download score records in use (CSV)" writes one row per observation for the
  selected population with snapshot, dates, status, version, source, usability, reason,
  fixture version, fingerprint and the data label.

## What a real score-data integration would require

- A permissible purpose and contract with a consumer reporting agency, and compliance review
  (Fair Credit Reporting Act, Equal Credit Opportunity Act and adverse-action rules, Gramm-Leach-Bliley
  privacy and safeguards, state law), plus a license for the score model.
- Server-side handling: encryption, access control, audit logs, retention and deletion; never in
  a browser-only app or in exported files.
- Real observation and availability dates from the provider, recorded per pull, and a stable
  loan-to-borrower linkage with co-borrower handling.
- Explicit handling of score model versions and sources, including any official mapping
  between versions; no subtraction across versions without one.
- Fair-lending review of any action taken on refreshed scores.

## Evidence needed before claiming better forecasts or financial benefit

- **Better forecasts:** an out-of-time, out-of-sample test on real loan histories showing that a
  model with refreshed scores predicts prepayment better than the same model without them,
  holding every other input fixed, with uncertainty intervals and stability across periods and
  segments.
- **Financial benefit:** a randomized or otherwise credible comparison (for example a held-out
  group not acted on) measuring incremental outcomes, their realized contribution and every
  cost, over a stated horizon with discounting. A forecast revision alone is not a benefit.
- Neither exists for this project. Nothing here is validated or investment-grade.
