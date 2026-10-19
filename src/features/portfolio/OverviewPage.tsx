import { href } from '../../app/router';
import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd } from '../../domain/format';
import { Explanation } from '../results/Explanation';
import { KpiCards } from '../results/KpiCards';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, NpvComparison } from '../results/ScenarioCharts';
import { useComparison } from '../results/useComparison';
import { TermsOnPage } from '../../ui/TermHelp';

export function OverviewPage() {
  const { state, active, applyAndRun, dispatch } = useStore();
  const frozen = active.draft.scenarioId === state.baselineId;
  const target = frozen ? state.slots.find((s) => s.draft.scenarioId !== state.baselineId) : active;
  const quick = (label: string, fn: (d: typeof active.draft) => void) => (
    <button
      type="button"
      disabled={!target}
      onClick={() => {
        const n = structuredClone(target!.draft);
        fn(n);
        if (frozen) dispatch({ type: 'setActive', id: n.scenarioId });
        applyAndRun(n);
      }}
    >
      {label}
    </button>
  );
  const { baseOut } = useComparison();
  const coupon = baseOut?.cohorts.coupon ?? [];
  const npv = entriesFor(state);
  return (
    <div className="stack">
      <div>
        <h1>{state.portfolio.meta.name}</h1>
        <p className="muted">
          {state.portfolio.meta.description} Synthetic as of {formatMonth(state.portfolio.meta.asOfMonth)}. The synthetic offer rate is an assumption, not today’s market rate.
        </p>
        <TermsOnPage ids={['cpr', 'bp', 'ppt', 'upb', 'npv', 'wal', 'netServicing']} />
        <PopulationBadge />
      </div>
      <RunStatus />
      <section className="card" aria-labelledby="try-h">
        <h2 id="try-h">Predict, then run</h2>
        <p>Before you press a button, decide: will next month’s conditional prepayment rate (CPR), the yearly pace of early payoffs, go up or down, and which note-rate band will move most? Each button changes one assumption on {target?.draft.name ?? 'a scenario'} and runs it against the frozen baseline. Rate moves are in basis points: 100 basis points equal 1 percentage point.</p>
        <div className="row">
          {quick('Rates fall 100 basis points', (n) => { n.mode = 'behavioral'; n.ratePath.shockBps = -100; })}
          {quick('Rates rise 100 basis points', (n) => { n.mode = 'behavioral'; n.ratePath.shockBps = 100; })}
          {quick('Recapture share 40%', (n) => { n.mode = 'behavioral'; n.recaptureParameters.share = 0.4; })}
          {quick('Cost per loan $150', (n) => { n.servicingParameters.costPerLoan = 150; })}
          <a className="button" href={href('lab')}>Open the scenario lab</a>
        </div>
      </section>
      <KpiCards />
      <div className="two-col">
        <Explanation />
        <div className="stack">
          <ExcludedNotice excluded={npv.excluded} />
          <NpvComparison entries={npv.entries} />
          {state.role !== 'gm' && coupon.length > 0 && (
            <section className="card">
              <h3>Baseline by note rate</h3>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Baseline cohorts by note rate</caption>
                  <thead><tr><th scope="col">Note rate</th><th scope="col">Loans</th><th scope="col">Balance</th><th scope="col">Next-month CPR</th><th scope="col">Servicing NPV, basis points of balance</th></tr></thead>
                  <tbody>
                    {coupon.map((c) => (
                      <tr key={c.key}><th scope="row">{c.label}</th><td>{c.loanCount}</td><td>{usd(c.beginningUpb, { compact: true })}</td><td>{pct(c.nextMonthCpr)}</td><td>{c.servicingValueBps === null ? 'Not applicable' : c.servicingValueBps.toFixed(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a href={href('cohorts')}>Explore cohorts</a>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
