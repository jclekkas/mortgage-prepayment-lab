import { href } from '../../app/router';
import { assessSlots, useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { diffInputs } from '../../domain/diff';
import { pct, usd, years } from '../../domain/format';
import { hashValue } from '../../domain/hash';
import { explainComparison } from '../../domain/narrative';
import { describeFilter } from '../../domain/segments';
import { MODE_LABELS } from '../../domain/scenario';
import { MODEL_VERSION } from '../../domain/version';

/** One-page printable scenario brief. */
export function BriefPage() {
  const { state, baseline } = useStore();
  // The brief prints only when every scenario has a result for the current population.
  const assessment = assessSlots(state);
  const ready = assessment.comparable && state.slots.every((s) => s.run.outputInput && s.run.status !== 'running');
  const slots = ready ? state.slots : [];
  const reproHash = ready ? hashValue(slots.map((s) => s.run.output!.runKey)) : null;
  const p = state.portfolio.meta;
  return (
    <article className="stack" style={{ maxWidth: 900 }} data-testid="brief">
      <div className="row no-print">
        <a href={href('decision')}>← Back to decision room</a>
        <button type="button" className="primary" onClick={() => window.print()} disabled={!ready}>Print or save as PDF</button>
      </div>
      <header>
        <h1>Scenario brief: {p.name}</h1>
        <p>
          Synthetic portfolio, as of {formatMonth(p.asOfMonth)} · {state.portfolio.loans.length.toLocaleString()} loans · population: {describeFilter(state.filter)} · model {MODEL_VERSION} · prepared {new Date().toLocaleDateString()}
        </p>
        <p><strong>Reproducibility hash:</strong> <code data-testid="repro-hash">{reproHash ?? 'waiting for all runs'}</code> (portfolio {p.hash.slice(0, 12)}…)</p>
      </header>
      {!ready && (
        <div className="notice warn" role="status" data-testid="brief-blocked">
          <strong>The brief is unavailable until every scenario has a result for the current population.</strong>
          <ul style={{ margin: '0.25rem 0 0' }}>{assessment.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {ready && (
        <>
          <section className="card">
            <h2>Results</h2>
            <table>
              <thead>
                <tr><th scope="col">Measure</th>{slots.map((s) => <th scope="col" key={s.draft.scenarioId}>{s.draft.scenarioId === state.baselineId ? 'Baseline' : s.draft.name}</th>)}</tr>
              </thead>
              <tbody>
                {([
                  ['Model mode', (x) => MODE_LABELS[x.run.outputInput!.mode]],
                  ['Month-1 CPR', (x) => pct(x.run.output!.summary.nextMonthCpr)],
                  ['12-month prepaid principal', (x) => usd(x.run.output!.summary.prepaid12, { compact: true })],
                  ['12-month net servicing cash flow', (x) => usd(x.run.output!.summary.netServicing12, { compact: true })],
                  ['Illustrative servicing NPV', (x) => usd(x.run.output!.summary.servicingNpv, { compact: true })],
                  ['NPV, bps of UPB', (x) => x.run.output!.summary.servicingValueBps?.toFixed(1) ?? 'Not applicable'],
                  ['Recapture contribution PV', (x) => usd(x.run.output!.summary.recapturePv, { compact: true })],
                  ['Principal weighted-average life', (x) => years(x.run.output!.summary.wal)],
                  ['Run key', (x) => x.run.output!.runKey.slice(0, 12) + '…'],
                ] as [string, (x: (typeof slots)[number]) => string][]).map(([label, f]) => (
                  <tr key={label}><th scope="row">{label}</th>{slots.map((s) => <td key={s.draft.scenarioId}>{f(s)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </section>
          {slots.filter((s) => s.draft.scenarioId !== state.baselineId).map((s) => {
            const n = explainComparison(baseline.run.outputInput!, baseline.run.output!, s.run.outputInput!, s.run.output!, state.goal);
            const note = state.notes[s.draft.scenarioId];
            return (
              <section className="card" key={s.draft.scenarioId}>
                <h2>{s.draft.name}</h2>
                <p><strong>Assumptions changed from baseline:</strong> {diffInputs(baseline.run.outputInput!, s.run.outputInput!).map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ') || 'none'}</p>
                <p>{n.headline}</p>
                <ul>{n.points.map((x, i) => <li key={i}>{x}</li>)}</ul>
                {note && (note.whatChanged || note.evidence || note.investigateNext) && (
                  <div>
                    <p><strong>What I think changed:</strong> {note.whatChanged || '—'}</p>
                    <p><strong>Evidence:</strong> {note.evidence || '—'}</p>
                    <p><strong>What I would investigate next:</strong> {note.investigateNext || '—'}</p>
                  </div>
                )}
              </section>
            );
          })}
          <section className="card">
            <h2>Limitations</h2>
            <ul style={{ fontSize: '0.9rem' }}>
              <li>Synthetic data and illustrative, uncalibrated behavioral coefficients. Not a FICO model, a forecast, or a validated valuation.</li>
              <li>Illustrative servicing NPV is not market value or accounting fair value. It excludes float, ancillary fees, advances, default costs, taxes, hedges and any terminal value.</li>
              <li>Performing, fixed-rate, fully amortizing first liens only. No delinquency, curtailments, modifications, ARMs, interest-only or balloon loans.</li>
              <li>Recapture contribution is separate from the original book and excludes replacement servicing value. Assumed uplift is not proven causality.</li>
              <li>The loan-owner view is before credit losses, funding costs, guaranty fees, remittance delays and any security structure.</li>
            </ul>
          </section>
        </>
      )}
    </article>
  );
}
