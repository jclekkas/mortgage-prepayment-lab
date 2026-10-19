import { slotColor } from '../../app/palette';
import { useStore, type Slot } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd } from '../../domain/format';
import type { RunOutput } from '../../domain/types';
import { LineChart, type Series } from '../../ui/LineChart';

export interface ChartEntry {
  label: string;
  output: RunOutput;
  index: number;
  isBaseline: boolean;
}

/** Entries for the given slots that have results, in slot order. */
export function entriesFor(slots: Slot[], baselineId: string): ChartEntry[] {
  return slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.run.output)
    .map(({ s, i }) => ({ label: s.draft.scenarioId === baselineId ? (s.draft.name.toLowerCase().startsWith('baseline') ? s.draft.name : `Baseline: ${s.draft.name}`) : s.draft.name, output: s.run.output!, index: i, isBaseline: s.draft.scenarioId === baselineId }));
}

function seriesOf(entries: ChartEntry[], horizon: number, pick: (m: RunOutput['ledger'][number]) => number | null): Series[] {
  return entries.map((e) => ({
    id: `${e.index}`,
    label: e.label,
    color: slotColor(e.index),
    dashed: e.isBaseline,
    values: e.output.ledger.slice(0, horizon).map(pick),
  }));
}

export function ScenarioCharts({ entries, focus }: { entries: ChartEntry[]; focus: ChartEntry }) {
  const { state, dispatch } = useStore();
  const horizon = state.slots.find((s) => s.draft.scenarioId === state.activeId)?.draft.chartHorizon ?? 36;
  const ledger = focus.output.ledger.slice(0, horizon);
  const labels = ledger.map((m) => formatMonth(m.month));
  if (ledger.length === 0) return <p className="muted">No months to chart for this population.</p>;
  const sel = state.selectedMonth;
  const onSelect = (i: number) => dispatch({ type: 'selectMonth', index: i });
  let cs = 0, cp = 0;
  const cumSched = ledger.map((m) => (cs += m.scheduledPrincipal));
  const cumPrep = ledger.map((m) => (cp += m.prepaidPrincipal));
  const first = (e: ChartEntry) => e.output.ledger[0];
  const last = (e: ChartEntry) => e.output.ledger[Math.min(horizon, e.output.ledger.length) - 1];
  return (
    <div className="charts-grid">
      <LineChart
        testId="chart-cpr"
        title="Monthly prepayment speed, annualized (CPR)"
        summary={`Annualized share of eligible balance prepaid each month. ${entries.map((e) => `${e.label}: ${pct(first(e)?.cpr)} in month 1, ${pct(last(e)?.cpr)} in month ${Math.min(horizon, e.output.ledger.length)}`).join('. ')}.`}
        series={seriesOf(entries, horizon, (m) => m.cpr)}
        xLabels={labels}
        yFormat={(v) => pct(v, 1)}
        selectedIndex={sel}
        onSelect={onSelect}
        includeZero
      />
      <LineChart
        testId="chart-upb"
        title="Remaining unpaid principal balance (UPB)"
        summary={`Expected balance still outstanding at month end. ${entries.map((e) => `${e.label}: ${usd(last(e)?.endingUpb, { compact: true })} after ${Math.min(horizon, e.output.ledger.length)} months`).join('. ')}.`}
        series={seriesOf(entries, horizon, (m) => m.endingUpb)}
        xLabels={labels}
        yFormat={(v) => usd(v, { compact: true })}
        selectedIndex={sel}
        onSelect={onSelect}
        includeZero
      />
      <LineChart
        testId="chart-principal"
        stacked
        title={`Cumulative principal returned to the loan owner: ${focus.label}`}
        summary={`Over the chart window, ${usd(cumSched[cumSched.length - 1], { compact: true })} comes back as scheduled principal and ${usd(cumPrep[cumPrep.length - 1], { compact: true })} as prepaid principal. This principal belongs to the loan owner, not the servicer.`}
        series={[
          { id: 'sched', label: 'Scheduled principal', color: 'var(--sched)', values: cumSched },
          { id: 'prep', label: 'Prepaid principal', color: 'var(--prep)', values: cumPrep },
        ]}
        xLabels={labels}
        yFormat={(v) => usd(v, { compact: true })}
        selectedIndex={sel}
        onSelect={onSelect}
      />
      <LineChart
        testId="chart-net"
        title="Net servicing cash flow per month"
        summary={`Servicing fee on surviving balances minus cost per surviving loan. ${entries.map((e) => `${e.label}: ${usd(first(e)?.netServicing)} in month 1`).join('. ')}.`}
        series={seriesOf(entries, horizon, (m) => m.netServicing)}
        xLabels={labels}
        yFormat={(v) => usd(v, { compact: true })}
        selectedIndex={sel}
        onSelect={onSelect}
        includeZero
      />
      <NpvComparison entries={entries} />
    </div>
  );
}

export function NpvComparison({ entries }: { entries: ChartEntry[] }) {
  const max = Math.max(1, ...entries.map((e) => Math.abs(e.output.summary.servicingNpv)));
  return (
    <figure className="card chart-card" style={{ margin: 0 }} data-testid="chart-npv">
      <h3>Illustrative lifetime servicing NPV</h3>
      <figcaption className="muted" style={{ fontSize: '0.85rem' }}>
        Discounted net servicing cash flow over every remaining month. Not a market value or fair value. Bars start at zero; negative values extend left.
      </figcaption>
      <table>
        <caption className="sr-only">Lifetime servicing NPV by scenario</caption>
        <thead>
          <tr>
            <th scope="col">Scenario</th>
            <th scope="col" style={{ width: '45%' }}><span className="sr-only">Bar</span></th>
            <th scope="col">NPV</th>
            <th scope="col">bps of UPB</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const v = e.output.summary.servicingNpv;
            return (
              <tr key={e.index}>
                <th scope="row">{e.label}</th>
                <td aria-hidden="true">
                  <div className="bar-track">
                    <div className="bar-mid" />
                    <div className="bar-fill" style={{ background: slotColor(e.index), left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / max) * 50}%`, width: `${(Math.abs(v) / max) * 50}%` }} />
                  </div>
                </td>
                <td>{usd(v, { compact: true })}</td>
                <td>{e.output.summary.servicingValueBps === null ? 'Not applicable' : e.output.summary.servicingValueBps.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}
