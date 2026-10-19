import { href } from '../../app/router';
import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd } from '../../domain/format';
import { Explanation } from '../results/Explanation';
import { KpiCards } from '../results/KpiCards';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, NpvComparison } from '../results/ScenarioCharts';
import { useComparison } from '../results/useComparison';
import { usePerspective } from '../results/Perspective';
import { diffInputs } from '../../domain/diff';
import { MODE_LABELS } from '../../domain/scenario';
import { TermsOnPage } from '../../ui/TermHelp';

export function OverviewPage() {
  const { state, active, baseline, applyAndRun, dispatch } = useStore();
  const perspective = usePerspective();
  const frozen = active.draft.scenarioId === state.baselineId;
  const target = frozen ? state.slots.find((s) => s.draft.scenarioId !== state.baselineId) : active;
  const behavioral = target?.draft.mode === 'behavioral';
  const needsBehavioral = target && !behavioral ? `Needs the behavioral model; ${target.draft.name} uses ${MODE_LABELS[target.draft.mode]}. Change its model in the Scenario lab first.` : null;
  // Everything the shortcut's scenario already differs from the baseline in, including unrun edits, so nothing changes silently.
  const already = target ? diffInputs(baseline.draft, target.draft) : [];
  const quick = (label: string, fn: (d: typeof active.draft) => void, disabledReason: string | null = null) => (
    <button
      type="button"
      disabled={!target || !!disabledReason}
      title={disabledReason ?? undefined}
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
        <TermsOnPage ids={['cpr', 'bp', 'ppt', 'upb', 'prepaid', 'npv', 'wal', 'netServicing']} />
        <PopulationBadge />
      </div>
      <RunStatus />
      <section className="card" aria-labelledby="try-h">
        <h2 id="try-h">Predict, then run</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>First time here? The <a href={href('guided')} data-testid="overview-guided">guided experiment</a> explains who is who and walks through one rate cut without changing your scenarios.</p>
        <p>Before you press a button, decide: will next month’s conditional prepayment rate (CPR), the yearly pace of early payoffs, go up or down? Rate moves are in basis points: 100 basis points equal 1 percentage point.</p>
        <p data-testid="quick-scope">
          Each button sets one assumption on <strong>{target?.draft.name ?? 'a scenario'}</strong> and runs it against the frozen baseline. It keeps that scenario’s other changes:{' '}
          {already.length ? already.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ') : 'none so far (it matches the baseline)'}.
          To start a fresh experiment instead, use “Reset to baseline” or “Duplicate” in the Scenario lab.
        </p>
        <div className="row">
          {quick('Set rate shock to −100 basis points', (n) => { n.ratePath.shockBps = -100; }, needsBehavioral)}
          {quick('Set rate shock to +100 basis points', (n) => { n.ratePath.shockBps = 100; }, needsBehavioral)}
          {quick('Set recapture share to 40%', (n) => { n.recaptureParameters.share = 0.4; }, needsBehavioral)}
          {quick('Set cost per loan to $150 a year', (n) => { n.servicingParameters.costPerLoan = 150; })}
          <a className="button" href={href('lab')}>Open the scenario lab</a>
        </div>
        {needsBehavioral && <p className="notice info" data-testid="quick-needs-behavioral">Rate and recapture buttons are off: {needsBehavioral} In the fixed-rate and benchmark models, interest rates do not drive prepayment.</p>}
      </section>
      <KpiCards />
      <div className="two-col">
        <Explanation />
        <div className="stack">
          <ExcludedNotice excluded={npv.excluded} />
          {perspective === 'servicer' && <NpvComparison entries={npv.entries} />}
          {perspective === 'servicer' && state.role !== 'gm' && coupon.length > 0 && (
            <section className="card">
              <h3>Baseline by borrower’s existing mortgage rate</h3>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Baseline loan groups by existing mortgage rate (note rate)</caption>
                  <thead><tr><th scope="col">Existing mortgage rate</th><th scope="col">Loans</th><th scope="col">Balance</th><th scope="col">Next-month CPR</th><th scope="col">Servicing NPV, basis points of balance</th></tr></thead>
                  <tbody>
                    {coupon.map((c) => (
                      <tr key={c.key}><th scope="row">{c.label}</th><td>{c.loanCount}</td><td>{usd(c.beginningUpb, { compact: true })}</td><td>{pct(c.nextMonthCpr)}</td><td>{c.servicingValueBps === null ? 'Not applicable' : c.servicingValueBps.toFixed(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a href={href('cohorts')}>Explore loan groups</a>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
