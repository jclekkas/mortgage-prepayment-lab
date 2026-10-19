# Release notes

## 1.0.0, priority-0 (P0) educational build, unreleased

Status: built and verified locally; **not deployed**. No production web address (URL) exists yet.

### Verification evidence

Recorded per tested commit in the pull request (PR) description and in the review handoff.
Gates: `npm run typecheck`, `npm run lint`, `npm run test:numerics` (35),
`npm test` (latest count in the PR), reference fixtures regenerate byte-identical, `npm run build`,
`npm run test:e2e` (latest count in the PR, Chromium, against a fresh production build).

### Fixed after the first review build (`6e723fc`)

Items D1 to D3 are the defects found in that review build.

- **D1** Sensitivity and grid jobs are now cancellable mid-run: each underlying run is
  chunked and checks for cancellation every 250 loans. The sensitivity panel gained a
  progress bar and Cancel button. Unit tests fail against the old executor (verified).
- **D2** The validation-lab hypothesis is saved on this device with the workspace and
  restored after navigation or reload.
- **D3** `sensitivity.ts` has unit tests (14) whose expected values come from hand-built
  scenarios, covering factor lists per mode, deltas, direction, bounds skips, the cost
  override, non-additivity, filters, grid axes and cells.
- An end-to-end assertion that had been silently swallowed (`.catch(() => {})`) in the
  10,000-loan import test now asserts the real import message.

### Fixed after the independent review of `3ce4cf5`

Items R1 to R3 are the findings of that review.

- **R1 Mixed-population comparisons.** A cancelled recalculation reverted to "done" while
  keeping an old-population result, which could then be compared, charted, printed and
  exported under the new filter. Results now record their valuation month. A single check
  (`comparability.ts`) requires the current portfolio, valuation month and normalized
  filter on every comparison surface. Retained results are labeled and excluded, and
  `buildScenarioFile` refuses them. Regression tests: `tests/unit/comparability.test.ts`
  (store reducer: filter change, then cancel or failure) and an end-to-end test on a
  10,000-loan book. Two planted versions of the bug both fail the unit test.
- **R2 Unknown payoff causes.** The fixed conditional prepayment rate (CPR) and Public Securities Association
  (PSA) modes set every payoff as turnover. They are now
  unclassified voluntary payoffs, with the refinance and turnover split "not applicable"
  in the ledger, comma-separated values (CSV) export and types. Total prepayment dollars are unchanged: the regenerated
  reference fixtures differ only in the cause fields. Recapture stays disabled in those
  modes.
- **R3 Partial reproduction check.** Import verification compared only scenario identifier (ID), run key
  and net present value (NPV). It now compares input hash, run key and every summary metric, including nulls,
  within a documented tolerance, and names each metric that differs. A saved `prepaid12`
  altered with NPV and run key intact is now detected (unit and end-to-end tests).
- A race found while testing R1: progress arriving just after Cancel could leave the grid
  panel showing "Calculating" indefinitely. Late progress from a cancelled grid is now
  ignored.

### Calculation review and preview hardening (after `805f912`)

- **F1 (fixed): floating-point noise at the refinance threshold.** (0.07 − 0.065) × 10,000 − 50
  evaluated to +4e−14, so loans exactly at the threshold (for example every 6.75% loan
  against the default 6.25% offer) accrued burnout each month. Incentives below 10⁻⁶ basis points (bps)
  are now exactly zero, in the engine and the Python reference. Baseline servicing NPV
  changes by −0.1% to −1.3% across the default books. See `docs/CALCULATION_REVIEW.md`.
- 26 closed-form worked examples (`tests/numerics/worked-examples.test.ts`) cover
  amortization, survival weighting, PSA indexing, fee units, NPV, weighted-average life (WAL), cause split,
  burnout timing and recapture.
- WebKit (Safari's engine) added to continuous integration (CI): the full end-to-end suite at desktop size, and the
  core journey on an iPhone-sized screen.
- An axe scan in dark mode was added.
- On phones the header no longer stays pinned (it took about 30% of the screen) and the
  navigation wraps.
- A preview notice on every screen, a footer stating no affiliation with FICO or any
  lender, and the build commit in the footer and `build.json`.
- A hosted-preview smoke test (`tests/preview`, `playwright.preview.config.ts`) and the
  `gh-pages` publishing path (`scripts/build-preview.sh`).

### Plain-English terms

- Each screen spells out a term in full the first time it matters, followed by its
  abbreviation, for example "conditional prepayment rate (CPR)".
- Headline cards, chart titles, table headers and controls carry a "?" button that opens a
  one-sentence plain-English explanation in place. It is a real button, so it works with
  touch, keyboard (Enter to open, Escape to close) and screen readers, with no hover needed.
- A collapsed "Terms on this page" section replaces the long abbreviation keys. The printed
  brief ends with a "Terms used in this brief" list.
- Everyday units: "basis points" and "percentage points" replace "bps" and "pp". The rate
  shock control says that 100 basis points equal 1 percentage point.
- Charts state what each axis shows. Export, import and error messages no longer use
  file-format abbreviations. The spreadsheet export keeps its machine-readable column names
  (for example `beginning_upb`), which `docs/DATA_DICTIONARY.md` spells out.
- The product requirements document (PRD) now expands every acronym at first use; its
  requirements are unchanged.

### Change arrows

- Every change versus the baseline (headline cards, decision room comparison, cohort
  change columns, sensitivity details) has a small arrow. Its shape shows direction
  (▲ up, ▼ down, ► little or no change).
- Its color shows the effect for the servicer: green better, red worse, yellow flat, grey
  neither in itself. A short word ("better", "worse", "flat") and a screen-reader sentence
  carry the same meaning, so color is never the only cue.
- As the PRD requires, prepayment speed is not judged by direction: faster prepayment is red
  for the servicer because payoffs end fee income, and grey in the loan owner view, where it
  changes timing rather than value. Balance and weighted-average life are always grey.
- "Flat" thresholds: 0.05 percentage points for speeds, half a basis point, 0.05 years, and
  under $1 or 0.5% of the baseline for dollars (`src/domain/trend.ts`, tested in
  `tests/unit/trend.test.ts`).

### First-use journey review

Walked a fresh session in a browser at desktop and phone widths: Mixed book, rate shock
-100 basis points, edit without running, then Run. Fixes:

- Edited but not yet run: the status badge now says "Edited: press Run to update results"
  (edits are saved on the device; they are just not calculated). The notice above the
  results names the pending edit, every headline card and the decision room column carry a
  "Previous run" tag, the charts say they are from the last run, and the explanation no
  longer says "this scenario has the same model inputs as the baseline" about an edited
  scenario. After Run the badge reads "Results are up to date" and every tag disappears.
- A scenario identical to the baseline shows a one-line note instead of a row of "flat"
  arrows.
- The assumptions panel names the scenario being edited and says what the frozen
  baseline is.
- Explanations claim only what the model establishes: the rate headline is used only when
  rates are the sole change and describes the incentive mechanism, value changes with
  several drivers say the comparison does not split them, and fallback wording no longer
  asserts which loans cost more than they earn.
- Plain wording: "Prepaid principal" has a help button explaining that every prepayment
  here is a full payoff; single monthly mortality is defined as the share of the
  remaining balance, after the scheduled payment, paid off early in the month; the Mixed
  book description drops "coupon" and "seasoned"; "Run key" became "Reproducibility key".
- Chart axis labels are larger on phones.


### Known limitations

- Synthetic data and uncalibrated, illustrative behavioral coefficients. Not a forecast, a FICO model or a validated valuation.
- A mortgage-domain reviewer has not yet approved the conventions; do not describe the tool as financially validated.
- Illustrative servicing NPV excludes float, ancillary fees, advances, default costs, taxes, hedges and terminal value.
- No delinquency, curtailments, modifications, adjustable-rate mortgages (ARMs), interest-only or balloon loans; these are later-phase, priority-1 (P1) scope.
- Burnout history starts at zero for every loan.
- Recapture excludes replacement servicing value; the uplift is an assumption.
- Loan-owner view excludes credit losses, funding costs, guaranty fees, remittance delays and security structure; no price or yield.
- Accessibility: automated axe scan and keyboard tests pass; a manual screen-reader review with NonVisual Desktop Access (NVDA) and VoiceOver has not been done.
- Performance was measured in a cloud container, not on a documented reference laptop.
- Usability success measures (five-user pilot) are not yet run.
- Saved work lives only in this browser's built-in database (IndexedDB); clearing site data removes it. Use Export to keep it.
