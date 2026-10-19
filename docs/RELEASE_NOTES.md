# Release notes

## 1.0.0 (P0 educational build), unreleased

Status: built and verified locally; **not deployed**. No production URL exists yet.

### Verification evidence (October 19, 2026)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 warnings |
| `npm run test:numerics` | 35 tests pass: N01-N16 and 6 reference-model reconciliations |
| `npm test` | 49 tests pass (numerics, files/import/export, validation lab, benchmark) |
| `npm run build` | pass |
| `npm run test:e2e` | 15 tests pass in Chromium against the production build, including axe WCAG 2.0/2.1/2.2 A and AA on 11 pages |
| Mutation check | a planted burnout off-by-one fails the reference suite |

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
