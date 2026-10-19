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
  smm: { name: 'Single monthly mortality', abbr: 'SMM', plain: 'The share of the remaining balance paid off early in one month. It is the monthly version of the conditional prepayment rate.' },
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
  incentive: { name: 'Refinance incentive', plain: 'How much a borrower could save by refinancing: their note rate minus the available offer rate, less the friction needed to make it worth the effort.' },
  friction: { name: 'Refinance friction', plain: 'The rate saving a borrower needs before refinancing is worth the cost and hassle. It is subtracted from the incentive.' },
  turnover: { name: 'Turnover', plain: 'Loans paid off because the borrower sells the home or moves. It happens whatever rates do.' },
  burnout: { name: 'Burnout', plain: 'Borrowers who have ignored chances to refinance become less likely to respond later.' },
  discount: { name: 'Discount rate', plain: 'The yearly return used to convert future dollars into today’s dollars. A higher rate makes distant cash flows worth less today.' },
  recapture: { name: 'Recapture', plain: 'When a borrower who refinances takes the new loan from the same company. The old loan still pays off and its fees still stop.' },
  netServicing: { name: 'Net servicing cash flow', plain: 'Servicing fees collected minus the cost of servicing the loans still active.' },
  servicingFee: { name: 'Servicing fee', plain: 'The yearly slice of the interest rate the servicer keeps for collecting payments, quoted in basis points of the balance.' },
} satisfies Record<string, TermDef>;

export type TermId = keyof typeof TERMS;

/** "Conditional prepayment rate (CPR)", or the name alone when there is no abbreviation. */
export function fullName(id: TermId): string {
  const t: TermDef = TERMS[id];
  return t.abbr ? `${t.name} (${t.abbr})` : t.name;
}
