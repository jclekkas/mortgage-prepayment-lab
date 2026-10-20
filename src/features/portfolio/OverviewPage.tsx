import { useState } from 'react';
import { href } from '../../app/router';
import { CreditCard } from '../credit/CreditCard';
import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd } from '../../domain/format';
import { Explanation, ShortHeadline } from '../results/Explanation';
import { KpiCards } from '../results/KpiCards';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, NpvComparison } from '../results/ScenarioCharts';
import { useComparison } from '../results/useComparison';
import { usePerspective } from '../results/Perspective';
import { diffInputs } from '../../domain/diff';
import { MODE_LABELS } from '../../domain/scenario';
import type { ScenarioInput } from '../../domain/types';
import { TermsOnPage } from '../../ui/TermHelp';

interface Quick { title: string; sub: string; apply: (d: ScenarioInput) => void; needsBehavioral: boolean }
const QUICK: Quick[] = [
  { title: 'Rates −100 bp', sub: 'Offer rate 1 percentage point lower', apply: (n) => { n.ratePath.shockBps = -100; }, needsBehavioral: true },
  { title: 'Rates +100 bp', sub: 'Offer rate 1 percentage point higher', apply: (n) => { n.ratePath.shockBps = 100; }, needsBehavioral: true },
  { title: 'Recapture 40%', sub: 'Share of refinancing borrowers who stay', apply: (n) => { n.recaptureParameters.share = 0.4; }, needsBehavioral: true },
  { title: 'Cost $150 a loan', sub: 'Yearly cost per active loan', apply: (n) => { n.servicingParameters.costPerLoan = 150; }, needsBehavioral: false },
];

export function OverviewPage() {
  const { state, active, baseline, applyAndRun, undoAndRun, dispatch } = useStore();
  const perspective = usePerspective();
  const frozen = active.draft.scenarioId === state.baselineId;
  const target = frozen ? state.slots.find((s) => s.draft.scenarioId !== state.baselineId) : active;
  const behavioral = target?.draft.mode === 'behavioral';
  const needsBehavioral = target && !behavioral ? `Needs the behavioral model; ${target.draft.name} uses ${MODE_LABELS[target.draft.mode]}. Change its model in the Scenario lab first.` : null;
  // Everything the shortcut's scenario already differs from the baseline in, including unrun edits, so nothing changes silently.
  const already = target ? diffInputs(baseline.draft, target.draft) : [];
  // The undo button appears after a quick experiment on this page, for the scenario it changed.
  const [lastQuick, setLastQuick] = useState<string | null>(null);
  const undoTarget = lastQuick ? state.slots.find((s) => s.draft.scenarioId === lastQuick) : undefined;
  const { baseOut } = useComparison();
  const coupon = baseOut?.cohorts.coupon ?? [];
  const npv = entriesFor(state);
  const owner = perspective === 'owner';
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0, maxWidth: 820 }}>
        {state.portfolio.meta.description} Synthetic as of {formatMonth(state.portfolio.meta.asOfMonth)}. The synthetic offer rate is an assumption, not today’s market rate.
      </p>
      <PopulationBadge />
      <RunStatus />
      <section className="card hero" aria-labelledby="hero-k">
        <p className="kicker" id="hero-k">{owner ? 'Loan owner view' : 'Servicer view'} · {active.draft.scenarioId === state.baselineId ? 'the frozen baseline' : `${active.draft.name} versus the frozen baseline`}</p>
        <ShortHeadline size="hero" />
        <div className="row">
          <a className="button" href={href('lab')}>Open the scenario lab</a>
          <a href={href('guided')} data-testid="overview-guided" style={{ fontWeight: 600 }}>New here? Take the guided experiment</a>
        </div>
      </section>
      <KpiCards />
      <section aria-labelledby="try-h">
        <div className="row" style={{ alignItems: 'baseline', gap: '4px 14px', marginBottom: 10 }}>
          <h2 id="try-h" style={{ margin: 0, fontSize: 22 }}>Predict, then run</h2>
          <span className="muted" style={{ fontSize: 14 }}>Will next month’s prepayment speed go up or down? Decide before you press. 100 basis points (bp) equal 1 percentage point.</span>
        </div>
        <div className="quick-grid">
          {QUICK.map((q) => {
            const reason = q.needsBehavioral ? needsBehavioral : null;
            return (
              <button key={q.title} type="button" disabled={!target || !!reason} title={reason ?? undefined}
                onClick={() => {
                  const n = structuredClone(target!.draft);
                  q.apply(n);
                  if (frozen) dispatch({ type: 'setActive', id: n.scenarioId });
                  applyAndRun(n);
                  setLastQuick(n.scenarioId);
                }}>
                <span className="q1">{q.title}</span>
                <span className="q2">{q.sub}</span>
              </button>
            );
          })}
        </div>
        <p data-testid="quick-scope" style={{ marginTop: 10, fontSize: 14 }}>
          Each sets one assumption on <strong>{target?.draft.name ?? 'a scenario'}</strong> and runs it against the frozen baseline. It keeps that scenario’s other changes:{' '}
          {already.length ? already.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ') : 'none so far (it matches the baseline)'}.
          To start a fresh experiment instead, use “Reset to baseline” or “Duplicate” in the Scenario lab.
        </p>
        {needsBehavioral && <p className="notice info" data-testid="quick-needs-behavioral">Rate and recapture experiments are off: {needsBehavioral} In the fixed-rate and benchmark models, interest rates do not drive prepayment.</p>}
        {undoTarget && undoTarget.undo.length > 0 && (
          <button type="button" onClick={() => { undoAndRun(undoTarget.draft.scenarioId); setLastQuick(null); }} data-testid="quick-undo">
            Undo the last change and re-run
          </button>
        )}
      </section>
      <div className="two-col">
        <Explanation />
        <div className="stack">
          <ExcludedNotice excluded={npv.excluded} />
          {!owner && <NpvComparison entries={npv.entries} />}
          {!owner && state.role !== 'gm' && coupon.length > 0 && (
            <section className="card">
              <h3>Baseline by borrower’s existing mortgage rate</h3>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Baseline loan groups by existing mortgage rate (note rate)</caption>
                  <thead><tr><th scope="col">Existing mortgage rate</th><th scope="col">Loans</th><th scope="col">Balance</th><th scope="col">Next-month speed (CPR)</th><th scope="col">Servicing value, basis points of balance</th></tr></thead>
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
          <CreditCard />
        </div>
      </div>
      <TermsOnPage ids={['cpr', 'bp', 'ppt', 'upb', 'prepaid', 'npv', 'wal', 'netServicing']} />
    </div>
  );
}
