const TERMS: [string, string][] = [
  ['Unpaid principal balance (UPB)', 'The principal borrowers still owe. Servicing fees are a percentage of UPB, so UPB is the base that earns fee income.'],
  ['Conditional prepayment rate (CPR)', 'Annualized speed: the share of the balance eligible to prepay that would prepay over a year if this month’s rate continued. CPR = 1 − (1 − SMM)^12, where SMM is the single monthly mortality defined below. Conditional means it applies to whatever balance survives, so it is not the share of today’s book gone in 12 months.'],
  ['Single monthly mortality (SMM)', 'The monthly share of eligible balance that prepays: prepaid principal ÷ (beginning UPB − scheduled principal). SMM = 1 − (1 − CPR)^(1/12). At 6% CPR, SMM ≈ 0.5143%, not 0.5%.'],
  ['Public Securities Association (PSA) benchmark', 'An age-based convention. 100% PSA is 0.2% CPR in month 1, rising 0.2 points a month to 6% at month 30 and flat after. 200% PSA doubles every month. It does not respond to rates.'],
  ['Mortgage servicing right (MSR)', 'The contractual right to service a loan, collect payments and keep a servicing fee, in exchange for doing the work. It is a separate asset from the loan. Principal repayment belongs to the loan owner. The servicer administers the loan and earns servicing fees. One organization may perform both roles.'],
  ['Servicing strip (servicing fee)', 'The slice of the note rate the servicer keeps, quoted in basis points a year (25 basis points = 0.25% of the balance a year). It stops when the loan pays off.'],
  ['Refinance incentive', 'The rate gap that drives refinancing in this model: note rate minus the available offer rate. In this model the effective incentive also subtracts friction, an assumed allowance for refinancing cost and hassle. The incentive drives the modeled likelihood of refinancing, not whether refinancing is worthwhile for a given borrower.'],
  ['Turnover', 'Payoffs from selling the home or moving, which happen regardless of rates.'],
  ['Burnout', 'Borrowers who have had a refinance incentive for a while and still not refinanced respond less to it later. Modeled from accumulated months of positive effective incentive.'],
  ['Net present value (NPV)', 'Future cash flows discounted to today and added up. Here, illustrative servicing NPV discounts monthly net servicing cash flow over every remaining month. It is not a market price or accounting fair value.'],
  ['Weighted-average life (WAL)', 'The average time, in years, until the loan owner gets each dollar of principal back. Faster prepayment shortens it. It is a property of principal, not servicing duration.'],
  ['Recapture', 'When a refinancing borrower takes the new loan from the same company. It earns an origination contribution on a new loan; the original loan still pays off and its fees still stop.'],
  ['Survival weight', 'The probability a loan has not paid off yet. The engine multiplies each loan’s contractual cash flows by it, so a pool’s expected balance falls with payoffs while each surviving borrower keeps the same payment.'],
  ['Basis point', 'One hundredth of a percentage point: 100 basis points = 1 percentage point. Sometimes written bp or bps.'],
  ['Percentage point', 'The plain difference between two percentages: a speed moving from 7% to 9% is up 2 percentage points (200 basis points), not up 2%.'],
  ['Present value (PV)', 'One future cash flow converted into today’s dollars using the discount rate.'],
];

export function GlossaryPage() {
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <h1>Glossary</h1>
      <dl className="card">
        {TERMS.map(([t, d]) => (
          <div key={t} style={{ marginBottom: '0.9rem' }}>
            <dt style={{ fontWeight: 700 }}>{t}</dt>
            <dd style={{ margin: '0.15rem 0 0' }}>{d}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
