/**
 * Plain-English definitions for every abbreviation and technical term the app shows.
 * `name` is the spelled-out term; `abbr` is shown after it in parentheses on first use.
 */
export interface TermDef {
  name: string;
  abbr?: string;
  plain: string;
}

export const TERMS = {
  upb: { name: 'Unpaid principal balance', abbr: 'UPB', plain: 'What borrowers still owe on their loans. Servicing fees are charged as a percentage of it.' },
  cpr: { name: 'Conditional prepayment rate', abbr: 'CPR', plain: 'How fast loans are paying off early, stated as a yearly rate. At 8%, about 8% of the remaining balance would pay off early over a year if this month’s pace continued.' },
  smm: { name: 'Single monthly mortality', abbr: 'SMM', plain: 'The share of the remaining mortgage balance (after that month’s scheduled payment) that is paid off early during the month. It is the monthly version of the conditional prepayment rate.' },
  prepaid: { name: 'Prepaid principal', plain: 'Principal repaid ahead of schedule. In this model every prepayment is a loan paid off in full, through a refinance or a home sale; partial extra payments are not modeled. Principal repayment belongs to the loan owner.' },
  psa: { name: 'Public Securities Association benchmark', abbr: 'PSA', plain: 'A standard speed curve: new loans pay off slowly and speed up until month 30. 100% PSA is the standard curve; 200% PSA is twice as fast. It ignores interest rates.' },
  npv: { name: 'Net present value', abbr: 'NPV', plain: 'All future cash flows converted into today’s dollars and added up. Money received later counts for less, depending on the discount rate.' },
  pv: { name: 'Present value', abbr: 'PV', plain: 'One future cash flow converted into today’s dollars using the discount rate.' },
  wal: { name: 'Weighted-average life', abbr: 'WAL', plain: 'The average number of years until the loan owner gets each dollar of principal back. Faster payoffs shorten it.' },
  msr: { name: 'Mortgage servicing right', abbr: 'MSR', plain: 'The right to collect a loan’s payments and keep a fee for doing that work. It is separate from owning the loan.' },
  mbs: { name: 'Mortgage-backed security', abbr: 'MBS', plain: 'A bond whose payments come from a pool of mortgages.' },
  arm: { name: 'Adjustable-rate mortgage', abbr: 'ARM', plain: 'A loan whose interest rate resets over time. Not modeled here: every loan has a fixed rate.' },
  occ: { name: 'Office of the Comptroller of the Currency', abbr: 'OCC', plain: 'A United States federal bank regulator. Its handbook is cited as background, not as a certification of this tool.' },
  bp: { name: 'Basis points', plain: 'One hundredth of a percentage point. 100 basis points equal 1 percentage point, so a move from 6.00% to 6.50% is 50 basis points.' },
  ppt: { name: 'Percentage points', plain: 'The plain difference between two percentages. Going from 7% to 9% is up 2 percentage points, which is not the same as up 2%.' },
  incentive: { name: 'Refinance incentive', plain: 'The rate gap that drives refinancing in this model: the borrower’s existing mortgage rate (note rate) minus the rate available today (offer rate), less a friction allowance for cost and hassle. It drives the modeled likelihood of refinancing; it does not say whether refinancing is worthwhile for a given borrower.' },
  friction: { name: 'Refinance friction', plain: 'An assumed allowance for the cost and hassle of refinancing, subtracted from the rate gap before the modeled incentive turns positive. It is subtracted from the incentive.' },
  turnover: { name: 'Turnover', plain: 'Loans paid off because the borrower sells the home or moves. In this model it does not depend on interest rates; in reality, high rates can discourage moving.' },
  burnout: { name: 'Burnout', plain: 'A teaching assumption in this model: borrowers who have passed up chances to refinance become less likely to respond later.' },
  discount: { name: 'Discount rate', plain: 'The yearly return used to convert future dollars into today’s dollars. A higher rate makes distant cash flows worth less today.' },
  recapture: { name: 'Recapture', plain: 'When a borrower who refinances takes the new loan from the same company. The old loan still pays off and its fees still stop.' },
  netServicing: { name: 'Net servicing cash flow', plain: 'Servicing fees collected minus the cost of servicing the loans still active.' },
  servicingFee: { name: 'Servicing fee', plain: 'The yearly slice of the interest rate the servicer keeps for collecting payments, quoted in basis points of the balance.' },
  creditScore: { name: 'Credit score', plain: 'A number summarizing a borrower’s credit history at one moment. Different score versions and sources use different scales, so scores are compared only within the same version and source. The scores in this app are synthetic, not FICO Scores.' },
  scoreRefresh: { name: 'Score refresh', plain: 'Getting newer credit scores for borrowers who already have loans. It gives newer information; it does not change anyone’s credit or earn money by itself.' },
  scoreCoverage: { name: 'Usable coverage', plain: 'The share of the selected loans, by count and by balance, that have a usable score on the analysis date. Missing, unscorable, late-arriving and other-version records are not usable.' },
  scoreAge: { name: 'Score age', plain: 'How long before the analysis date the score being used was observed. Older scores describe the borrower as they were then.' },
  scoreVersion: { name: 'Score version', plain: 'The scoring model and version that produced a score. A change of version is not a change in the borrower: the scale itself changed, so the two numbers are not subtracted.' },
  analysisDate: { name: 'Analysis date', plain: 'The date the analysis is as of. Only information available on or before it is used, so later data cannot leak into an earlier decision.' },
  incremental: { name: 'Incremental outcome', plain: 'An outcome that happened because of an action and would not have happened without it. Measuring it needs a comparison group that did not get the action.' },
  breakEven: { name: 'Break-even', plain: 'The number of incremental outcomes needed for their contribution to equal the total cost. Below it, the decision loses money on these assumptions.' },
} satisfies Record<string, TermDef>;

export type TermId = keyof typeof TERMS;

/** "Conditional prepayment rate (CPR)", or the name alone when there is no abbreviation. */
export function fullName(id: TermId): string {
  const t: TermDef = TERMS[id];
  return t.abbr ? `${t.name} (${t.abbr})` : t.name;
}
