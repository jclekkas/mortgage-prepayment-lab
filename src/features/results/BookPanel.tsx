import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd } from '../../domain/format';
import type { RunOutput } from '../../domain/types';

/** Bar length scaled to the range shown; scaling from zero made every month look the same. */
const scale = (x: number, lo: number, hi: number) => (hi - lo < 1e-9 ? 60 : 12 + (88 * (x - lo)) / (hi - lo));

/**
 * Month by month: prepaid principal (left) against the servicer's net cash (right), one row per
 * month of the chart horizon. A row opens that month in the Month ledger.
 */
export function BookPanel({ out, name, horizon, onOpenMonth }: { out: RunOutput; name: string; horizon: number; onOpenMonth: () => void }) {
  const { state, dispatch } = useStore();
  const rows = out.ledger.slice(0, horizon);
  const prep = rows.map((m) => m.prepaidPrincipal), net = rows.map((m) => Math.abs(m.netServicing));
  const [pLo, pHi, nLo, nHi] = [Math.min(...prep), Math.max(...prep), Math.min(...net), Math.max(...net)];
  let cumPrep = 0, cumPv = 0;
  const open = (k: number) => { dispatch({ type: 'selectMonth', index: k }); onOpenMonth(); };
  return (
    <section aria-labelledby="book-h" data-testid="month-book">
      <h3 id="book-h">Month by month: {name}, first {rows.length} months</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Left: loan balance paid off early that month; each payoff ends that loan’s fee. Right: the servicer’s fees minus costs that month, in blue above zero and grey with a minus sign below.
        Bars are scaled to the range shown, not from zero. Value to date adds each month’s cash in today’s dollars. Choose a month to open its ledger.
      </p>
      <div className="table-wrap tall">
        <table className="book">
          <caption className="sr-only">Month by month: prepaid principal and servicer net cash for {name}</caption>
          <thead>
            <tr>
              <th scope="col">Paid off early, to date</th>
              <th scope="col">This month</th>
              <th scope="col"><span className="sr-only">Prepaid principal bar</span></th>
              <th scope="col" style={{ textAlign: 'center' }}>Month · speed</th>
              <th scope="col"><span className="sr-only">Servicer cash bar</span></th>
              <th scope="col">Servicer cash</th>
              <th scope="col">Value to date, today’s dollars</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, k) => {
              cumPrep += m.prepaidPrincipal;
              cumPv += m.pvNetServicing;
              const neg = m.netServicing < 0;
              return (
                <tr key={m.t} className={k === state.selectedMonth ? 'selected' : undefined} onClick={() => open(k)}>
                  <td>{usd(cumPrep, { compact: true })}</td>
                  <td className="pos-txt">{usd(m.prepaidPrincipal, { compact: true })}</td>
                  <td className="bar-cell" aria-hidden="true"><div className="bar left" style={{ width: `${scale(m.prepaidPrincipal, pLo, pHi).toFixed(1)}%` }} /></td>
                  <th scope="row" className="mid">
                    <button type="button" className="link" style={{ color: 'var(--text)', textDecoration: 'none' }} onClick={(e) => { e.stopPropagation(); open(k); }}>
                      {formatMonth(m.month)} {pct(m.cpr, 1)}
                    </button>
                  </th>
                  <td className="bar-cell" aria-hidden="true"><div className={`bar right ${neg ? 'neg' : 'pos'}`} style={{ width: `${scale(Math.abs(m.netServicing), nLo, nHi).toFixed(1)}%` }} /></td>
                  <td className={neg ? 'neg-txt' : 'pos-txt'}>{usd(m.netServicing, { compact: true, signed: true })}</td>
                  <td>{usd(cumPv, { compact: true })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>All months to maturity are in the downloadable ledger on the Month ledger tab.</p>
    </section>
  );
}
