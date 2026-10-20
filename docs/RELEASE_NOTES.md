# Release notes

## Model 1.1.0, priority-0 (P0) educational build, preview only

Status: published as a preview at https://jclekkas.github.io/mortgage-prepayment-lab/ from
the `p0-educational-build` branch; pull request #1 is not merged. No production release exists.

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
  change columns, sensitivity details) has a tag next to the numerical difference, which
  always stays visible. Shape shows direction (▲ up, ▼ down, ► small or no change).
- Color shows the effect for the servicer: green "better", red "worse", grey "not
  assessed" where the model does not establish an effect, yellow "small change" or "no
  change". A word and a screen-reader sentence carry the same meaning, so color is never
  the only cue.
- As the PRD requires, prepayment speed is not judged by direction: faster prepayment is
  "worse" for the servicer because payoffs end fee income. In the loan owner view it is
  "not assessed": faster repayment changes cash-flow timing and can affect investment value,
  and this simulator does not determine whether that is favorable for the owner. Balance and
  weighted-average life are always "not assessed".
- "No change" means the difference is zero within a tolerance of 1e-9 relative to the
  baseline (`ZERO_TOLERANCE`). "Small change" means a nonzero difference below a display
  threshold: 0.05 percentage points for speeds, half a basis point, 0.05 years, and under $1
  or 0.5% of the baseline for dollars. These are display thresholds chosen for readability,
  not economic materiality thresholds (`src/domain/trend.ts`, tested in
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
- Previous-run results are labeled on every screen that shows them: overview and lab
  headline cards, explanation, charts, cohort table caption, decision room columns, and the
  sensitivity and grid panels (which state they use the last run's assumptions).
- The brief, the scenario export and the monthly ledger download are paused while any
  scenario has edits that have not been run, so an exported or printed result is always paired with the assumptions that
  produced it.


### Trust and first-learner fixes (model 1.1.0, after `b2016bd`)

Each defect below was reproduced on `b2016bd` before it was fixed, and each has a regression test.

- **Lesson sequence.** Following "Next" from lesson 1 opened lesson 2 with lesson 1's state:
  the answers were disabled, lesson 1's table showed, and the "Calculated answer" was empty.
  Each lesson now starts fresh. A calculation still running when you leave a lesson can no
  longer publish into the next one. The reasoning shows after every answer, right or wrong.
  Test: `tests/e2e/lessons.spec.ts`.
- **Direction versus judgment.** Prepayment speed, prepaid principal, balance and average life now get
  neutral words (faster, slower, higher, lower, longer, shorter). Only servicer cash-flow and value measures are judged,
  and the label names the horizon and the perspective. A move from a larger loss to a smaller loss is labeled "smaller loss",
  never a profit. Counterexample: Mixed book, fee 0, cost $100, rates down 100 bps. Servicing value goes
  from -$595,769 to -$506,698, which is now labeled an improvement that is still a loss; previously the
  faster prepayment was called "worse". Test: `tests/unit/trend.test.ts`.
- **One perspective.** A single Servicer / Loan owner switch drives the headline cards, arrows,
  charts, lab details, loan-group table and explanations. The loan-owner view shows principal and
  interest timing and says plainly that it does not calculate investment value, yield or profit.
  Test: `tests/e2e/perspective.spec.ts`.
- **Honest quick experiments.** The rate and recapture shortcuts no longer silently switch a fixed
  CPR or PSA scenario to the behavioral model; they are disabled with the reason. Each shortcut says which
  scenario it changes and lists that scenario's existing changes. Test: `tests/e2e/experiments.spec.ts`.
- **Calculation versioning.** A written version policy covers major, minor and patch changes. The model moves to `mpl-engine-1.1.0` for
  the F1 threshold correction, which first shipped under the 1.0.0 label. Exports record the model version and
  the source build. Older files and saved work are kept, marked, and recalculated only
  through an explicit path showing before and after. Unknown versions are refused without changing anything. An
  unreadable saved workspace is kept as a downloadable backup, never erased. Tests:
  `tests/unit/versioning.test.ts`, `tests/e2e/versioning.spec.ts`, with real files exported from the old builds.
- **Engine-dependent synthetic data (found during this work).** `Math.pow` differs in its last digits between
  JavaScript engines, so the preset fingerprints differed between Chromium and Safari. The generator
  (`synthetic-gen-1.1.0`) now rounds payments and balances to whole cents. Test:
  `tests/unit/generator-determinism.test.ts`.
- **Guided first experiment.** A skippable guided experiment teaches before it tests: who the borrower, loan owner and
  servicer are, why an early payoff ends the fee, the starting assumptions, a prediction, then
  the rate cut with baseline, scenario and difference. Its explanation is arithmetic: fees given up
  versus costs saved, in today's dollars. Test: `tests/e2e/guided.spec.ts`.
- **Expected values explained first.** Lesson 1 now explains what an expected (probability-weighted) amount is before showing one loan's expected payoff dollars, and says plainly that no borrower actually pays it. The monthly ledger carries the same note above its fractional loan counts. Test: `tests/e2e/lessons.spec.ts`.
- **Teaching wording corrections (after `fdf028f`).** Ownership is described by role: principal repayment belongs to the loan owner, the servicer administers the loan and earns servicing fees, and one organization may perform both roles. Refinancing text says the lower rate raises the modeled likelihood of refinancing and does not judge whether refinancing is worthwhile for a borrower. Tables and cards that show figures next to their differences say the differences use unrounded values. This wording has not been checked against an external source.
- **Explanations audited.** Causes are stated only when the calculation supports them. When several
  assumptions change, the text reports the combined effect. Glossary entries that describe model
  assumptions say so. "Validation lab" is renamed "Forecast check", and the page says what a synthetic
  back-test cannot show. A plain trust note ("arithmetic checked, assumptions illustrative,
  real-world accuracy not established") appears in the footer, the guided result and the brief.
- **Evidence.** `docs/EVIDENCE.md` maps every calculation rule to a source or a labeled assumption, an independent
  expected value and a test. No external source could be retrieved from the build environment,
  so none is marked verified. New invariants: lifetime principal reconciles; exports refuse
  results paired with edited assumptions; "rates down, value down" holds only when margins are positive.
  Domain-review questions are in `docs/DOMAIN_REVIEW_QUESTIONS.md`.

### Dark "terminal" redesign (v4 design handoff)

Display only: no calculation, model version, wording of disclosures or "Previous run" safeguard changed.

- **Theme and type.** Dark tokens from the handoff; Source Serif 4 self-hosted from npm (`@fontsource/source-serif-4`, OFL), not loaded from Google Fonts, so the strict content security policy is unchanged and no visitor request goes to a third party. Tabular figures throughout. No text under 12px, including chart axis labels at every chart width (checked by `tests/e2e/terminal.spec.ts`).
- **Color meaning.** Green and red appear only on better/worse tags and scenario-tab change text; sparklines are accent blue against a dashed grey baseline (the handoff's sparkline note conflicted with its own acceptance rule; the stricter rule was followed). Warnings and errors are amber.
- **Shell.** Left rail (Analyze, Check, Learn) that becomes a menu below 1100px; a context header with the page title, perspective and "Opens by default" controls, scenario tabs that carry each scenario's value and change, one status line and the only Run button.
- **Keyboard shortcuts** (R, 1 to 4, P, O L G D F, ?, Esc). They pause in fields and ignore Ctrl, Cmd and Alt, and they can be turned off in the Keys dialog (WCAG 2.1.4).
- **Overview.** Hero with a short template headline (direction and size only); the full explanation headline is the first "Why" point. Cards with sparklines; the unpaid balance moved to the hero line. Quick experiments as cells with "Undo the last change and re-run".
- **Scenario lab.** Resizable assumptions panel (drag or arrow keys, remembered on this device), collapsible groups with "N changed", results in tabs. The full-ledger table is replaced by **Month by month** (named for plain reading rather than the handoff's "Order book", which in trading means bids and offers); "Value to date" is the running total in today's dollars.
- **Other pages.** Decision room in tabs; glossary search; lesson cards with progress; guided-experiment stepper; start page in two columns (the seed stays out of the beginner flow).

### Known limitations

- Synthetic data and uncalibrated, illustrative behavioral coefficients. Not a forecast, a FICO model or a validated valuation.
- A mortgage-domain reviewer has not yet approved the conventions; do not describe the tool as financially validated.
- The source documents for the conventions (SIFMA Standard Formulas, OCC handbook) were not retrievable from the build environment; see `docs/EVIDENCE.md`.
- Illustrative servicing NPV excludes float, ancillary fees, advances, default costs, taxes, hedges and terminal value.
- No delinquency, curtailments, modifications, adjustable-rate mortgages (ARMs), interest-only or balloon loans; these are later-phase, priority-1 (P1) scope.
- Burnout history starts at zero for every loan.
- Recapture excludes replacement servicing value; the uplift is an assumption.
- Loan-owner view excludes credit losses, funding costs, guaranty fees, remittance delays and security structure; no price or yield.
- Accessibility: automated axe scan and keyboard tests pass; a manual screen-reader review with NonVisual Desktop Access (NVDA) and VoiceOver has not been done.
- Performance was measured in a cloud container, not on a documented reference laptop.
- Usability success measures (five-user pilot) are not yet run.
- Saved work lives only in this browser's built-in database (IndexedDB); clearing site data removes it. Use Export to keep it.
