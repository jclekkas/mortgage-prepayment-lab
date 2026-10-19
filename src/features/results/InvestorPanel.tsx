import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { usd, years } from '../../domain/format';
import type { RunOutput } from '../../domain/types';
import { LineChart } from '../../ui/LineChart';
import { LabelWithHelp } from '../../ui/TermHelp';

/** Separate loan-owner lens: principal and note interest, kept apart from servicing fees. */
export function InvestorPanel({ out, baseOut, name }: { out: RunOutput; baseOut: RunOutput | null; name: string }) {
  const { state, dispatch } = useStore();
  const horizon = state.slots.find((s) => s.draft.scenarioId === state.activeId)?.draft.chartHorizon ?? 36;
  const led = out.ledger.slice(0, horizon);
  const s = out.summary;
  const sum = (f: (m: RunOutput['ledger'][number]) => number) => led.reduce((a, m) => a + f(m), 0);
  return (
    <section className="stack" aria-labelledby="inv-h" data-testid="investor-panel">
      <div className="card">
        <h3 id="inv-h">Loan owner view: {name}</h3>
        <p className="notice info" style={{ fontSize: '0.88rem' }}>
          Simplified loan-owner view before credit losses, funding costs, guaranty fees, remittance delays and any security structure. It is not a priced agency mortgage-backed security.
          Principal repayment belongs to the loan owner. The servicer administers the loan and earns servicing fees. One organization may perform both roles. The servicer collects principal and passes it on.
        </p>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Owner cash flows over the chart window</caption>
            <tbody>
              <tr><th scope="row">Scheduled principal, first {led.length} months</th><td>{usd(sum((m) => m.scheduledPrincipal), { compact: true })}</td></tr>
              <tr><th scope="row">Prepaid principal, first {led.length} months</th><td>{usd(sum((m) => m.prepaidPrincipal), { compact: true })}</td></tr>
              <tr><th scope="row">Note interest net of servicing fee, first {led.length} months</th><td>{usd(sum((m) => m.ownerNetInterest), { compact: true })}</td></tr>
              <tr><th scope="row">Servicing fee retained by servicer (not owner cash)</th><td>{usd(sum((m) => m.grossFee), { compact: true })}</td></tr>
              <tr><th scope="row"><LabelWithHelp label="Principal weighted-average life (WAL), full maturity" term="wal" /></th><td>{years(s.wal)}{baseOut && baseOut !== out ? ` (baseline ${years(baseOut.summary.wal)})` : ''}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Faster payoff returns principal sooner. That changes cash-flow timing and can affect the investment’s value; this simulator does not determine whether it is favorable for the owner. Premium or discount return claims need a purchase price and a yield model, planned for a later release.
        </p>
      </div>
      <LineChart
        testId="chart-owner"
        title="Monthly cash to the loan owner"
        axes="Up the side: dollars received that month. Along the bottom: month."
        summary={`Scheduled principal, prepaid principal and note interest net of the servicing fee for ${name}.`}
        series={[
          { id: 'sched', label: 'Scheduled principal', color: 'var(--sched)', values: led.map((m) => m.scheduledPrincipal) },
          { id: 'prep', label: 'Prepaid principal', color: 'var(--prep)', values: led.map((m) => m.prepaidPrincipal) },
          { id: 'int', label: 'Net note interest', color: 'var(--s3)', values: led.map((m) => m.ownerNetInterest), dashed: true },
        ]}
        xLabels={led.map((m) => formatMonth(m.month))}
        yFormat={(v) => usd(v, { compact: true })}
        selectedIndex={state.selectedMonth}
        onSelect={(i) => dispatch({ type: 'selectMonth', index: i })}
        includeZero
      />
    </section>
  );
}
