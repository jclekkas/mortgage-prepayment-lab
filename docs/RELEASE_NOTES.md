# Release notes

## 1.0.0 (P0 educational build), unreleased

Status: built and verified locally; **not deployed**. No production URL exists yet.

### Verification evidence

Recorded per tested commit in the pull request description and in the review handoff.
Gates: `npm run typecheck`, `npm run lint`, `npm run test:numerics` (35),
`npm test` (latest count in the PR), reference fixtures regenerate byte-identical, `npm run build`,
`npm run test:e2e` (latest count in the PR, Chromium, against a fresh production build).

### Fixed after the first review build (`6e723fc`)

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

- **R1 Mixed-population comparisons.** A cancelled recalculation reverted to "done" while
  keeping an old-population result, which could then be compared, charted, printed and
  exported under the new filter. Results now record their valuation month. A single check
  (`comparability.ts`) requires the current portfolio, valuation month and normalized
  filter on every comparison surface. Retained results are labeled and excluded, and
  `buildScenarioFile` refuses them. Regression tests: `tests/unit/comparability.test.ts`
  (store reducer: filter change, then cancel or failure) and an end-to-end test on a
  10,000-loan book. Two planted versions of the bug both fail the unit test.
- **R2 Unknown payoff causes.** Fixed CPR and PSA set every payoff as turnover. They are now
  unclassified voluntary payoffs, with the refinance and turnover split "not applicable"
  in the ledger, CSV and types. Total prepayment dollars are unchanged: the regenerated
  reference fixtures differ only in the cause fields. Recapture stays disabled in those
  modes.
- **R3 Partial reproduction check.** Import verification compared only scenario ID, run key
  and NPV. It now compares input hash, run key and every summary metric, including nulls,
  within a documented tolerance, and names each metric that differs. A saved `prepaid12`
  altered with NPV and run key intact is now detected (unit and end-to-end tests).
- A race found while testing R1: progress arriving just after Cancel could leave the grid
  panel showing "Calculating" indefinitely. Late progress from a cancelled grid is now
  ignored.

### Known limitations

- Synthetic data and uncalibrated, illustrative behavioral coefficients. Not a forecast, a FICO model or a validated valuation.
- A mortgage-domain reviewer has not yet approved the conventions; do not describe the tool as financially validated.
- Illustrative servicing NPV excludes float, ancillary fees, advances, default costs, taxes, hedges and terminal value.
- No delinquency, curtailments, modifications, ARMs, interest-only or balloon loans (P1).
- Burnout history starts at zero for every loan.
- Recapture excludes replacement servicing value; the uplift is an assumption.
- Loan-owner view excludes credit losses, funding costs, guaranty fees, remittance delays and security structure; no price or yield.
- Accessibility: automated axe scan and keyboard tests pass; a manual screen-reader review (NVDA, VoiceOver) has not been done.
- Performance was measured in a cloud container, not on a documented reference laptop.
- Usability success measures (five-user pilot) are not yet run.
- Saved work lives in this browser's IndexedDB only; clearing site data removes it. Use Export to keep it.
