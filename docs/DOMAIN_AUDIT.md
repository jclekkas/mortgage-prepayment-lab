# Mortgage-domain audit and validation gates

October 20, 2026. Audited release: `e185339076a9f05e4f27fe54d7d51b40ac823c7d`, model `mpl-engine-1.1.0`. Proposed corrections: `mpl-engine-1.2.0`. The audit branch was subsequently rebased onto `c2a43c82ca265d8df4b548e83cfd2a6bcf661454`, the concurrent usability commit; its mortgage-domain files are unchanged from the audited release. The usability changes are preserved, not included as independently validated work in this domain audit.

## Decision

**Suitable for education with its existing disclosures; not ready for investment decisions, MSR fair value, loan pricing or hedging.** Several calculation conventions can now be substantiated from primary references. That closes a source-access gap, not the empirical or professional-validation gap.

This is an independent source-and-code audit performed by an AI assistant, not a signed opinion from a qualified mortgage model validator. The existing Python implementation shares the original specification and authorship; agreement with it is engineering corroboration, not independent economic evidence. The new tests include published external benchmarks and counterexamples independent of that specification.

The audit inspected `engine.ts`, `math.ts`, `config.ts`, `scenario.ts`, `validation.ts`, the generator, import checks, versioning, `credit.ts`, the calculation/acceptance reviews, evidence register, methodology, and numerical/unit tests. It accepts the reported successful release CI and hosted smoke tests as prior engineering evidence. The superseded iPhone timeouts were not investigated. Credit refresh remains completed synthetic functionality.

## 1. Confirmed defects and corrections

### D1 — multi-month aggregate CPR convention mismatch (medium; corrected)

Release 1.1.0 follows its PRD: it compounds monthly portfolio SMMs. That is internally consistent arithmetic, but is not generally the standard period CPR for loans with different amortization paths. The original specification, and its unqualified use of “12-month CPR,” were the problem. The one-month SMM/CPR calculations are correct.

The corrected metric uses the same starting population at the same endpoint:

```
period CPR = 1 - (projected ending UPB / no-prepayment ending UPB)^(12 / months)
```

The denominator amortizes the starting loans without any voluntary payoffs during the measurement window. It is not the final month's eligible balance. See S0, B.3. Portfolio and cohort 12-month measures, and the synthetic Forecast check's 24-month cohort measures, now use this definition. A fully contractually matured population has no endpoint denominator and reports `null`; the window is not silently shortened. Dollar prepayments remain separately available.

Reproduced before editing: two zero-rate loans paying $1,000 monthly, one with $120,000/120 months remaining and one with $12,000/12 months remaining, under 100 PSA with respective ages 0 and 12. The old result is **1.40963565%**; the endpoint-equivalent result is **1.30241480%**. Test D06 also isolates the mismatch without any maturities in the window. This is not a change to borrower behavior.

Measured impact on the actual release presets (percent CPR; basis-point differences use unrounded values):

| Portfolio / offer shock | 1.1.0 CPR12 | 1.2.0 CPR12 | Change, bps |
|---|---:|---:|---:|
| Mixed / 0 | 8.894856% | 8.910742% | +1.5887 |
| Mixed / -100 bps | 12.542995% | 12.563023% | +2.0028 |
| Seasoned low-rate / 0 | 5.457685% | 5.466993% | +0.9308 |
| Seasoned low-rate / -100 bps | 7.582666% | 7.597834% | +1.5168 |
| Recent high-rate / 0 | 13.676783% | 13.688344% | +1.1562 |
| Recent high-rate / -100 bps | 17.879608% | 17.891393% | +1.1784 |

All six preset fingerprints and monthly ledgers compared exactly equal before/after. Servicing NPV and WAL are unchanged: for example, Mixed baseline remains $3,524,196.15 and 8.952847 years. Updating this measurement does **not** improve the forecast. Revised Python reference fixtures change only three mixed-loan `cpr12` values.

### D2 — unstable payment calculation near zero interest (low ordinary-market exposure; corrected)

`levelPayment` used a subtraction that loses precision when `1 + monthlyRate` is almost 1. At annual rate `1e-14`, $300,000 over 360 months returned **$781.874935** instead of approximately **$833.333333**; at `1e-16` it returned infinity. Those positive rates are allowed by the import schema. The infinity also undermined the payment-consistency comparison in `loanProblems`.

The algebraically identical denominator `-expm1(-n * log1p(r))` restores the zero-rate limit. Tests use an independent small-rate expansion and an invalid $1/month payment. This is an edge-case numerical correction, not evidence of miscalculated ordinary mortgage payments. Standard preset fingerprints remain unchanged, so no generator-version change is needed.

### D3 — inaccurate source-verification disclosure (corrected)

The visible Methodology page still said sources were checked October 18, although the evidence register said retrieval failed. The documentation correction had not reached the UI. The page now identifies the primary sources actually read October 20 and distinguishes source checks from professional validation. Oracle is not treated as verified from its uninformative retrieved page.

### Previously fixed defect

The refinance-threshold floating-point issue in `CALCULATION_REVIEW.md` is already corrected at the audited head. Its economic impact and tests are retained. It was not repaired again.

## 2. Convention findings

| Topic | Finding for the supported loan type | Remaining boundary |
|---|---|---|
| CPR / SMM | `1-(1-CPR)^(1/12)` and its inverse, applied after scheduled principal, agree with S0 B.2. | Voluntary-only output is not interchangeable with an empirical factor-based speed containing other removal types. |
| PSA | `ageMonths + t` is correct for this post-payment as-of definition; CPR scales before conversion to SMM. S0 B.2.c. | Same-month issuance/pool-age conventions require explicit mapping in a future pool adapter. A pool's WALA is not automatically this loan field. |
| Amortization / survival | Level payment, interest on opening principal, preserved survivor payment and survival weighting agree with S0 B.1. D03 matches the published first cash flow. | Cent-rounded synthetic inputs, monthly timing, no curtailment/recast/modification; import tolerances do not prove a real loan is performing. |
| Multi-month CPR | D1 corrects the aggregation specification using S0 B.3. | A period-equivalent speed does not reproduce every intervening cash flow; it is not an annual fraction of initial UPB prepaid. |
| WAL | Full-life principal-weighted timing is correct for this no-delay loan view. D03 reconciles to S0 G.1.c's published example after adding its 14/360-year delay. | Not settlement-adjusted security WAL, Macaulay duration, effective duration or servicing duration. |
| Discounting | `(1+d)^(-t/12)` correctly implements the declared effective annual rate and month-end receipts. | The 10% default is uncalibrated; it is not a nominal monthly-compounded rate, bond-equivalent yield, discount curve or OAS. |
| Servicing | Fee arithmetic is consistent with interest-period UPB under S1; fee dollars, costs, principal and interest remain separated. S2 supports the discounted-net-income framework. | Full payoff-month fee/cost, flat cost, no actual collection/remittance calendar; omitted cash flows prevent fair-value claims. |

No additional error was established in ordinary amortization, PSA indexing, lifetime principal conservation, WAL, annual-effective discounting or the recapture arithmetic. This finding is scoped to the reviewed conventions and fixtures, not a universal correctness guarantee.

## 3. Simplifications and unvalidated hypotheses

These are not silently “fixed” by selecting different coefficients. Each needs an explicit purpose and evidence.

| Current assumption | Consequence | Evidence or decision needed |
|---|---|---|
| Refi hazard scale 0.04; incentive width 50 bps; fixed friction; propensity 0.5–1.5 | At zero effective incentive and full seasoning, refi hazard is 0.02/month; with turnover 0.003, first-month annualized total CPR is `1-exp(-12*0.023)` ≈ 24.1%. “Friction” is a sigmoid midpoint, not an economic break-even cutoff. | Calibrate response to borrower-specific offered rates, closing costs, balance, loan term and qualification; challenge the implied speeds. |
| Turnover hazard 0.003 independent of rates and age | No mortgage-rate lock-in or turnover seasoning. A rate increase cannot suppress home-sale payoff through this channel. | A turnover model supported by outcomes and housing variables. Freddie Mac's lock-in research (S4) makes the omission consequential; it does not calibrate this model. |
| Burnout `exp(-0.02 E)`, E starts at zero and only increases | After 60 prior positive-incentive months the factor is about 0.301, irrespective of incentive magnitude, intervening rate changes or actual historical exposures. | Pre-as-of rate/loan history, lag structure and empirical comparison with alternatives. |
| Constant within-month competing hazards and proportional cause split | Coherent probability algebra, but inferred refinance/home-sale attribution is not observed truth. | Cause labels or a model explicitly estimating only total voluntary payoff. Do not train cause models from invented splits. |
| No delinquency, cure, default, liquidation, modification or partial curtailment | Principal is returned at par by contractual maturity; expense and revenue disruption are absent. | Event-state cash flows and timing appropriate to the asset. Delinquency forecasting is a separate target, not slow prepayment. |
| Fee on opening UPB; full month's cost even when prepaid; constant nominal cost | Mid-month payoff economics, compensating interest, inflation and delinquency-driven servicing expense are absent. | Servicing-contract review and actual operational cash-flow evidence. |
| Flat deterministic rates and discounting; no curve/spread/volatility model | Scenario NPV is not a market price or hedge sensitivity. Holding discount rate fixed isolates runoff but is not a complete rate-shock valuation. | Purpose-specific valuation method, market inputs, rate-volatility and basis-risk treatment where needed. OAS alone would not validate borrower behavior. |
| Recapture share and one-time contribution are assumed; replacement MSR excluded | No demonstrated incremental retention or enterprise value. Existing servicing runoff correctly continues to end. | Causal campaign evidence, full net costs and replacement-loan economics in a separate valuation perimeter. |
| Synthetic outcomes generated from the same functional form | Error scores illustrate evaluation mechanics; structural misspecification can remain invisible. | Real out-of-time and out-of-sample outcomes. The actual-rate rerun is a hindsight diagnostic, not an ex-ante forecast. |

## 4. Prioritized validation-gap register

P0 means required to establish the next defensible validation stage. P1 means required before material investment use, according to the chosen use case. These are proposed project gates, not externally prescribed tolerances.

| ID / priority | What can close it | Owner and concrete acceptance evidence | Status |
|---|---|---|---|
| V01 / P0 | Calculation/source audit | Engineering: D01–D08, published benchmarks, migration and documented numerical impact. | Implemented in this review branch; requires merge/release review. |
| V02 / P0 | Qualified domain review | Mortgage cash-flow/MSR specialist: signed review of as-of semantics, payoff timing, fee rights, asset scope and residual Q2–Q11. Resolve material findings. | Open; source retrieval is now complete for the cited checks. |
| V03 / P0 | Intended-use specification | Product + investment/risk owner: choose collateral runoff forecasting, MSR valuation or MBS pricing; define target population, horizons, materiality and prohibited uses. | Open. “Investment grade” is not one universal model certificate. |
| V04 / P0 | Historical loan-month panel | Data + model owner: permitted raw-data version, reproducible adapter, provenance, monthly balance/event reconciliation, missing-data and censoring report. | No real performance data in repository. |
| V05 / P0 | Event-label design | Domain + data reviewer: distinguish voluntary payoff, maturity, curtailment, delinquency/cure, default/liquidation and repurchase/removal; retain unknown cause. | Open. Particularly material to refinance/turnover and recapture. |
| V06 / P0 | Empirical calibration and holdout | Quant + independent validator: freeze split and metrics before fitting; compare simple baselines with calibrated alternatives on untouched vintages and rate regimes. | Coefficients remain illustrative. |
| V07 / P1 | Cash-flow completeness | Servicing/accounting or securities specialist: reconcile approved model to actual servicing receipts/expenses or security distribution statements; bound material omissions. | Fee/cost teaching perimeter only. |
| V08 / P1 | Market valuation and independent benchmark | Valuation specialist: matched-input third-party comparison, observed-market calibration where available, stress and sensitivity explanations. | No external economic benchmark or market calibration. |
| V09 / P1 | Uncertainty and robustness | Quant: parameter uncertainty, rate-path/structural scenarios, cohort instability and tail tests; translate errors into value/decision impacts. | Deterministic point estimates only. |
| V10 / P1 | Governance and monitored use | Accountable owner + reviewer: model inventory, versioned data/code/parameters, approved uses and limits, change review, monitoring triggers, rollback and escalation. | Engineering versioning exists; institutional process does not. |
| V11 / separate score-aware stage | Historical repeated score data and ablation | Data/credit specialist + validator: temporally valid linked snapshots; locked base vs refreshed-score models; same populations and non-score inputs. | Interface only; no score-aware forecast. |
| V12 / separate benefit stage | Incremental outcome evaluation | Business owner + experiment reviewer: credible treatment/control design, realized net contribution and all costs over a stated horizon. | No demonstrated economic benefit from refresh. |

### Practical sequence and pass criteria

1. **Freeze a narrow research target.** Start with total voluntary payoff over 1/3/6/12 months for performing conventional fixed-rate loans. Keep MSR valuation and cause-specific recapture as separate workstreams. Agree maximum acceptable aggregate/cohort forecast bias and dollar/value error before seeing holdout results; do not choose an arbitrary “good” AUC.
2. **Build and reconcile a real panel.** Use a permitted Fannie Mae or comparable source with explicit coverage limits. Preserve raw releases, identifiers and corrections. Audit masks, missing months, acquisitions (left truncation), end-of-observation censoring and data revisions. Do not force real loans through the synthetic-only browser importer.
3. **Resolve labels before fitting.** The September 10, 2026 Fannie glossary's code 01 includes prepaid **or matured**; it is not a refinance label. Codes for repurchases and liquidation differ. Reconcile maturity and payoff timing, and retain ambiguous cases. The public glossary lists scheduled-principal fields that are not available for every dataset; do not assume the public file supplies the current engine's full contractual schedule. See S3a/S3b.
4. **Build benchmarks and estimate behavior.** Compare constant CPR, age-based PSA, a transparent statistical hazard model and more flexible alternatives if justified. Model censoring and competing exits explicitly; keep loan identities from leaking across training and holdout. Fit on training only, tune on validation, then lock all transformations and coefficients.
5. **Test across time and segments.** Use rolling forecast origins and untouched later vintages, including rising/falling-rate and disruption periods. Report calibration by horizon, log loss/Brier scores where appropriate, CPR bias/MAE, prepaid-dollar error and uncertainty. Stratify by incentive, age, balance, geography, servicer/channel, credit and missingness. Use resampling that respects borrower and time dependence. Report exclusions and denominators.
6. **Translate prediction risk into economics.** First reconcile actual cash flows; then assess how prepayment/cost/discount uncertainty changes MSR value and decisions. Add float, ancillary income, advances/funding, credit-related expense, compensating interest and contractual timing when material. For MBS pricing, implement pass-through deductions, settlement/accrual/delay conventions, prices/yields and relevant security structure; the current owner-interest view is insufficient.
7. **Obtain qualified challenge and approve bounded use.** An expert independent of development reviews evidence and benchmarks, documents unresolved limitations and recommends a specific permitted use. Run a monitored shadow pilot before material reliance, with pre-agreed recalibration/stop triggers. This report does not supply that sign-off. S5 is current risk-based supervisory context, not a claim that this personal project is regulated or certified.

## 5. Credit refresh: readiness for future forecasting

The completed implementation correctly separates information changes, forecast revisions and a user-assumption break-even calculation. `SCORE_AWARE_MODEL` remains `null`; the engine does not read score snapshots. No forecast-accuracy or servicing-value improvement is claimed or introduced by this audit.

The immutable snapshots, availability dates, version/source comparison exclusions, denominators, fingerprints and paired-input interface are useful foundations. They do not make a production data/model contract. Before enabling a score-aware adapter:

- Validate timestamp ordering (`observed <= available <= forecast origin`), enforce point-in-time joins for every historical forecast, and sort/select by dated observations rather than relying on the fixture's snapshot order. The current helpers assume controlled synthetic inputs.
- Define borrower/co-borrower aggregation, source/model-version compatibility, score age, stale-score fallback and missing/unscorable populations. Measure selection bias: borrowers refreshed or able to refinance may differ from those without scores. Do not equate a band with default or payoff probability.
- Add score history/version/fingerprints to the **new model's** cache/run identity and exported provenance when scores affect results. Their exclusion is correct for the current score-blind model. Freeze non-credit inputs and model version in paired forecasts; specify score paths or held-fixed information over multi-month horizons.
- Obtain permitted repeated score observations linked to loan-month outcomes. The public data source is not evidence that such histories exist for this project. The current Fannie glossary moves origination scores to new fields starting March 2026 (field 111 onward); an updated score *model at origination* is not a later borrower-credit refresh. Verify availability and data rights before promising a study.
- Compare no-score, origination-score, latest-score and score-change/age variants on the same locked holdouts. Measure incremental calibration and dollar error with uncertainty, stable coverage and segment results. Avoid attributing differences caused by changing training samples or other features to refresh alone.
- Keep predictive usefulness separate from economic value. A refreshed score may revise a forecast without changing any borrower outcome. Prove action benefit with a credible intervention comparison, net of refresh, implementation and campaign costs; avoid counting recapture contribution twice. Authorized real-data deployment also needs suitable access, retention and compliance review.

## 6. Primary-source register

Documents were retrieved and read October 20, 2026. Section/page identifiers below refer to the printed document, not PDF viewer page numbering. Links are primary sources; quoted passages are not reproduced.

| ID | Source / version | Use and limit |
|---|---|---|
| S0 | [SIFMA, Chapter SF](https://www.sifma.org/wp-content/uploads/2017/08/chsf.pdf), February 1, 1999; B.1–3 (SF-4–13), E/G (SF-44–51) | Cash-flow/prepayment conventions and external numerical examples; not behavioral calibration or certification. |
| S1 | [Fannie Mae Servicing Guide A2-3-01](https://servicing-guide.fanniemae.com/svc/a2-3-01/servicer-compensation), topic dated December 14, 2016; [A2-3-02](https://servicing-guide.fanniemae.com/svc/a2-3-02/servicing-fees-portfolio-and-mbs-mortgage-loans), July 13, 2022 | Fees use the interest installment's UPB and period; guaranty/other deductions depend on the contract. Does not verify the lab's payoff-month timing or costs. |
| S2 | [OCC Comptroller's Handbook, Mortgage Banking](https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/mortgage-banking/pub-ch-mortgage-banking.pdf), printed pp. 67–72 and 189–190 | Discounted net servicing income requires supportable prepayment, cost and risk/market assumptions; validation includes external comparisons and actual outcomes. Its older model-risk citation is superseded by S5. |
| S3 | [Fannie Mae Single-Family Loan Performance Data](https://capitalmarkets.fanniemae.com/credit-risk-transfer/fannie-mae-single-family-loan-performance-data) | Candidate monthly research source, partial population and use restrictions; no dataset downloaded or licensed by this audit. |
| S3a | [Fannie Mae glossary/file layout](https://capitalmarkets.fanniemae.com/resources/file/credit-risk/pdf/crt-file-layout-and-glossary.pdf), September 10, 2026, fields 12, 16–18, 24–25, 44–48, 111 onward | Masked balances, age/maturity definitions, event and origination-score fields; not a guarantee of refresh history. |
| S3b | [Fannie Mae dataset FAQs](https://capitalmarkets.fanniemae.com/resources/file/credit-risk/pdf/sf-loan-performance-dataset-faqs.pdf), March 10, 2026, questions 51–57 | Removal date and UPB interpretation; distinguish zero balance from disposition. |
| S4 | [Freddie Mac, Mortgage Rate Lock-In and the Housing Market](https://www.freddiemac.com/research/insight/mortgage-rate-lock-in), 2023 research | Economic support for challenging rate-independent turnover; no coefficient transplanted into this engine. |
| S5 | [Federal Reserve SR 26-2](https://www.federalreserve.gov/supervisionreg/srletters/sr2602.htm), April 17, 2026, and [interagency attachment](https://www.federalreserve.gov/supervisionreg/srletters/SR2602a1.pdf), sections IV–VI | Replaces SR 11-7; emphasizes purpose, materiality, effective challenge, outcomes and monitoring. It is supervisory guidance, not a universal legal standard or product certification. |

## 7. Verification and release treatment

`tests/numerics/domain-audit.test.ts` contains D01–D08. D01 and D02 failed on the audited release before corrections; D03 (external cash flow/WAL) already passed. The added import, endpoint/maturity, heterogeneous-no-maturity and PSA boundary checks cover the changed conventions. The versioning test imports an actual pre-correction 1.1.0 export (produced by `buildScenarioFile`, not manually relabeled), retains its original saved results and verifies that only CPR12 differs on recalculation.

The proposal increments the model minor version to 1.2.0; scenario schema, credit fixture and generator versions remain unchanged. Compatible 1.0.0 and 1.1.0 files follow the existing explicit recalculation workflow, preserving their saved numbers and assumptions. Published production and PR #1 remain separate from this review branch. No automatic deployment is requested.

Verification results for the proposed changes are recorded in the pull request and `RELEASE_NOTES.md`. Passing them does not close V02–V12.
