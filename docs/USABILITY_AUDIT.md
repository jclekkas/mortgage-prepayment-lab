# Navigation, editing and sharing audit — 20 October 2026

Starting source and live build: e185339. This is a usability and implementation review, not mortgage model validation or a claim to have exercised every possible state.

## Demonstrated defects and fixes

- Live Scenario lab: clearing Rate shock leaves an empty field, Run enabled, and the Reset control disabled when the last valid value was zero. Invalid text existed only inside the field; Run used the previous numeric value. Registered field errors now block manual Run and its keyboard shortcut. Reset works even if the stored value is already the default. Escape restores the last valid value. Valid typing preserves intermediate decimal text rather than formatting each keystroke. Scenario changes remount input drafts. Reset to baseline also clears unfinished field drafts.
- Custom monthly paths now block Run until applied or restored. No empty path becomes zero.
- Credit break-even inputs had local validation but still displayed results for prior values. Results are now hidden while fields are invalid, with an explanation and a reset-to-zero action.
- No Home destination existed; the brand was plain text. Added a real Home page, always-visible brand/Home link on phone and desktop, a resume action, and a three-step route through learning, experimenting and sharing. Home preserves the workspace and omits the workspace controls so first-time visitors see three clear choices. The root URL now opens Home; existing #/start links still work.
- Setup warned that starting again always replaced work, but the reducer preserves the same portfolio. Corrected the warning to describe the actual behavior and added an explicit Resume link.
- Sharing was buried in a Decision room tab. Added Share in the header and navigation, a selectable/copyable tool URL with clipboard-failure feedback, and instructions for the existing brief and scenario-file workflows. Files and brief has a direct route (#/decision/files). No financial or personal state goes in the URL. A link is explicitly not a shared scenario.
- Moved the credit refresh action above the detailed coverage tables so the primary action is easier to find. Clarified that 200% PSA uses twice the benchmark rate in each month, rather than wording that could imply repeated doubling.
- Added compact instructions and next-step links to the main workspaces, plus Go to Run / Go to results controls in the lab. Credit guidance distinguishes scenario Run from score refresh. Added social title and description metadata.

## Scope inspected

Live normal interactions: setup with Mixed book; overview; Scenario lab; clearing and replacing Rate shock; running minus 100 basis points; credit score workspace; Decision room. Read the implementation of routing, header/navigation, store run guards, numeric controls, custom paths, credit calculator, start page, guided experiment, lab, export/import gates and deployment configuration. Existing suites cover lessons, glossary, methodology, cohorts, filters, validation, brief, numerical rules, reproduction and accessibility; these are not substitutes for manual inspection of all their states.

## Verification

- Type checking, lint and production build pass locally.
- 174 existing unit/calculation tests pass; separate numerical suite 69/69. Reference fixtures regenerate unchanged.
- New browser regressions: blank/invalid/reset/Escape/decimal typing, Home preserves results, sharing deep link, phone Home/Share and overflow, credit invalid-state results and reset. Home/Share added to the existing accessibility page scan.
- Local Playwright browser installation is blocked by the environment. Browser execution and deployment status must be recorded from CI and hosted verification, not inferred from the local unit suite.
- Connected browser could inspect the public site but could not reach this container's local server.

Browser gate initially caught and prompted fixes for introduced regressions: the Home accessible name did not match visible text, and disabling Run during calculation lost keyboard focus. Run now retains focus and ignores repeat activation while busy. The simplified Home page also exposed a too-small setup link; Home action links and the expandable guide now have 44-pixel targets. Workspace keyboard shortcuts pause on Home. Existing stale-result and setup-warning assertions were updated to the intentionally corrected behavior.

A legacy-workspace browser test intermittently failed in WebKit. Its captured trace showed the URL at #/decision while the DOM still showed Start: useLocation could miss a hash change between initial render and listener attachment. The router now reconciles the current hash after subscribing. A rapid-navigation regression covers this. The legacy fixture setup also now uses a blank same-origin page so it cannot race app reads or autosave; assertions for preserved notes, assumptions and the migration notice remain unchanged.

## Limits and follow-up

No formulas, model units, machine-readable export keys or import schemas were changed. Browser/source checks do not establish financial accuracy. First-time learner interviews, manual screen-reader testing, real mobile-device touch testing, full social preview rendering across messaging providers, and formal mortgage-domain review remain outstanding. A web link opens the tool with the recipient's own local workspace, not a cloud-synchronized analysis. Files remain the supported way to reproduce an analysis.

Unfinished invalid numeric text is not saved. Leaving the lab returns to the last valid input; the page guide explicitly explains this. Valid assumptions continue using the existing per-device persistence. No borrower data integration, analytics, tracking, email sending, or automatic social publishing was added.
