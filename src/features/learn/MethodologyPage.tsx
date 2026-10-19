import { BEHAVIORAL_COEFFICIENTS as C, SEASONAL_TURNOVER_PRESET } from '../../domain/config';
import { GENERATOR_VERSION, MODEL_VERSION, SCHEMA_VERSION } from '../../domain/version';

export function MethodologyPage() {
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <h1>Methodology</h1>
      <p className="notice warn">
        <strong>Excluded cash flows.</strong> Illustrative servicing NPV leaves out escrow and remittance float, ancillary and late fees, servicing advances, default and foreclosure costs, taxes, hedges and any terminal value or multiple. It is not market value or accounting fair value.
      </p>
      <p>
        Model {MODEL_VERSION}; behavioral coefficients {C.version}; scenario schema {SCHEMA_VERSION}; synthetic generator {GENERATOR_VERSION}. All formulas are educational conventions, not calibrated forecasts, and none is a FICO parameter. The full write-up is in docs/METHODOLOGY.md in the repository.
      </p>
      <section className="card">
        <h2>Scope</h2>
        <p>Performing, fixed-rate, fully amortizing, first-lien residential loans with monthly payments. No negative amortization, adjustable rates, interest-only periods, balloons, modifications, delinquency or partial curtailments. Imported records with those features are rejected.</p>
      </section>
      <section className="card">
        <h2>Loan balance and survival</h2>
        <div className="formula">{`A = B × r / (1 − (1 + r)^−n), r = note rate / 12 (A = B / n when r = 0); fixed at origination
interest = B × r;  S = min(B, max(0, A − interest));  R = B − S;  at maturity S = B, R = 0, no voluntary payoff
expected scheduled = w × S;  expected prepaid = w × R × q;  expected ending = w × R × (1 − q);  next w = w × (1 − q)
The surviving borrower's contractual balance becomes R; payments are never recast.`}</div>
      </section>
      <section className="card">
        <h2>Speeds</h2>
        <div className="formula">{`SMM = prepaid / (beginning UPB − scheduled);  CPR = 1 − (1 − SMM)^12
Portfolio speeds sum dollars first; they never average loan CPRs.
k-month CPR = 1 − [∏(1 − SMM_t)]^(12/k) (geometric annualization). Zero denominator = not applicable.
PSA: CPR(age) = min(0.002 × age, 0.06) × PSA% / 100, per loan age in projected months.`}</div>
      </section>
      <section className="card">
        <h2>Behavioral mode</h2>
        <div className="formula">{`h_move = ${C.baseTurnoverHazard} × turnoverMultiplier × seasonality(month)
x = (noteRate − offerRate) × 10,000 − frictionBps
s = min(age / ${C.seasoningMonths}, 1)
h_refi = ${C.baseRefiHazard} × responseMultiplier × propensity × s × burnout × sigmoid(x / ${C.incentiveScaleBps})
burnout = exp(−${C.burnoutDecay} × E), E = prior months with x > 0 (starts at 0; incremented after each month)
q = 1 − exp(−h_move − h_refi);  q_refi = q × h_refi / (h_move + h_refi);  q_move = q − q_refi`}</div>
        <p>Seasonal preset (January to December): {SEASONAL_TURNOVER_PRESET.join(', ')}; mean exactly 1. Omitted: qualification, home equity, credit changes, cash-out demand, lender pricing.</p>
      </section>
      <section className="card">
        <h2>Servicing cash flow and value</h2>
        <div className="formula">{`gross fee_t = expected beginning UPB × annual fee / 12 (accrued at the start, received at month end)
cost_t = expected beginning active loans × annual cost per loan / 12
net_t = gross fee_t − cost_t (negative allowed)
NPV = Σ net_t / (1 + d)^(t/12) over every remaining contractual month; value in bps = NPV / UPB × 10,000`}</div>
      </section>
      <section className="card">
        <h2>Loan owner lens and recapture</h2>
        <div className="formula">{`WAL = Σ (t/12) × (scheduled_t + prepaid_t) / current UPB, over full maturity
recaptured_t = Σ w × q_refi × share (behavioral mode only)
recapture PV = Σ recaptured_t × contribution / (1 + d)^(t/12) − campaign cost (deducted once)`}</div>
        <p>The owner view is before credit losses, funding costs, guaranty fees, remittance delays and any security structure. Recapture does not keep the original loan alive and includes no replacement servicing value.</p>
      </section>
      <section className="card">
        <h2>Sources (checked October 18, 2026)</h2>
        <ul>
          <li>S1: OCC, Comptroller’s Handbook, Mortgage Banking, servicing-asset and valuation sections (printed pages 67 to 72). Context for separating servicing rights from the loan and valuing projected servicing cash flows under explicit prepayment, cost and discount assumptions. Not a certification of this tool.</li>
          <li>S2: Oracle Financial Services, PSA Method documentation: 0.2-point monthly CPR ramp to 6% at month 30, scaled by the PSA multiplier.</li>
          <li>S3: Fannie Mae Single-Family Loan Performance Data: a candidate for a later licensed adapter. Its terms restrict redistribution; no records are bundled here.</li>
        </ul>
      </section>
    </div>
  );
}
