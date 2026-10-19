# Mortgage Prepayment and Servicing Portfolio Lab

Product requirements and coding agent handoff

Version 1.0 | October 18, 2026 | Product owner: Chris Lekkas

Build an interactive educational application that helps a mortgage general manager, director, or analyst understand how borrower prepayments change the performance of a servicing portfolio. The user changes assumptions, predicts a result, runs the simulation, and sees the cash flows and business consequences explained in plain English.

The primary experience is managing mortgage servicing rights (MSRs). A separate loan-investor lens explains principal return and reinvestment risk. The application must never imply that the servicer owns the underlying loan principal merely because it services the loan.

Proposed repository: jclekkas/mortgage-prepayment-lab. The account spelling follows prior project context; verify the authenticated GitHub owner and destination before creating or pushing a repository. The repository name is a proposal, not an existing or verified repository. This document specifies a production-deployable educational application; it does not represent FICO approval, a proprietary FICO model, or a validated investment valuation system.

## 1. The product promise

Within ten minutes, a user can answer: "If mortgage rates fall, which part of my servicing book is most exposed, how much could its cash flow change under these assumptions, and what management decisions deserve further analysis?"

Managing prepayment speeds means measuring, forecasting, and managing exposure to borrower payoff behavior. The tool distinguishes external conditions from management decisions. Users cannot prevent borrowers from refinancing by moving a slider.

The core learning loop is: select a portfolio, predict what will happen, change one assumption, run a scenario, compare with a frozen baseline, inspect the explanation, and record a decision. Every result must be traceable to inputs and model version.

### Success measures

- In a pilot with at least five representative users, four can explain CPR versus SMM and identify who receives prepaid principal after completing the introduction.
- Four can correctly diagnose the more refinance-sensitive cohort without assistance.
- Every displayed financial metric has a definition, units, period, and inspectable calculation.
- Identical portfolio, assumptions, seed, and model version produce identical results.
- No hard-coded simulated outcome is presented as a calculated result.

## 2. Users and decisions

| Role | Question | Default experience | Required output |
| --- | --- | --- | --- |
| General manager | What is at risk, and which trade-off matters most? | Five headline measures, scenario comparisons, decision narrative | One-page scenario brief |
| Director | Which segments explain the change, and what can we influence? | Cohort comparison, cost and recapture controls, sensitivity heatmap | Segment-level action hypotheses |
| Analyst | Do the balances reconcile, and is the model credible? | Monthly ledger, model settings, formula drawer, validation lab | Reproducible JSON and cash-flow CSV |

Role selection changes information density, not formulas or permissions. A GM may open any analyst explanation. Avoid portraying FICO as necessarily owning the simulated servicing assets; the user can be learning the economics of lender and servicer customers.

## 3. Release scope

### P0 production educational release

Deliver synthetic portfolios; fixed CPR, PSA, and transparent behavioral modes; monthly amortization and full-payoff simulation; baseline plus three comparisons; segment drill-down; servicing economics; a separate loan-investor cash-flow view; a recapture contribution overlay; six guided exercises; synthetic actual-versus-forecast analysis; local save/import/export; accessible desktop and tablet layouts; automated numerical and end-to-end verification; reproducible deployment.

Model scope: performing, fixed-rate, fully amortizing, first-lien residential loans with monthly payments. No negative amortization, adjustable rates, interest-only periods, balloon loans, modifications, scheduled-payment delinquency, or partial curtailments in P0. Explicitly reject unsupported imported synthetic records.

### P1 realism expansion

After P0 passes numerical and usability gates: licensed historical-data adapters, calibration and out-of-time backtests, partial curtailments, delinquency/cure/liquidation states, servicing advances, escrow and remittance float, a separate replacement-loan book, and authenticated shared scenarios. Each extension requires its own accounting convention and tests before exposure in the interface.

### Outside this release

No production customer loan uploads, borrower recommendations, credit decisions, trading, hedge execution, live accounting marks, GSE eligibility determination, proprietary credit-score replication, or claims of fair value. No LLM dependency in the numerical engine. An approved corporate deployment and validated financial model are separate milestones from shipping educational software.

## 4. Screen and interaction specification

### A. Start and portfolio overview

Open with "What would you like to understand?" and three choices: protect servicing cash flow, compare investment cash flows, or learn prepayment math. Default to servicing. Select a role and one of three synthetic portfolios: low-rate seasoned book, recently originated higher-rate book, or mixed book.

The persistent header shows portfolio name, synthetic-data badge, as-of date, model mode/version, and baseline/scenario selector. Do not describe synthetic assumptions as today's market rates.

Display five primary cards: current unpaid principal balance (UPB), next-month annualized prepayment speed (CPR), projected 12-month prepaid principal, projected 12-month net servicing cash flow, and illustrative lifetime servicing NPV. A secondary card shows loan principal weighted-average life. It must not be labeled servicing duration.

Each card includes its period, baseline difference in dollars or percentage points as appropriate, and a "Why did this change?" button. A larger CPR is neither automatically good nor bad: explain the user's economic lens before assigning evaluative color.

### B. Scenario lab

Use three columns on wide screens: assumptions, charts, and explanation. On narrower screens, stack assumptions above results with a sticky Run button. Keep a frozen baseline visible beside the active scenario.

Group controls under "Market conditions," "Borrower behavior," and "Business decisions." A rate shock belongs in market conditions; recapture spending belongs in business decisions. A CPR override is a modeling assumption.

| Control | Range and default | Behavior |
| --- | --- | --- |
| Model mode | Behavioral default; fixed CPR; PSA | Only the selected mode drives prepayment |
| Mortgage offer rate | 1-15%; 6.25% synthetic default | Enter level or shock; supports immediate, 12-month ramp, or custom monthly path |
| Rate shock | -300 to +300 basis points; 0 | Applied to mortgage offer path; reject resulting rates outside supported bounds |
| Fixed annual CPR | 0-60%; 8% | Only enabled in fixed mode |
| PSA multiplier | 0-500%; 100% | Applied to each loan's age, not portfolio average age |
| Turnover multiplier | 0-2; 1 | Changes background full-payoff hazard |
| Refinance response multiplier | 0-2; 1 | Changes refinance hazard, not rate eligibility |
| Refinance friction | 0-200 bps; 50 | Reduces effective refinance incentive; a teaching assumption |
| Burnout | On by default | Uses accumulated prior favorable-rate exposure |
| Annual servicing fee | 0-100 bps; 25 | Overrides contractual fee for a hypothetical acquisition; labels contract change assumption |
| Annual cost per active loan | $0-$1,000; $100 | Expenses scale with expected surviving loan count |
| Annual effective discount rate | 0-30%; 10% | Independent from mortgage-rate path unless explicitly linked in a later model |
| Refinance recapture share | 0-100%; 20% | Applies only to refinance full payoffs in behavioral mode |
| Net contribution per recaptured loan | -$10,000 to $10,000; $1,500 | Origination contribution only; excludes replacement MSR value |
| Incremental campaign cost | $0-$1 million; $0 | Time-zero spend deducted once in overlay |
| Chart horizon | 12, 36, 60 months | Changes chart window; valuation still runs to remaining maturity |

Every slider has a keyboard-accessible numerical input, units, reset, explanation, and source classification. Disable irrelevant controls with a reason. In fixed CPR and PSA modes, rate changes must not secretly alter prepayment. Disable recapture there because the payoff cause split is undefined.

Support Run, Undo last edit, Reset to baseline, Duplicate scenario, Rename, Freeze as baseline, and Compare. Unsaved changes are visible. Results remain labeled "Previous run" while inputs are dirty. Cancel superseded calculations and prevent a slower old run from overwriting a newer one.

### C. Results and explanations

Charts: monthly CPR; remaining UPB; cumulative principal returned split between scheduled and prepaid; net servicing cash flow; and lifetime NPV comparison. Include table alternatives and synchronized month selection. Default chart labels spell out the meaning before showing the acronym.

Clicking a month opens a cash-flow ledger. Clicking a segment filters every chart and updates the population badge. Clearing filters restores the portfolio. Comparison scenarios always use the same selected population unless explicitly marked otherwise.

The explanation panel uses deterministic templates populated from calculated deltas: "Under your lower-rate assumption, more higher-coupon loans refinance. Their old servicing fees stop. The projected servicing NPV changes by $X. The separate recapture contribution changes by $Y." If results contradict this usual pattern, explain the actual driver rather than forcing the template.

Use one-factor-at-a-time sensitivities labeled non-additive. Do not present their sum as an exact attribution. Any waterfall must use a documented sequential replacement order, include interaction effects in the relevant steps, and reconcile to the total.

### D. Cohort explorer

Filter by coupon band, loan age, remaining term, balance band, state, and synthetic refinance propensity. Show beginning UPB, expected payoff rate, scheduled principal, prepaid principal, net servicing cash flow, and servicing NPV by cohort. Display both dollars and normalized measures so large segments are not automatically called riskier.

Do not include a FICO score effect in P0. A later licensed score feature requires documented model version, purpose, calibration, and validation; a credit score is not itself a prepayment probability.

### E. Decision room

Compare up to four scenarios, including baseline, using the same valuation date. Let users write "What I think changed," "Evidence," and "What I would investigate next." Export a printable one-page brief with assumptions, results, limitations, model version, and reproducibility hash.

Include a two-dimensional sensitivity grid: mortgage offer rate versus refinance response in behavioral mode; fixed CPR versus discount rate in fixed mode. Selecting a cell creates an inspectable scenario. Use an accessible tabular equivalent.

### F. Validation lab

P0 provides a clearly labeled synthetic 24-month history and saved forecast origin. Users compare frozen forecasts with subsequent synthetic outcomes, inspect monthly CPR error in percentage points, prepaid-dollar error, and cohort bias. The outcome generator uses a different parameter set from the forecast, preventing a trivial perfect fit.

P1 real-data validation uses chronological training/validation/test windows, loan-level grouping, as-of feature construction, and explicit handling of observation end/censoring. Separate voluntary payoff, default/liquidation, repurchase, and maturity; do not classify every zero balance as refinance. If payoff reason is unknown, retain "unknown voluntary payoff." Compare against fixed CPR and PSA baselines and report regime/segment performance; do not promise that the more complex model wins.

## 5. Calculation contract

All formulas below are implementation requirements and educational conventions, not calibrated market forecasts. Store rates as annual decimals internally, basis-point inputs divided by 10,000, and cash in dollars. Never round intermediate values for display. Sum loan results before computing portfolio ratios.

### Loan balance and scheduled payment

For loan i, let B be surviving loan balance, r its annual note rate divided by 12, and n remaining monthly payments. Monthly principal-and-interest payment A = B x r / (1 - (1+r)^-n). For r = 0, A = B/n. Fix the contractual payment at initialization. P0 full payoffs do not recast surviving borrowers' payments.

For each month, conditional on survival: interest = B x r; scheduled principal S = min(B, max(0, A - interest)); remaining balance R = B - S. At final maturity force S = B, R = 0, and voluntary payoff dollars = 0. Advance loan age once per projected month; first projection month uses reported age + 1. End the contract at maturity.

Maintain a survival weight w per loan, initially 1. With monthly full-payoff probability q: expected scheduled principal = w x S; expected voluntary prepaid principal = w x R x q; ending expected balance = w x R x (1-q); next survival weight = w x (1-q). The surviving contractual balance becomes R. This avoids wrongly shrinking a surviving borrower's contractual payment with the expected pool balance. Fractional expected loan counts are intentional.

Portfolio beginning balance equals scheduled principal plus voluntary principal plus ending balance in every month, within floating-point tolerance. Borrower interest and investor principal are separate from servicer revenue.

### CPR and SMM

SMM is the monthly fraction of eligible principal prepaid: SMM = prepaid principal / (beginning UPB - scheduled principal). CPR = 1 - (1 - SMM)^12. Conversely SMM = 1 - (1 - CPR)^(1/12). CPR is an annualized conditional speed, not the actual percentage of today's book that must prepay over the next calendar year.

For a portfolio, aggregate the dollar numerator and denominator first; do not average individual CPRs. For a trailing k-month measure, use 1 - [product(1-SMM_t)]^(12/k), explicitly labeled geometric annualization. A zero denominator produces "Not applicable," not 0% or NaN. Twelve-month prepaid dollars must come from the monthly ledger, not CPR x initial UPB.

### PSA mode

For loan age a in projected payment months, 100% PSA annual CPR = min(0.002 x a, 0.06). Multiply this annual CPR by PSA_percent/100, then convert to SMM. Thus 100% PSA is 0.2% CPR in month 1 and 6% from month 30 onward. PSA is an age-based benchmark, not a rate-responsive forecast. [S2]

### Behavioral mode

Use a transparent competing full-payoff hazard model. These proposed coefficients are deliberately illustrative and versioned in configuration; none is a FICO parameter or an empirically calibrated estimate.

- Monthly turnover hazard h_move = 0.003 x turnoverMultiplier x seasonality(month). Default seasonality is 1 in all months; a disclosed seasonal preset may be added with arithmetic mean 1.
- Effective incentive x = (noteRate - offerRate) x 10,000 - frictionBps.
- Seasoning factor s = min(projectedAgeMonths/30, 1).
- Refinance hazard h_refi = 0.04 x responseMultiplier x propensity x s x burnoutFactor x sigmoid(x/50), with sigmoid(z)=1/(1+exp(-z)). Synthetic propensity ranges 0.5-1.5.
- With burnout enabled, burnoutFactor = exp(-0.02 x E), where E is prior months of positive effective incentive. Initialize E=0 in synthetic fixtures and disclose this assumption. Increment E after computing the current month when x>0. With burnout off, factor=1.
- Total monthly full-payoff probability q = 1 - exp(-h_move-h_refi). Cause probabilities q_move and q_refi split q in proportion to their hazards; both are zero when total hazard is zero. They must sum exactly to q.

This specification teaches nonlinear refinance incentives, age effects, turnover, and path dependence. It omits application qualification, home equity, credit changes, cash-out demand, and lender pricing detail. Rate-path comparisons must recalculate the full history of each scenario. Do not infer burnout solely from age or make a claim that rate cuts always increase enterprise value.

### Servicing cash flow and illustrative value

P0 uses beginning-of-month accrual and end-of-month cash receipt. Monthly gross servicing revenue = expected beginning UPB x annual servicing fee / 12. Monthly operating cost = expected beginning active loan count x annual cost per active loan / 12. Net servicing cash flow = gross fee - operating cost. Negative results are allowed.

Lifetime servicing NPV = sum over remaining contractual months of net servicing cash flow_t / (1+d)^(t/12), where d is annual effective discount rate. No terminal multiple or hidden residual value. P0 excludes float, ancillary fees, advances, default costs, taxes, and hedges. Label the number "Illustrative servicing NPV," never market value or accounting fair value. Present a conspicuous explanation of excluded cash flows next to the methodology drawer. Discounting projected servicing income and testing prepayment/cost assumptions follows the broad economic framing described by OCC. [S1]

Servicing value in bps = NPV / current UPB x 10,000; undefined when current UPB is zero. Do not clamp negative NPV to zero. An impaired or negative-margin book can violate the usual teaching heuristic that slower prepayments improve value.

### Loan investor lens

Show principal and note-interest cash flows separately from servicing fees. For P0, label this a simplified loan-owner view before credit losses, funding costs, guaranty fees, remittance delays, and any security structure; do not call it a fully priced agency MBS.

Principal weighted-average life = sum[(t/12) x (scheduledPrincipal_t + prepaidPrincipal_t)] / initial UPB. Use the full remaining maturity, not the chart window. Faster payoff accelerates principal return; it is not an equal-dollar loss to the owner. A P1 price/yield module must specify purchase price, net coupon, settlement, and discounting before making premium/discount return claims.

### Recapture economics

Expected recaptured loans_t = sum(w_i x q_refi_i) x recaptureShare, excluding maturity months. Recapture contribution PV = sum(recapturedLoans_t x netContributionPerLoan / (1+d)^(t/12)) - campaignCost. Use the same discount rate as a disclosed P0 simplification.

Display original-book servicing NPV and recapture contribution PV separately. Their sum is an illustrative combined contribution measure, not MSR fair value. Recapture does not keep the original loan alive. No replacement MSR value is included in P0, and contribution per loan must exclude it. Do not subtract campaign costs twice or imply assumed recapture uplift is causally proven.

## 6. Synthetic data and saved scenario contract

Ship a deterministic generator with seed 42 and 1,000 loans by default. Build three equally sized configurable cohorts: low coupon/seasoned, middle coupon/mid-life, and high coupon/recent. Use original 360-month amortization, generate original balances and ages, then derive current UPB and remaining term from the contractual schedule. Avoid independently generating mutually inconsistent balances and payments.

Required loan fields: synthetic loan ID, as-of month, original balance, current balance, annual note rate, original term, age months, remaining term, contractual payment, annual servicing-fee bps, annual cost, state, and synthetic refinance propensity. Required portfolio metadata: schema version, generator version, seed, synthetic flag, creation date, and hash. No names, addresses, SSNs, or real account identifiers.

Scenario input contains schemaVersion, modelVersion, portfolioHash, baselineId, scenarioId, name, valuationMonth, mode, ratePath, behavioralParameters, servicingParameters, recaptureParameters, seed, and chartHorizon. Canonical key ordering and number serialization determine the input hash. Run output includes inputHash, monthly portfolio ledger, cohort results, per-loan drill-down on demand, summary metrics, warnings, and calculation duration.

Saved files include complete assumptions and model version. Import validates schema, finite numbers, field bounds, and supported model versions. Reject future unsupported schemas with a useful message. Do not silently migrate or reinterpret assumptions. Local save uses IndexedDB with a visible "Saved on this device" label; provide export for portability and a clear-data action.

## 7. Six guided learning exercises

| Exercise | User action | Expected learning and correctness check |
| --- | --- | --- |
| Follow one dollar | Inspect a one-loan monthly ledger | Scheduled and prepaid principal go to the loan owner; servicing receives its fee |
| Read the speedometer | Set 6% CPR and inspect SMM | SMM is approximately 0.5143%, not 0.5% exactly |
| Rates fall | Apply -100 bps in behavioral mode | Refinance incentive rises; identify the cohort with the largest calculated change |
| Same speed, different cost | Compare otherwise equal books with different loan balances | Per-loan costs create different economics per dollar of UPB |
| Keep the customer | Raise recapture share | Original loan still pays off; incremental origination contribution is separate |
| Challenge the forecast | Compare a frozen forecast with synthetic subsequent observations | Identify bias and propose a hypothesis without claiming proof |

Each exercise asks for a prediction before revealing results, offers one concise explanation afterward, and stores completion locally. A wrong answer explains the underlying cash flow instead of merely showing a red mark. Include a glossary with UPB, CPR, SMM, PSA, MSR, servicing strip, refinance incentive, burnout, NPV, weighted-average life, and recapture.

## 8. Engineering and repository requirements

Use TypeScript and React with Vite for a static, client-side P0 application; use a Web Worker for calculations, a typed schema validator for imports, and an accessible chart library with table fallbacks. These are proposed architecture choices; the coding agent must verify current compatible stable versions in official documentation when implementing and commit a lockfile. Do not introduce a database, API key, server, or paid data dependency for the educational release.

Suggested source layout: src/domain for pure numerical functions; src/worker for orchestration; src/features/portfolio, scenarios, results, learn, and validation for UI; src/data for synthetic generation; src/storage for local persistence; tests/fixtures for independently verified cases; docs for this PRD, methodology, data dictionary, and deployment runbook.

The UI consumes typed engine outputs; components never calculate a second version of financial metrics. Narrative templates consume the same output. A single engine runs in tests and in the worker. Use structured cloning or transferable buffers where appropriate; cancel stale jobs via run IDs.

Required package scripts: dev, build, preview, typecheck, lint, test, test:e2e, and test:numerics. CI runs install from lockfile, static checks, numerical tests, end-to-end tests, and production build. Dependencies and licenses must be recorded. Support configurable deployment base path; avoid broken refreshes on deep links through hash routing or an explicit host fallback.

P0 has no sensitive data by design. Default to no external analytics; imported files remain local. Limit imports to 10 MB and 10,000 synthetic loans, reject unexpected fields where practical, validate synthetic provenance, and sanitize all text rendered or exported. Neutralize spreadsheet-formula injection in CSV text fields. Do not fetch arbitrary URLs found inside imported scenarios.

An internally deployed FICO version requires the organization's approved host, authentication, security review, and data policy before business data is enabled. A role selector is never authorization. Keep a public synthetic demonstration and any future authenticated corporate deployment as distinct deployment configurations.

## 9. Performance and accessibility

For a documented modern laptop reference environment, target first useful display within 2.5 seconds on a typical broadband connection, and 1,000 loans x 360 months within 1 second at p95 after initial load. For 10,000 loans, target under 5 seconds with progress and cancellation. Measure these targets; do not assert them without a benchmark. Keep the main thread responsive and cache results by canonical input hash.

Support 1280-pixel desktop and 768-pixel tablet layouts; at 390 pixels, all controls and tables remain accessible without page-wide horizontal overflow. Target WCAG 2.2 AA. Use keyboard navigation, visible focus, labeled controls, sufficient contrast, reduced-motion support, chart summaries, table equivalents, and no red/green-only meaning. Preserve focus after recalculation; announce completion without reading the whole table aloud.

Provide explicit states for empty portfolio, invalid import, zero balances, no filtered results, calculation cancellation, storage failure, incompatible scenario, and engine error. Preserve the last good run after failure and identify it as such. Never replace missing information with a plausible fabricated value.

## 10. Acceptance and numerical verification

Ship independent fixtures with calculation provenance, not snapshots copied from the implementation. A mortgage-domain reviewer must approve conventions before describing the tool as financially validated.

| ID | Required verification |
| --- | --- |
| N01 | CPR=0 gives SMM=0; CPR=1 gives SMM=1 in engine boundary tests; conversions round-trip within 1e-12 |
| N02 | At 6% CPR, SMM~0.0051430128; with beginning UPB $100,000,000 and scheduled principal $100,000, prepayment~$513,786.98 within $1 |
| N03 | At 100% PSA, months 1/30/60 give annual CPR 0.002/0.06/0.06; at 200% PSA they double |
| N04 | Every loan-month and portfolio-month conserves principal to max($0.01, beginning UPB x 1e-10); end balances never negative |
| N05 | At 0% CPR, all principal is scheduled and total principal returned equals initial UPB; maturity is not counted as voluntary payoff |
| N06 | Zero-rate amortization and zero discount rate work without division errors; a one-month loan closes completely |
| N07 | On $100 million beginning UPB, 25 annual bps produces $20,833.3333 monthly gross fee; 1,000 active loans at $100 annual cost produces $8,333.3333 monthly cost |
| N08 | Aggregated SMM uses summed eligible balances; heterogeneous-cohort CPR is not an arithmetic average |
| N09 | In behavioral mode with other inputs fixed, a lower offer rate cannot reduce first-month refinance hazard; hazards remain valid at bounds |
| N10 | Refinance and turnover probabilities sum to total payoff probability; expected survival counts and balances remain consistent |
| N11 | Fixed CPR and PSA ignore mortgage-rate changes; disabled controls do not affect the input hash or result |
| N12 | With all future net servicing cash flows positive, higher discount rate lowers NPV; negative-margin fixtures remain negative rather than clamped |
| N13 | Changing chart horizon leaves lifetime NPV and weighted-average life unchanged |
| N14 | Increasing recapture share does not change original-book runoff; at 0% recapture contribution is minus campaign cost only |
| N15 | Zero-denominator metrics show not applicable; exports contain no NaN, Infinity, or unexplained blank values |
| N16 | Seeded fixture reruns and saved scenario imports reproduce the same outputs within documented numeric tolerance |

End-to-end acceptance: load preset, freeze baseline, shock rates, run, inspect a month, filter a cohort, compare scenarios, finish an exercise, export/import JSON, and reproduce results. Also test worker cancellation, stale-run races, malformed imports, unavailable storage, keyboard-only use, and production deep-link refresh.

Business acceptance: a reviewer can trace every KPI to its ledger; explanations match calculated direction and units; source labels distinguish synthetic assumptions from conventions; and original MSR value is never conflated with investor principal or recapture contribution.

## 11. Delivery sequence and release gates

1. Establish domain conventions and fixtures. Deliver pure engine, data generator, methodology, and tests N01-N16 before styling the dashboard. Gate: independently reconciled one-loan and multi-cohort cases.
2. Build the core learning loop. Deliver overview, scenario controls, worker integration, charts, month ledger, baseline compare, and formula drawers. Gate: complete usable rate-shock walkthrough with no placeholder calculations.
3. Add cohort analysis, recapture overlay, decision brief, six lessons, validation lab, and persistence. Gate: exports reproduce results and economic lenses remain separate.
4. Harden and deploy preview. Deliver accessibility review, measured performance, CI, threat-focused input tests, runbook, and rollback instructions. Gate: preview smoke test and documented known limitations.
5. Release educational production build. Merge through the repository's review policy and deploy the tested commit. Gate: numerical review, product-owner acceptance, all required checks green, and correct destination confirmed. Preserve prior artifact for rollback.

Production hosting may use a static host such as Vercel or GitHub Pages. Select according to repository conventions and account access during implementation; do not assume a connected provider. A failed provider integration must not be reported as a successful deployment. Record commit SHA, model version, build date, deployed URL, smoke-test evidence, and rollback command in the release notes.

## 12. Copy-ready coding agent brief

Build the Mortgage Prepayment and Servicing Portfolio Lab defined in this PRD. First inspect repository instructions and verify the GitHub owner and target repository. Use an isolated branch and preserve unrelated work. If no target repository is established, prepare the implementation locally and identify the unresolved destination before any push.

Implement the numerical engine and independent fixtures first, then the complete P0 user experience. Keep calculations deterministic and separate from React. The default data must be synthetic, reproducible, and fully functional without credentials. Ship all P0 features; label future features as future scope rather than fake working controls.

Honor the calculation contract exactly, especially loan survival weighting, scheduled-versus-prepaid principal, annual servicing-fee units, PSA age, independent discounting, full-maturity valuation, and separation of old-book MSR cash flow from recapture. Never call an illustrative result market fair value. Never invent FICO model coefficients or current market data.

Provide source code, lockfile, tests, README, methodology, data dictionary, this PRD under docs, CI, deployment configuration, and release runbook. Run numerical, build, accessibility, and end-to-end gates; fix material failures before requesting review. Open a reviewable pull request when repository access is available. Report actual checks and deployment status with evidence; do not claim a production release from a local build alone.

## 13. Source notes and model boundaries

Sources checked October 18, 2026. The interface design, synthetic defaults, behavioral coefficients, acceptance criteria, and architecture are proposed product specifications. They are not claims that the sources supply a calibrated model.

- S1: OCC, Mortgage Banking, Comptroller's Handbook, servicing-asset and valuation sections, especially printed pages 67-72. Supports separating servicing rights from the loan and evaluating projected servicing cash flows with explicit prepayment, cost, and discount assumptions. The handbook is contextual guidance, not certification of this simulator: https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/mortgage-banking/pub-ch-mortgage-banking.pdf
- S2: Oracle Financial Services, PSA Method. Documents the 0.2-percentage-point monthly CPR ramp to 6% at month 30 and scaling by PSA multiplier: https://docs.oracle.com/en/industries/financial-services/ofs-analytical-applications/analytical-applications-infrastructure/812/almug/psa-method.html
- S3: Fannie Mae Single-Family Loan Performance Data. Candidate for a later licensed historical-data adapter. Access and use are subject to terms, including restrictions on redistribution and external commercial use; availability does not authorize bundling records into this application. Review the current data dictionary and permissions before ingestion: https://capitalmarkets.fanniemae.com/credit-risk-transfer/fannie-mae-single-family-loan-performance-data

The first release offers realistic accounting relationships and transparent behavioral scenarios. Empirical forecast accuracy, production investment suitability, and formal MSR valuation require additional data, calibration, independent validation, and approved operating controls.
