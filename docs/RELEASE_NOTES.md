# Release notes

## 1.0.0 (P0 educational build), unreleased

Status: built and verified locally; **not deployed**. No production URL exists yet.

### Verification evidence

Recorded per tested commit in the pull request description and in the review handoff.
Gates: `npm run typecheck`, `npm run lint`, `npm run test:numerics` (35),
`npm test` (68), reference fixtures regenerate byte-identical, `npm run build`,
`npm run test:e2e` (17, Chromium, against a fresh production build).

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
