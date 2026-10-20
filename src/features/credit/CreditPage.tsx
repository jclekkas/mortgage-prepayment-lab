import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { href } from '../../app/router';
import { useStore } from '../../app/store';
import {
  AGE_BUCKETS, BANDS, BREAK_EVEN_LIMITS, CREDIT_DATA_LABEL, CREDIT_PROVENANCE, FORECAST_NOT_ESTIMATED, OBSERVATION_HEADER, PAIR_EXCLUSION_LABELS, REASON_LABELS,
  bandLabel, bandOf, breakEven, comparePairs, creditFixture, exampleLoans, formatDate, isRefreshApplied, observationRows, snapshotCoverage, snapshotsFor, summarize,
  type BandId, type BreakEvenInputs, type CreditSnapshot, type InformationSummary, type PairExclusion, type ScoreObservation, type Tally, type UnusableReason,
} from '../../domain/credit';
import { selectPopulation } from '../../domain/engine';
import { pct, usd } from '../../domain/format';
import { scenarioInputHash } from '../../domain/scenario';
import { downloadText, safeFileName } from '../../storage/exports';
import { toCsv } from '../../storage/sanitize';
import { Notice } from '../../ui/misc';
import { Tabs } from '../../ui/Tabs';
import { LabelWithHelp, TermsOnPage } from '../../ui/TermHelp';
import { PopulationBadge } from '../results/RunStatus';

const TABS = [
  { id: 'changes', label: 'A. Information changes' },
  { id: 'forecast', label: 'B. Forecast revisions' },
  { id: 'breakeven', label: 'C. Break-even' },
  { id: 'learn', label: 'Older versus newer' },
];

const REASONS: UnusableReason[] = ['missing', 'unscorable', 'otherVersion', 'notYetAvailable', 'noRecord'];
const EXCLUSIONS: PairExclusion[] = ['noEarlierScore', 'noNewerScore', 'versionChange', 'sourceChange'];

const share = (part: number, whole: number) => (whole > 0 ? pct(part / whole, 1) : 'Not applicable');
const money = (v: number) => usd(v, { compact: true });
const n = (v: number) => v.toLocaleString();
const age = (m: number | null) => (m === null ? 'Not applicable' : m === 0 ? 'Under 1 month' : `${m} months`);

/** A table that may scroll sideways on a narrow screen; focusable so keyboard users can scroll it. */
function ScrollTable({ label, style, children }: { label: string; style?: CSSProperties; children: ReactNode }) {
  return <div className="table-wrap" role="region" aria-label={label} tabIndex={0} style={style}>{children}</div>;
}

/** Loans and balance with their shares of a stated denominator. */
function TallyCells({ t, of }: { t: Tally; of: Tally }) {
  return (
    <>
      <td>{n(t.loans)}</td>
      <td>{share(t.loans, of.loans)}</td>
      <td>{money(t.upb)}</td>
      <td>{share(t.upb, of.upb)}</td>
    </>
  );
}

const TALLY_HEAD = (
  <>
    <th scope="col">Loans</th>
    <th scope="col">Share of loans</th>
    <th scope="col">Balance</th>
    <th scope="col">Share of balance</th>
  </>
);

function SnapshotList({ snaps }: { snaps: readonly CreditSnapshot[] }) {
  return (
    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
      {snaps.map((s) => (
        <li key={s.id}>
          <strong>{s.label}</strong> <span className="muted">({s.observedLabel}; snapshot <code>{s.id}</code>, {n(s.observations.length)} records)</span>
        </li>
      ))}
    </ul>
  );
}

function CoverageTable({ s, caption, testId }: { s: InformationSummary; caption: string; testId: string }) {
  return (
    <ScrollTable label={caption}>
      <table data-testid={testId}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Score status on the analysis date</th>{TALLY_HEAD}</tr></thead>
        <tbody>
          <tr><th scope="row">Usable score</th><TallyCells t={s.usable} of={s.population} /></tr>
          {REASONS.map((r) => <tr key={r}><th scope="row">No usable score: {REASON_LABELS[r]}</th><TallyCells t={s.noUsable[r]} of={s.population} /></tr>)}
          <tr><th scope="row">Selected population (denominator)</th><TallyCells t={s.population} of={s.population} /></tr>
        </tbody>
      </table>
    </ScrollTable>
  );
}

function AgeTable({ s, caption, testId }: { s: InformationSummary; caption: string; testId: string }) {
  return (
    <ScrollTable label={caption}>
      <table data-testid={testId}>
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Age of the score in use</th>{TALLY_HEAD}</tr></thead>
        <tbody>
          {s.age.map((a) => <tr key={a.bucket}><th scope="row">{AGE_BUCKETS.find((b) => b.id === a.bucket)!.label}</th><TallyCells t={a.tally} of={s.population} /></tr>)}
          <tr><th scope="row">No usable score (excluded from age)</th><TallyCells t={{ loans: s.population.loans - s.usable.loans, upb: s.population.upb - s.usable.upb }} of={s.population} /></tr>
          <tr><th scope="row">Selected population (denominator)</th><TallyCells t={s.population} of={s.population} /></tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 13 }}>Median age among loans with a usable score: {age(s.medianAgeMonths).toLowerCase()}.</p>
    </ScrollTable>
  );
}

export function CreditPage() {
  const { state, dispatch, active, baseline } = useStore();
  const [tab, setTab] = useState('changes');
  const f = creditFixture(state.portfolio);
  const population = useMemo(() => selectPopulation(state.portfolio, state.filter), [state.portfolio, state.filter]);
  const appliedKey = state.credit.appliedSnapshotIds.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applied = useMemo(() => snapshotsFor(f, state.credit.appliedSnapshotIds), [f, appliedKey]);
  const refreshApplied = isRefreshApplied(f, state.credit);
  const preview = state.creditPreview;
  const newer = f.snapshots[2];
  const earlierSet = useMemo(() => (refreshApplied ? applied.slice(0, 2) : applied), [refreshApplied, applied]);
  const showChange = preview || refreshApplied;

  const current = useMemo(() => summarize(population, applied, f.analysisDate), [population, applied, f.analysisDate]);
  const cmp = useMemo(() => {
    if (!showChange) return null;
    return {
      earlier: summarize(population, earlierSet, f.analysisDate),
      newer: summarize(population, [...earlierSet, newer], f.analysisDate),
      pairs: comparePairs(population, earlierSet, newer, f.analysisDate),
      snapshot: snapshotCoverage(population, newer, f.analysisDate),
    };
  }, [showChange, population, earlierSet, newer, f.analysisDate]);

  const status = refreshApplied ? 'Newest synthetic refresh applied' : preview ? 'Previewing the newest synthetic refresh (not applied)' : 'Earlier information in use';
  const exportCsv = () => {
    const rows = observationRows(population, f, state.credit.appliedSnapshotIds);
    downloadText(`${safeFileName(state.portfolio.meta.name)}-credit-scores.csv`, toCsv(OBSERVATION_HEADER, rows), 'text/csv');
  };

  return (
    <div className="stack">
      <TermsOnPage ids={['creditScore', 'scoreRefresh', 'scoreCoverage', 'scoreAge', 'scoreVersion', 'analysisDate', 'upb']} />
      <section className="card" data-testid="credit-intro">
        <p className="kicker">Synthetic educational workspace</p>
        <p style={{ margin: '0 0 8px' }}><span className="badge synthetic" data-testid="credit-data-label">{CREDIT_DATA_LABEL}</span></p>
        <p data-testid="credit-core"><strong>A score refresh gives us newer information. It does not itself improve a borrower’s credit or generate investment returns.</strong></p>
        <p className="muted" style={{ margin: 0 }}>
          This page shows how newer <LabelWithHelp label="credit score" term="creditScore" /> information can change what we know about a portfolio, and how to judge whether a decision that uses it is worth its cost.
          The scores are generated in your browser from synthetic loan identifiers. No credit bureau is contacted, no score is ordered, no real borrower data is accepted, and no FICO scoring algorithm is used or implied.
          This is an independent teaching project, not the FICO Score Mortgage Simulator or any FICO product.
        </p>
      </section>

      <section className="card" aria-labelledby="credit-context-h" data-testid="credit-context">
        <h2 id="credit-context-h">What the analysis uses</h2>
        <ScrollTable label="Analysis context">
          <table className="kv">
            <caption className="sr-only">Portfolio, population, analysis date and score information in use</caption>
            <tbody>
              <tr><th scope="row">Portfolio</th><td>{state.portfolio.meta.name} (synthetic)</td></tr>
              <tr><th scope="row">Population</th><td><PopulationBadge /><span className="muted" style={{ fontSize: 13 }}>Every figure on this page uses this population. Loans without a usable score stay in it and in every total.</span></td></tr>
              <tr><th scope="row"><LabelWithHelp label="Analysis date" term="analysisDate" /></th><td data-testid="credit-analysis-date">{formatDate(f.analysisDate)}</td></tr>
              <tr><th scope="row">Score information in use</th><td data-testid="credit-applied"><span className="badge">{status}</span><SnapshotList snaps={applied} /></td></tr>
              <tr><th scope="row">Provenance</th><td className="muted" style={{ fontSize: 13 }}>{CREDIT_PROVENANCE}</td></tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section className="card" aria-labelledby="credit-cov-h">
        <h2 id="credit-cov-h"><LabelWithHelp label="Usable coverage" term="scoreCoverage" /> and <LabelWithHelp label="score age" term="scoreAge" /></h2>
        <p className="muted">For each loan, the most recent usable score among the snapshots in use. If the newest record is missing, unscorable, late or on another <LabelWithHelp label="score version" term="scoreVersion" />, an older usable score is used instead, and its age shows that.</p>
        <div className="two-col">
          <CoverageTable s={current} caption="Coverage of the information in use" testId="credit-coverage" />
          <AgeTable s={current} caption="Age of the score in use" testId="credit-age" />
        </div>
      </section>

      <section className="card" aria-labelledby="credit-refresh-h" data-testid="credit-refresh">
        <h2 id="credit-refresh-h">Refresh (synthetic)</h2>
        <p className="muted">
          Simulating shows what the newest synthetic snapshot ({newer.observedLabel}) would add. It does not draw new random numbers: the same portfolio, snapshot and settings always give the same records.
          Nothing changes until you apply it, and applying it changes only this page’s educational analysis.
        </p>
        <div className="row">
          {!preview && !refreshApplied && <button type="button" className="primary" onClick={() => dispatch({ type: 'creditSimulate' })} data-testid="credit-simulate">Simulate score refresh (synthetic)</button>}
          {preview && (
            <>
              <button type="button" className="primary" onClick={() => dispatch({ type: 'creditApply' })} data-testid="credit-apply">Apply to the educational analysis</button>
              <button type="button" onClick={() => dispatch({ type: 'creditDiscard' })} data-testid="credit-discard">Discard preview</button>
            </>
          )}
          {refreshApplied && <button type="button" onClick={() => dispatch({ type: 'creditRevert' })} data-testid="credit-revert">Revert to the earlier information</button>}
          <button type="button" onClick={exportCsv} data-testid="credit-export-csv">Download score records in use (CSV)</button>
        </div>
        {preview && <Notice kind="info" role="status"><span data-testid="credit-preview-notice"><strong>Preview, not applied.</strong> Tab A compares the earlier information with the newest synthetic snapshot. Apply it to make it the information in use, or discard it.</span></Notice>}
        {refreshApplied && <Notice kind="info" role="status"><span data-testid="credit-applied-notice"><strong>Applied.</strong> The comparison with the earlier information is kept in tab A. Prepayment and servicing results did not change (tab B).</span></Notice>}
      </section>

      <Tabs tabs={TABS} selected={tab} onSelect={setTab} label="Credit score refresh sections" testId="credit-tabs">
        {tab === 'changes' && (cmp ? <Changes cmp={cmp} preview={preview} earlierSet={earlierSet} newer={newer} /> : (
          <section className="card" data-testid="credit-no-change">
            <h2>A. Information changes</h2>
            <p>No newer information yet. Press <strong>Simulate score refresh (synthetic)</strong> above to preview what the newest synthetic snapshot would change.</p>
          </section>
        ))}
        {tab === 'forecast' && <Forecast activeName={active.draft.name} activeInputHash={scenarioInputHash(active.run.outputInput ?? active.draft)} runKey={active.run.output?.runKey ?? baseline.run.output?.runKey ?? null} />}
        {tab === 'breakeven' && <BreakEven inputs={state.credit.breakEven} populationLoans={population.length} onChange={(inputs) => dispatch({ type: 'creditBreakEven', inputs })} />}
        {tab === 'learn' && <Learn population={population} earlierSet={earlierSet} newer={newer} analysisDate={f.analysisDate} />}
      </Tabs>
    </div>
  );
}

type Cmp = { earlier: InformationSummary; newer: InformationSummary; pairs: ReturnType<typeof comparePairs>; snapshot: ReturnType<typeof snapshotCoverage> };

function Changes({ cmp, preview, earlierSet, newer }: { cmp: Cmp; preview: boolean; earlierSet: readonly CreditSnapshot[]; newer: CreditSnapshot }) {
  const { earlier: e, newer: w, pairs: p, snapshot: c } = cmp;
  const noUsable = (s: InformationSummary): Tally => ({ loans: s.population.loans - s.usable.loans, upb: s.population.upb - s.usable.upb });
  const which = preview ? 'Preview, not applied' : 'Applied';
  return (
    <div className="stack" data-testid="credit-changes">
      <section className="card">
        <h2>A. Information changes <span className="tag">{which}</span></h2>
        <p className="muted">
          Computed directly from the synthetic records. Earlier information: {earlierSet.map((s) => s.label).join(' and ')}. Newer: {newer.label}.
          These are changes in what we know, not changes in loan value, prepayment or profit. Colors are not used to mark a change as good or bad.
        </p>
      </section>

      <section className="card">
        <h3>What the newest snapshot returned</h3>
        <ScrollTable label="Newest snapshot records">
          <table data-testid="credit-snapshot-coverage">
            <caption className="sr-only">Records in the newest snapshot for the selected population</caption>
            <thead><tr><th scope="col">Record in {newer.label}</th>{TALLY_HEAD}</tr></thead>
            <tbody>
              <tr><th scope="row">Usable score</th><TallyCells t={c.usable} of={c.population} /></tr>
              <tr><th scope="row">of which from a different source than before</th><TallyCells t={c.otherSource} of={c.population} /></tr>
              {REASONS.map((r) => <tr key={r}><th scope="row">{REASON_LABELS[r]}</th><TallyCells t={c.reasons[r]} of={c.population} /></tr>)}
              <tr><th scope="row">Selected population (denominator)</th><TallyCells t={c.population} of={c.population} /></tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section className="card">
        <h3>Coverage and age, earlier versus newer</h3>
        <ScrollTable label="Earlier versus newer coverage">
          <table data-testid="credit-before-after">
            <caption className="sr-only">Usable coverage and score age with the earlier and the newer information</caption>
            <thead><tr><th scope="col">Measure (denominator: selected population)</th><th scope="col">Earlier information</th><th scope="col">With the newer snapshot</th></tr></thead>
            <tbody>
              <tr><th scope="row">Loans with a usable score</th><td>{n(e.usable.loans)} of {n(e.population.loans)} ({share(e.usable.loans, e.population.loans)})</td><td>{n(w.usable.loans)} of {n(w.population.loans)} ({share(w.usable.loans, w.population.loans)})</td></tr>
              <tr><th scope="row">Balance with a usable score</th><td>{money(e.usable.upb)} of {money(e.population.upb)} ({share(e.usable.upb, e.population.upb)})</td><td>{money(w.usable.upb)} of {money(w.population.upb)} ({share(w.usable.upb, w.population.upb)})</td></tr>
              <tr><th scope="row">Missing or unscorable (no older usable score either)</th><td>{n(e.noUsable.missing.loans + e.noUsable.unscorable.loans)}</td><td>{n(w.noUsable.missing.loans + w.noUsable.unscorable.loans)}</td></tr>
              <tr><th scope="row">No usable score, any reason</th><td>{n(noUsable(e).loans)}</td><td>{n(noUsable(w).loans)}</td></tr>
              <tr><th scope="row">Median score age</th><td>{age(e.medianAgeMonths)}</td><td>{age(w.medianAgeMonths)}</td></tr>
              <tr><th scope="row">Scores 6 months old or less</th><td>{n(e.age[0].tally.loans)}</td><td>{n(w.age[0].tally.loans)}</td></tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section className="card">
        <h3>Direction of change, comparable pairs only</h3>
        <p className="muted">A change is calculated only when the earlier and newer scores are both usable, on the same score version and from the same source. Everything else is listed as excluded with its reason, so the rows add up to the selected population.</p>
        <ScrollTable label="Direction of change">
          <table data-testid="credit-direction">
            <caption className="sr-only">Score increases, decreases and unchanged scores, with excluded loans</caption>
            <thead><tr><th scope="col">Loans</th><th scope="col">Count</th><th scope="col">Share of comparable</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              <tr><th scope="row">Score increased</th><td>{n(p.increased.loans)}</td><td>{share(p.increased.loans, p.comparable.loans)}</td><td>{money(p.increased.upb)}</td></tr>
              <tr><th scope="row">Score decreased</th><td>{n(p.decreased.loans)}</td><td>{share(p.decreased.loans, p.comparable.loans)}</td><td>{money(p.decreased.upb)}</td></tr>
              <tr><th scope="row">Score unchanged</th><td>{n(p.unchanged.loans)}</td><td>{share(p.unchanged.loans, p.comparable.loans)}</td><td>{money(p.unchanged.upb)}</td></tr>
              <tr><th scope="row">Comparable pairs (subtotal)</th><td data-testid="credit-comparable">{n(p.comparable.loans)}</td><td>100.0%</td><td>{money(p.comparable.upb)}</td></tr>
              {EXCLUSIONS.map((x) => <tr key={x}><th scope="row">Excluded: {PAIR_EXCLUSION_LABELS[x]}</th><td>{n(p.excluded[x].loans)}</td><td>Not applicable</td><td>{money(p.excluded[x].upb)}</td></tr>)}
              <tr><th scope="row">Selected population (total)</th><td>{n(p.population.loans)}</td><td></td><td>{money(p.population.upb)}</td></tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section className="card">
        <h3>Score bands, earlier versus newer</h3>
        <p className="muted">Bands apply only to the reference score version. Loans without a usable score keep their place in the total.</p>
        <ScrollTable label="Score bands">
          <table data-testid="credit-bands">
            <caption className="sr-only">Band distribution with the earlier and the newer information</caption>
            <thead><tr><th scope="col">Score band</th><th scope="col">Earlier: loans</th><th scope="col">Earlier: balance</th><th scope="col">Newer: loans</th><th scope="col">Newer: balance</th></tr></thead>
            <tbody>
              {BANDS.map((b) => <tr key={b.id}><th scope="row">{b.label}</th><td>{n(e.bands[b.id].loans)}</td><td>{money(e.bands[b.id].upb)}</td><td>{n(w.bands[b.id].loans)}</td><td>{money(w.bands[b.id].upb)}</td></tr>)}
              <tr><th scope="row">No usable score</th><td>{n(noUsable(e).loans)}</td><td>{money(noUsable(e).upb)}</td><td>{n(noUsable(w).loans)}</td><td>{money(noUsable(w).upb)}</td></tr>
              <tr><th scope="row">Selected population (total)</th><td>{n(e.population.loans)}</td><td>{money(e.population.upb)}</td><td>{n(w.population.loans)}</td><td>{money(w.population.upb)}</td></tr>
            </tbody>
          </table>
        </ScrollTable>
      </section>

      <section className="card">
        <h3>Band movement, comparable pairs only</h3>
        <ScrollTable label="Band movement">
          <table data-testid="credit-movement">
            <caption className="sr-only">Loans moving between bands</caption>
            <thead><tr><th scope="col">Movement</th><th scope="col">Loans</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              <tr><th scope="row">Moved to a higher band</th><td>{n(p.movedUp.loans)}</td><td>{money(p.movedUp.upb)}</td></tr>
              <tr><th scope="row">Stayed in the same band</th><td>{n(p.sameBand.loans)}</td><td>{money(p.sameBand.upb)}</td></tr>
              <tr><th scope="row">Moved to a lower band</th><td>{n(p.movedDown.loans)}</td><td>{money(p.movedDown.upb)}</td></tr>
              <tr><th scope="row">Comparable pairs (denominator)</th><td>{n(p.comparable.loans)}</td><td>{money(p.comparable.upb)}</td></tr>
            </tbody>
          </table>
        </ScrollTable>
        <ScrollTable label="Band migration" style={{ marginTop: 12 }}>
          <table data-testid="credit-migration">
            <caption>Earlier band (rows) to newer band (columns): loans and balance. {n(p.population.loans - p.comparable.loans)} loans are excluded, as listed above.</caption>
            <thead><tr><th scope="col">Earlier band</th>{BANDS.map((b) => <th scope="col" key={b.id}>Newer: {b.label}</th>)}</tr></thead>
            <tbody>
              {BANDS.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.label}</th>
                  {BANDS.map((b) => { const t = p.migration[a.id as BandId][b.id as BandId]; return <td key={b.id}>{t.loans ? <>{n(t.loans)}<br /><span className="muted">{money(t.upb)}</span></> : '0'}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </section>
    </div>
  );
}

function Forecast({ activeName, activeInputHash, runKey }: { activeName: string; activeInputHash: string; runKey: string | null }) {
  return (
    <div className="stack" data-testid="credit-forecast">
      <section className="card">
        <h2>B. Forecast revisions</h2>
        <p className="notice info" data-testid="credit-not-estimated"><strong>{FORECAST_NOT_ESTIMATED}</strong></p>
        <p>
          Applying or reverting a refresh leaves every prepayment and servicing calculation unchanged, because no credit field is an input to the engine.
          The scenario inputs are the portfolio, valuation month, rate path, behavior, servicing and recapture settings; the population filter chooses loans by rate, age, term, balance, state and synthetic refinance propensity, never by score.
        </p>
        <ScrollTable label="Unchanged identifiers">
          <table data-testid="credit-unchanged">
            <caption className="sr-only">Identifiers showing the active scenario is unaffected</caption>
            <tbody>
              <tr><th scope="row">Active scenario</th><td>{activeName}</td></tr>
              <tr><th scope="row">Input fingerprint</th><td><code data-testid="credit-input-hash">{activeInputHash.slice(0, 16)}</code></td></tr>
              <tr><th scope="row">Run key of the current result</th><td><code data-testid="credit-run-key">{runKey ? runKey.slice(0, 16) : 'No result yet'}</code></td></tr>
            </tbody>
          </table>
        </ScrollTable>
        <p className="muted" style={{ fontSize: 13 }}>Both identifiers are the same before and after you apply a refresh. Check them yourself: note them, apply, and come back.</p>
        <p>A score band is not used here to infer default or missed payments, and a score change is not a prepayment forecast.</p>
      </section>
      <section className="card">
        <h3>What a future score-aware model would need (not available)</h3>
        <p>The code defines an extension interface for a model that uses scores, documented in <code>docs/CREDIT_REFRESH.md</code>. No such model exists in this release, and none is offered. A real one would have to:</p>
        <ul>
          <li>run the same scenario twice, once with the earlier and once with the newer information, holding the portfolio, analysis date, market assumptions, model version and every non-credit input fixed;</li>
          <li>report the difference as a forecast revision, which is not realized profit;</li>
          <li>show out-of-sample evidence, on real and permitted data, that the score information improves forecasts.</li>
        </ul>
      </section>
    </div>
  );
}

const FIELDS: { key: keyof BreakEvenInputs; label: string; help: string; step: number }[] = [
  { key: 'billableRefreshes', label: 'Billable refreshes', help: 'How many score refreshes would be paid for.', step: 1 },
  { key: 'unitCost', label: 'Cost per refresh ($)', help: 'Your assumed price per refresh. The app supplies no pricing.', step: 0.01 },
  { key: 'fixedCost', label: 'Fixed implementation cost ($)', help: 'One-time cost to set up, integrate and review.', step: 1 },
  { key: 'actionCost', label: 'Incremental action or campaign cost ($)', help: 'Cost of acting on the information, such as outreach.', step: 1 },
  { key: 'incrementalOutcomes', label: 'Assumed incremental successful outcomes', help: 'Outcomes that would not have happened without the action. Starts at 0: none is assumed.', step: 1 },
  { key: 'contributionPerOutcome', label: 'Net contribution per outcome ($)', help: 'Your assumed net contribution of each incremental outcome, in the same period. May be negative.', step: 1 },
];

function BreakEven({ inputs, populationLoans, onChange }: { inputs: BreakEvenInputs; populationLoans: number; onChange: (i: BreakEvenInputs) => void }) {
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((x) => [x.key, String(inputs[x.key])])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof BreakEvenInputs, raw: string) => {
    setText((t) => ({ ...t, [key]: raw }));
    const v = Number(raw), b = BREAK_EVEN_LIMITS[key];
    if (raw.trim() === '' || !Number.isFinite(v) || v < b.min || v > b.max) {
      setErrors((e) => ({ ...e, [key]: `Enter a number from ${b.min.toLocaleString()} to ${b.max.toLocaleString()}.` }));
      return;
    }
    setErrors((e) => { const x = { ...e }; delete x[key]; return x; });
    onChange({ ...inputs, [key]: v });
  };
  const r = breakEven(inputs);
  const net = r.netBenefit;
  return (
    <div className="stack" data-testid="credit-breakeven">
      <section className="card">
        <h2>C. <LabelWithHelp label="Break-even" term="breakEven" /> calculator (optional)</h2>
        <p>Every input is your assumption. The app supplies no pricing, no response rate, no savings and no return. All inputs start at 0, so nothing is assumed until you enter it.</p>
        <ul className="muted" style={{ fontSize: 13 }}>
          <li><strong>Time horizon:</strong> one decision period. Enter every cost and contribution as a total for the same period. Figures are not discounted; if an outcome pays over several years, enter its present value in today’s dollars.</li>
          <li><strong>Count each outcome once.</strong> If an outcome is a retained refinance, it is the same thing the Scenario lab’s recapture contribution measures. Count it here or there, not both, and do not add this result to a scenario’s value.</li>
          <li><strong><LabelWithHelp label="Incremental" term="incremental" /> means caused by the action.</strong> Measuring that needs a comparison with loans that did not get the action (for example a randomly held-out group). Outcomes that would have happened anyway do not count.</li>
        </ul>
        <div className="two-col">
          <div className="stack">
            {FIELDS.map((x) => (
              <label key={x.key} style={{ display: 'block' }}>
                <span style={{ fontWeight: 600 }}>{x.label}</span>
                <input type="number" inputMode="decimal" step={x.step} min={BREAK_EVEN_LIMITS[x.key].min} max={BREAK_EVEN_LIMITS[x.key].max} value={text[x.key]}
                  onChange={(e) => set(x.key, e.target.value)} aria-invalid={!!errors[x.key]} aria-describedby={`be-${x.key}-help`} data-testid={`be-${x.key}`} style={{ display: 'block', width: '100%', maxWidth: 260 }} />
                <span id={`be-${x.key}-help`} className="muted" style={{ fontSize: 13 }}>{errors[x.key] ? <strong role="alert">{errors[x.key]} </strong> : null}{x.help}</span>
              </label>
            ))}
            <button type="button" onClick={() => { const zero = Object.fromEntries(FIELDS.map((x) => [x.key, 0])) as unknown as BreakEvenInputs; setText(Object.fromEntries(FIELDS.map((x) => [x.key, '0']))); setErrors({}); onChange(zero); }}>Reset calculator to zero</button>
            <button type="button" className="link" onClick={() => set('billableRefreshes' , String(populationLoans))} data-testid="be-use-population">Set billable refreshes to the selected population ({n(populationLoans)} loans)</button>
          </div>
          {Object.keys(errors).length > 0 ? <p className="notice warn" role="status">Finish or reset the highlighted fields to see the break-even result. The last valid inputs are kept until you replace them.</p> : <ScrollTable label="Break-even result">
            <table data-testid="be-results">
              <caption>Result on your assumptions (one period, undiscounted)</caption>
              <tbody>
                <tr><th scope="row">Refresh cost (refreshes × cost per refresh)</th><td>{usd(r.refreshCost)}</td></tr>
                <tr><th scope="row">Total incremental cost</th><td data-testid="be-total-cost">{usd(r.totalCost)}</td></tr>
                <tr><th scope="row">Incremental contribution (outcomes × contribution)</th><td data-testid="be-contribution">{usd(r.incrementalContribution)}</td></tr>
                <tr><th scope="row">Net benefit (contribution minus cost)</th><td data-testid="be-net">{usd(net)}{net < 0 ? ' (a net cost on these assumptions)' : ''}</td></tr>
                <tr><th scope="row">Break-even outcomes</th><td data-testid="be-break-even">{r.breakEvenOutcomes === null ? 'Undefined: each outcome must contribute more than $0' : `${r.breakEvenOutcomes.toLocaleString(undefined, { maximumFractionDigits: 2 })} outcomes`}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 13 }}>This arithmetic shows what would have to be true. It is not evidence that it is true.</p>
          </ScrollTable>}
        </div>
      </section>
    </div>
  );
}

function ObsCell({ o }: { o: ScoreObservation }) {
  return <>{o.score} <span className="muted">({formatDate(o.observedOn)}; {o.scoreModel}; {o.source})</span></>;
}

function Learn({ population, earlierSet, newer, analysisDate }: { population: ReturnType<typeof selectPopulation>; earlierSet: readonly CreditSnapshot[]; newer: CreditSnapshot; analysisDate: string }) {
  const ex = useMemo(() => exampleLoans(population, earlierSet, newer, analysisDate), [population, earlierSet, newer, analysisDate]);
  const late = newer.observations.filter((o) => o.availableOn > analysisDate);
  const row = (label: string, e: ScoreObservation, w: ScoreObservation, meaning: ReactNode) => (
    <tr><th scope="row">{label}: <code>{e.loanId}</code></th><td><ObsCell o={e} /></td><td><ObsCell o={w} /></td><td>{meaning}</td></tr>
  );
  return (
    <div className="stack" data-testid="credit-learn">
      <section className="card">
        <h2>Older versus newer: an example</h2>
        <p className="muted">Three synthetic loans from the selected population. Each earlier score is the one in use before the newest snapshot.</p>
        <ScrollTable label="Example loans">
          <table data-testid="credit-example">
            <caption className="sr-only">Example loans with earlier and newer scores</caption>
            <thead><tr><th scope="col">Loan</th><th scope="col">Earlier score</th><th scope="col">Newer score</th><th scope="col">What it shows</th></tr></thead>
            <tbody>
              {ex.up && row('Improvement', ex.up.earlier, ex.up.newer, <>Up {ex.up.change} points, from {bandLabel(bandOf(ex.up.earlier.score!))} to {bandLabel(bandOf(ex.up.newer.score!))}. We now know more; the loan itself did not change.</>)}
              {ex.down && row('Deterioration', ex.down.earlier, ex.down.newer, <>Down {-ex.down.change} points. A refresh can reveal deterioration as easily as improvement.</>)}
              {ex.version && row('Version change', ex.version.earlier, ex.version.newer, <>Different score versions use different scales, so the two numbers are not subtracted. This is not ordinary migration.</>)}
            </tbody>
          </table>
        </ScrollTable>
      </section>
      <section className="card">
        <h3>Five things to keep straight</h3>
        <ol>
          <li><strong>A refresh is information.</strong> It can reveal improvement or deterioration. It does not change a borrower’s credit or earn anything by itself.</li>
          <li><strong>Score movement is not a prepayment forecast.</strong> This simulator’s prepayment model does not use scores, so no forecast moves (tab B).</li>
          <li><strong>A forecast revision is not realized profit.</strong> Even a better forecast earns nothing until a decision based on it changes cash flows.</li>
          <li><strong>Measuring benefit needs a counterfactual.</strong> To know what an action achieved, compare with what would have happened without it, for example a randomly held-out group.</li>
          <li><strong>Score version changes are not migration.</strong> A new version rescales scores; comparing across versions would invent movement that did not happen.</li>
        </ol>
      </section>
      <section className="card" data-testid="credit-date-rules">
        <h3>Date rules</h3>
        <p>
          Each record has an observed date (when the score was taken) and an available date (when it reached the servicer). The analysis date is {formatDate(analysisDate)}.
          A record counts only if it was available on or before that date. In the newest snapshot, {n(late.length)} records across the whole portfolio arrive after it{late.length ? ` (${formatDate(late[0].availableOn)})` : ''}; for those loans the earlier usable score is used instead.
          Using later records would leak information that was not yet known.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>Every term on this page is defined in <a href={href('glossary')}>the glossary</a>.</p>
      </section>
    </div>
  );
}
