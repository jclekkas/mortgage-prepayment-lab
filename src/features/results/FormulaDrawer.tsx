import { useStore } from '../../app/store';
import { BEHAVIORAL_COEFFICIENTS as C } from '../../domain/config';
import { pct, usdExact } from '../../domain/format';
import type { RunOutput, ScenarioInput } from '../../domain/types';

/** Shows each formula with this run's numbers substituted for the selected month. */
export function FormulaDrawer({ out, input }: { out: RunOutput; input: ScenarioInput }) {
  const { state } = useStore();
  const m = out.ledger[Math.min(state.selectedMonth ?? 0, out.ledger.length - 1)];
  const s = out.summary;
  if (!m) return null;
  const elig = m.beginningUpb - m.scheduledPrincipal;
  return (
    <details className="drawer" open={state.role === 'analyst'} data-testid="formula-drawer">
      <summary>Formulas for this run (month {m.t})</summary>
      <div className="stack" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
        <div>
          <strong>Single monthly mortality (SMM)</strong>
          <div className="formula">SMM = prepaid ÷ (beginning balance − scheduled){'\n'}    = {usdExact(m.prepaidPrincipal)} ÷ ({usdExact(m.beginningUpb)} − {usdExact(m.scheduledPrincipal)}){'\n'}    = {elig === 0 ? 'Not applicable (no eligible balance)' : pct(m.smm, 5)}</div>
        </div>
        <div>
          <strong>Conditional prepayment rate (CPR), the yearly version</strong>
          <div className="formula">CPR = 1 − (1 − SMM)^12 = {pct(m.cpr, 4)}{'\n'}A conditional annualized rate, not the share of today’s book that will prepay this year.</div>
        </div>
        <div>
          <strong>Twelve-month conditional prepayment rate</strong>
          <div className="formula">1 − [∏(1 − SMM_t), t = 1..12]^(12/12) = {pct(s.cpr12, 3)}   (geometric annualization)</div>
        </div>
        {input.mode === 'behavioral' && (
          <div>
            <strong>Behavioral payoff hazard (per loan)</strong>
            <div className="formula">
              h_move = {C.baseTurnoverHazard} × turnover ({input.behavioralParameters.turnoverMultiplier}) × seasonality{'\n'}
              x = (note rate − offer rate) × 10,000 − friction ({input.behavioralParameters.frictionBps} basis points){'\n'}
              h_refi = {C.baseRefiHazard} × response ({input.behavioralParameters.refiMultiplier}) × propensity × min(age/{C.seasoningMonths}, 1) × burnout × sigmoid(x/{C.incentiveScaleBps}){'\n'}
              burnout = {input.behavioralParameters.burnout ? `exp(−${C.burnoutDecay} × prior months with x > 0)` : '1 (off)'}{'\n'}
              q = 1 − exp(−h_move − h_refi); split in proportion to the hazards{'\n'}
              Offer rate this month: {pct(m.offerRate, 3)}
            </div>
          </div>
        )}
        {input.mode === 'psa' && (
          <div>
            <strong>Public Securities Association (PSA) benchmark</strong>
            <div className="formula">CPR(age) = min(0.002 × age, 0.06) × {input.prepaymentParameters.psaPercent}% ÷ 100, using each loan’s own age</div>
          </div>
        )}
        {input.mode === 'fixedCpr' && (
          <div>
            <strong>Fixed conditional prepayment rate</strong>
            <div className="formula">every loan, every month: q = 1 − (1 − {pct(input.prepaymentParameters.fixedCpr)})^(1/12)</div>
          </div>
        )}
        <div>
          <strong>Servicing cash flow</strong>
          <div className="formula">
            gross fee = Σ beginning balance × annual fee ÷ 12 = {usdExact(m.grossFee)}{'\n'}
            cost = expected active loans ({m.beginningLoans.toFixed(3)}) × annual cost ÷ 12 = {usdExact(m.operatingCost)}{'\n'}
            net = {usdExact(m.netServicing)};  present value (PV) = net × (1 + {pct(input.servicingParameters.discountRate)})^(−{m.t}/12) = {usdExact(m.pvNetServicing)}
          </div>
        </div>
        <div>
          <strong>Illustrative servicing net present value (NPV)</strong>
          <div className="formula">Σ PV of net servicing over all {s.projectionMonths} remaining months = {usdExact(s.servicingNpv)}{'\n'}No terminal value, float, ancillary fees, advances, default costs, taxes or hedges.</div>
        </div>
        <div>
          <strong>Principal weighted-average life (WAL)</strong>
          <div className="formula">Σ (t/12) × (scheduled_t + prepaid_t) ÷ current balance = {s.wal === null ? 'Not applicable' : `${s.wal.toFixed(3)} years`} (full maturity, not the chart window)</div>
        </div>
      </div>
    </details>
  );
}
