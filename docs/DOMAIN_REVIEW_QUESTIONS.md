# Questions for a qualified mortgage-domain reviewer

Mortgage Prepayment Lab, model `mpl-engine-1.1.0`. Educational simulator; every loan is synthetic.

**Engineering tests are not professional model validation.** The arithmetic has been checked against hand-derived examples and invariants (`docs/EVIDENCE.md`). Nobody with mortgage-modeling credentials has reviewed the conventions. The source documents could not be retrieved from the build environment, so the convention checks are incomplete.

This review asks whether the conventions are right and whether the teaching claims are fair. It does not ask whether the coefficients are calibrated: they are labeled teaching values.

## Reference result: Mixed book, offer rate cut by 1 percentage point

The book has 1,000 synthetic loans and $331.72M unpaid balance. The assumptions are a 0.25% servicing fee, $100 a year cost per loan, a 10% discount rate, a 6.25% offer rate and 50 bps friction.

| Measure | Baseline | Rate cut (-100 bps) | Difference |
|---|---|---|---|
| Next-month prepayment speed (CPR) | 7.76% | 11.18% | +3.41 pts, faster |
| 12-month prepayment speed (CPR) | 8.89% | 12.54% | +3.65 pts, faster |
| 12-month prepaid principal | $29.21M | $41.20M | +$11.99M |
| 12-month net servicing cash flow | $693.9K | $681.6K | -$12.3K |
| Servicing value today (NPV) | $3,524,196 | $3,053,758 | -$470,439 (-13.3%) |
| of which: fees, in today's dollars | $4,119,965 | $3,560,456 | -$559,510 |
| of which: costs, in today's dollars | $595,769 | $506,698 | -$89,071 |
| Principal weighted-average life | 8.95 years | 7.30 years | -1.66 years |

Exception the tool teaches: set the fee to 0 and keep the rest. The same rate cut then moves servicing value from -$595,769 to -$506,698. Value improves, but it is still a loss.

## Questions

**Q1. PSA month numbering.** The tool assumes a loan with k payments made is age k + 1 in the first projected month, so a brand-new loan prepays at 0.2% CPR in month 1 and reaches 6% at month 30. Does that match the SIFMA *Standard Formulas* convention, or should the first projected month be age k?

**Q2. Expected-value pool.** Each loan carries a survival weight. Surviving borrowers keep the original payment, and loan counts can be fractional. Is that an acceptable teaching simplification for a servicing portfolio? Would you expect learners to misread fractional loan counts?

**Q3. Fee base and timing.**
- The fee accrues on the beginning balance, the payoff month earns a full month's fee and cost, and all cash arrives at month end, with no float, compensating interest or remittance delay.
- Which of these simplifications would most change a learner's intuition about servicing value?
- Is a flat cost per loan reasonable for teaching?

**Q4. Refinance and turnover.**
- The refinance probability is an S-curve in the incentive (existing rate minus offer rate, less 50 bps friction), scaled by seasoning, propensity and burnout.
- Turnover is flat at about 3.5% a year (0.3% a month) and does not depend on rates.
- Are these shapes defensible as teaching assumptions?
- Is "turnover does not depend on rates" misleading enough, given the rate lock-in effect, that it needs a stronger warning?

**Q5. Burnout.** Burnout counts prior months with a positive incentive and starts at zero for every loan at the as-of date. Is ignoring the history before the as-of date acceptable for a teaching tool, or does it overstate the response to a rate cut for seasoned in-the-money loans?

**Q6. Servicing value.**
- The tool shows "illustrative servicing NPV" at a flat 10% discount rate, with no terminal value, float, ancillary income, advances or default costs.
- Is it fair to tell a learner that this is "not market value", and is the 10% rate a sensible default?
- Should the tool show a range of discount rates by default instead of one?

**Q7. Rates down, value down.** The tool says a rate cut lowers servicing value on this book because the fees given up exceed the costs saved. It also says the opposite holds when loans cost more to service than they earn. Is that framing correct and complete for a beginner? Are there other common exceptions to mention, such as recapture or the value of float?

**Q8. Recapture.** Recapture is a separate one-time contribution per recaptured refinance. It never keeps the original loan alive and excludes the new loan's servicing value. Is excluding the replacement servicing value too conservative for teaching? Would including it mislead?

**Q9. Loan-owner view.**
- The owner view shows principal and interest timing only, with no price, yield, funding cost or credit loss.
- Is the statement "this simulator does not determine whether faster payoff is favorable for the owner" sufficient?
- Should the view say more about premium versus discount positions?

**Q10. Wording.** Please read the guided experiment (start page, then "Start with a 3-minute guided experiment") and the six lessons. Flag any sentence that a mortgage professional would call wrong or misleading, even if it is simplified on purpose.

## What the reviewer is not asked to do

- Calibrate coefficients.
- Validate against real loan data.
- Certify the tool.

Any approval should be recorded as "conventions reviewed for teaching use", not "model validated".
