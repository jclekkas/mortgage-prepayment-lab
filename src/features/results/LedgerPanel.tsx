import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { num, pct, usdExact } from '../../domain/format';
import type { LedgerMonth, RunOutput } from '../../domain/types';
import { downloadText, ledgerCsv, safeFileName } from '../../storage/exports';

type Row = [string, (m: LedgerMonth) => string, string];

/** A cause count, or why it is not available. */
const cause = (v: number | null) => (v === null ? 'Not applicable: this mode does not identify payoff causes' : num(v, 3));

const ROWS: Row[] = [
  ['Beginning unpaid principal balance (UPB)', (m) => usdExact(m.beginningUpb), 'What borrowers owe at the start of the month. Expected balance at the start of the month: sum over loans of survival weight × contractual balance.'],
  ['Scheduled principal', (m) => usdExact(m.scheduledPrincipal), 'Contractual payment minus interest, for surviving loans. Goes to the loan owner.'],
  ['Prepaid principal', (m) => usdExact(m.prepaidPrincipal), 'Remaining balance of loans expected to pay off in full this month. Goes to the loan owner.'],
  ['Ending balance (UPB)', (m) => usdExact(m.endingUpb), 'Beginning minus scheduled minus prepaid.'],
  ['Single monthly mortality (SMM)', (m) => pct(m.smm, 4), 'Share of the balance paid off early this month: prepaid principal ÷ (beginning balance − scheduled principal).'],
  ['Conditional prepayment rate (CPR)', (m) => pct(m.cpr, 3), 'The same speed as a yearly rate: 1 − (1 − SMM)^12.'],
  ['Expected active loans', (m) => num(m.beginningLoans, 2), 'Sum of survival weights. Fractional counts are intentional.'],
  ['Expected voluntary payoffs (all causes)', (m) => num(m.voluntaryPayoffs, 3), 'Survival weight × payoff probability, summed by loan. Maturities are counted separately.'],
  ['… of which refinance', (m) => cause(m.refiPayoffs), 'Identified only in behavioral mode.'],
  ['… of which move / turnover', (m) => cause(m.turnoverPayoffs), 'Identified only in behavioral mode.'],
  ['… of which unclassified', (m) => num(m.unclassifiedPayoffs, 3), 'The fixed-rate and PSA benchmark modes give a speed, not a reason, so all their payoffs are unclassified. Always 0 in behavioral mode.'],
  ['Loans reaching maturity', (m) => num(m.maturedLoans, 3), 'Final contractual payment. Never counted as a voluntary payoff.'],
  ['Note interest paid by borrowers', (m) => usdExact(m.noteInterest), 'Survival-weighted balance × note rate ÷ 12. Belongs to the loan owner, less the servicing fee.'],
  ['Gross servicing fee', (m) => usdExact(m.grossFee), 'The servicer’s fee: beginning balance × annual fee ÷ 12, summed by loan.'],
  ['Operating cost', (m) => usdExact(m.operatingCost), 'Expected active loans × annual cost per loan ÷ 12.'],
  ['Net servicing cash flow', (m) => usdExact(m.netServicing), 'Gross fee − operating cost. Negative values are allowed.'],
  ['Discount factor', (m) => m.discountFactor.toFixed(6), 'What $1 received at the end of this month is worth today: (1 + annual discount rate)^(−t/12).'],
  ['Present value (PV) of net servicing', (m) => usdExact(m.pvNetServicing), 'This month’s net servicing cash flow in today’s dollars: net cash flow × discount factor.'],
  ['Offer rate', (m) => (m.offerRate === null ? 'Not applicable' : pct(m.offerRate, 3)), 'Behavioral mode only.'],
  ['Expected recaptured loans', (m) => (m.recapturedLoans === null ? 'Not applicable' : num(m.recapturedLoans, 3)), 'Expected refinance payoffs × recapture share. A new loan; the old one still pays off.'],
];

export function MonthLedger({ out, baseOut, name }: { out: RunOutput; baseOut: RunOutput | null; name: string }) {
  const { state, dispatch } = useStore();
  const i = Math.min(state.selectedMonth ?? 0, Math.max(0, out.ledger.length - 1));
  const m = out.ledger[i];
  if (!m) return <p className="muted">No ledger months: no loans in this population have payments left.</p>;
  const b = baseOut?.ledger[i];
  const residual = m.beginningUpb - m.scheduledPrincipal - m.prepaidPrincipal - m.endingUpb;
  const tol = Math.max(0.01, m.beginningUpb * 1e-10);
  return (
    <section className="card" aria-labelledby="ledger-h" data-testid="month-ledger">
      <div className="chart-head">
        <h3 id="ledger-h">Cash-flow ledger: {formatMonth(m.month)} (month {m.t})</h3>
        <div className="row">
          <button type="button" disabled={i === 0} onClick={() => dispatch({ type: 'selectMonth', index: i - 1 })}><span aria-hidden="true">←</span> Previous month</button>
          <label className="sr-only" htmlFor="month-pick">Month</label>
          <select id="month-pick" value={i} onChange={(e) => dispatch({ type: 'selectMonth', index: Number(e.target.value) })}>
            {out.ledger.map((x, k) => (
              <option key={x.t} value={k}>{formatMonth(x.month)}</option>
            ))}
          </select>
          <button type="button" disabled={i >= out.ledger.length - 1} onClick={() => dispatch({ type: 'selectMonth', index: i + 1 })}>Next month <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <p className={`notice ${Math.abs(residual) <= tol ? 'ok' : 'err'}`} data-testid="reconciliation">
        Reconciliation: beginning balance {usdExact(m.beginningUpb)} = scheduled {usdExact(m.scheduledPrincipal)} + prepaid {usdExact(m.prepaidPrincipal)} + ending {usdExact(m.endingUpb)}.
        Difference {usdExact(residual)} ({Math.abs(residual) <= tol ? 'within tolerance' : 'OUT OF TOLERANCE'}).
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Ledger for {formatMonth(m.month)}</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">{name}</th>
              {b && <th scope="col">Baseline</th>}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, f, how]) => (
              <tr key={label}>
                <th scope="row">
                  {label}
                  <span className="ledger-how">{how}</span>
                </th>
                <td>{f(m)}</td>
                {b && <td>{f(b)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row no-print" style={{ marginTop: '0.5rem' }}>
        <button type="button" onClick={() => downloadText(`${safeFileName(name)}-ledger.csv`, ledgerCsv(out, name), 'text/csv')} data-testid="export-csv">
          Download full monthly ledger (spreadsheet file)
        </button>
        <span className="muted" style={{ fontSize: '0.85rem' }}>A comma-separated file that opens in any spreadsheet. All {out.ledger.length} months to full maturity; formula-like text is neutralized. Column names are listed in the data dictionary.</span>
      </div>
    </section>
  );
}

export function FullLedger({ out, horizon }: { out: RunOutput; horizon: number }) {
  const { state, dispatch } = useStore();
  const rows = out.ledger.slice(0, horizon);
  return (
    <div className="table-wrap tall">
      <table>
        <caption>Monthly portfolio ledger, first {rows.length} months (download the spreadsheet file for all months)</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Beginning balance</th>
            <th scope="col">Scheduled</th>
            <th scope="col">Prepaid</th>
            <th scope="col">Ending balance</th>
            <th scope="col">CPR</th>
            <th scope="col">Net servicing</th>
            <th scope="col">Present value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, k) => (
            <tr key={m.t} className={k === state.selectedMonth ? 'selected' : undefined}>
              <th scope="row"><button type="button" className="link" onClick={() => dispatch({ type: 'selectMonth', index: k })}>{formatMonth(m.month)}</button></th>
              <td>{usdExact(m.beginningUpb)}</td>
              <td>{usdExact(m.scheduledPrincipal)}</td>
              <td>{usdExact(m.prepaidPrincipal)}</td>
              <td>{usdExact(m.endingUpb)}</td>
              <td>{pct(m.cpr, 2)}</td>
              <td>{usdExact(m.netServicing)}</td>
              <td>{usdExact(m.pvNetServicing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
