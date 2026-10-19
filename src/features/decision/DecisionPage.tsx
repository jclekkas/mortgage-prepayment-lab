import { useEffect, useState } from 'react';
import { href } from '../../app/router';
import { assessSlots, BACKUP_KEY, isDirty, slotLabel, useStore } from '../../app/store';
import { kv } from '../../storage/idb';
import { MODEL_VERSION } from '../../domain/version';
import { diffInputs } from '../../domain/diff';
import { formatMonth } from '../../domain/calendar';
import { pct, usd, years } from '../../domain/format';
import { MODE_LABELS } from '../../domain/scenario';
import type { SummaryMetrics } from '../../domain/types';
import { buildScenarioFile, ImportError, parseScenarioFile, PopulationMismatchError, readFileText, type ImportResult, type DecisionNote } from '../../storage/files';
import { verifyReproduction, type MetricDifference } from '../../storage/verify';
import { downloadText, safeFileName } from '../../storage/exports';
import type { ScenarioFile } from '../../storage/schema';
import { Notice } from '../../ui/misc';
import { PopulationBadge } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, ScenarioCharts } from '../results/ScenarioCharts';
import { GridPanel } from './GridPanel';
import { LabelWithHelp, TermsOnPage } from '../../ui/TermHelp';
import type { TermId } from '../../ui/terms';
import { trendOf, type TrendMetric } from '../../domain/trend';
import { TrendArrow, TrendKey } from '../../ui/TrendArrow';

const METRICS: [string, (s: SummaryMetrics) => string, TermId | undefined, [TrendMetric, (s: SummaryMetrics) => number | null] | undefined][] = [
  ['Current unpaid principal balance (UPB)', (s) => usd(s.currentUpb, { compact: true }), 'upb', ['upb', (s) => s.currentUpb]],
  ['Next-month conditional prepayment rate (CPR)', (s) => pct(s.nextMonthCpr), 'cpr', ['cpr', (s) => s.nextMonthCpr]],
  ['12-month CPR (compounded)', (s) => pct(s.cpr12), undefined, ['cpr12', (s) => s.cpr12]],
  ['12-month prepaid principal', (s) => usd(s.prepaid12, { compact: true }), undefined, ['prepaid12', (s) => s.prepaid12]],
  ['12-month net servicing cash flow', (s) => usd(s.netServicing12, { compact: true }), 'netServicing', ['net12', (s) => s.netServicing12]],
  ['Illustrative servicing net present value (NPV)', (s) => usd(s.servicingNpv, { compact: true }), 'npv', ['npv', (s) => s.servicingNpv]],
  ['Servicing NPV, basis points of balance', (s) => (s.servicingValueBps === null ? 'Not applicable' : s.servicingValueBps.toFixed(1)), 'bp', ['npvBps', (s) => s.servicingValueBps]],
  ['Recapture contribution, present value (PV)', (s) => usd(s.recapturePv, { compact: true }), 'recapture', ['recapturePv', (s) => s.recapturePv]],
  ['Combined contribution (not fair value)', (s) => usd(s.combinedContribution, { compact: true }), undefined, ['combined', (s) => s.combinedContribution]],
  ['Principal weighted-average life (WAL)', (s) => years(s.wal), 'wal', ['wal', (s) => s.wal]],
];

function fmtMetric(v: MetricDifference['saved']): string {
  if (v === 'missing') return 'missing';
  if (v === null) return 'not applicable';
  return String(v);
}

export function DecisionPage() {
  const { state, dispatch, importWorkspace, clearSaved } = useStore();
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string; details?: string[] } | null>(null);
  const [saved, setSaved] = useState<ScenarioFile['results'] | null>(null);
  const [legacy, setLegacy] = useState<ImportResult['legacy']>(null);
  // A saved workspace an earlier visit could not open is kept; offer it as a file.
  const [backup, setBackup] = useState<{ file: string; savedAt?: string } | null>(null);
  useEffect(() => {
    kv.get<{ file: string; savedAt?: string }>(BACKUP_KEY).then((b) => setBackup(b ?? null), () => setBackup(null));
  }, []);
  // One gate for comparing, printing and exporting: every result must be for the current population.
  const assessment = assessSlots(state);
  const { entries, excluded } = entriesFor(state);
  const anyRunning = state.slots.some((s) => s.run.status === 'running');
  // Exported assumptions must be the ones that produced the results, so unrun edits pause the brief and exports.
  const editedUnrun = state.slots.filter((s) => s.draft.scenarioId !== state.baselineId && s.run.output && isDirty(s));
  const settled = assessment.comparable && !anyRunning && editedUnrun.length === 0;

  // After an import, compare every saved metric with the re-run results once all are current.
  useEffect(() => {
    if (!saved || !settled) return;
    if (saved.length === 0) {
      setImportMsg({ kind: 'ok', text: 'Imported. The file had no saved results to compare.' });
    } else if (legacy) {
      // Different model version: show what changed, never call it a reproduction or a failure.
      const name = (id: string) => state.slots.find((s) => s.draft.scenarioId === id)?.draft.name ?? id;
      const report = verifyReproduction(saved, state.slots.map((s) => s.run.output!));
      const details = report.scenarios.flatMap((v) => v.differences.map((d) => `${name(v.scenarioId)}: ${d.metric} was ${fmtMetric(d.saved)} under ${legacy.fromVersion}, now ${fmtMetric(d.actual)}`));
      setImportMsg({
        kind: 'info',
        text: `Recalculated with ${MODEL_VERSION}. This file was made with ${legacy.fromVersion}, so its saved results are listed as the old numbers, not checked as a reproduction. ${legacy.note} ${details.length ? `${details.length} saved number(s) changed:` : 'No saved number changed.'}`,
        details: details.slice(0, 40),
      });
    } else {
      const report = verifyReproduction(saved, state.slots.map((s) => s.run.output!));
      const name = (id: string) => state.slots.find((s) => s.draft.scenarioId === id)?.draft.name ?? id;
      const details = report.scenarios.filter((v) => !v.ok).flatMap((v) => [
        ...v.problems.map((p) => `${name(v.scenarioId)}: ${p}`),
        ...v.differences.map((d) => `${name(v.scenarioId)}: ${d.metric} saved ${fmtMetric(d.saved)}, re-run ${fmtMetric(d.actual)}`),
      ]);
      setImportMsg({
        kind: report.matched === report.total ? 'ok' : 'err',
        text: report.matched === report.total
          ? `Reproduced ${report.matched} of ${report.total} saved results: run keys, input hashes and all ${Object.keys(saved[0].summary).length} summary metrics match within tolerance.`
          : `Did not reproduce: ${report.total - report.matched} of ${report.total} saved results differ from the re-run.`,
        details,
      });
    }
    setSaved(null);
    setLegacy(null);
  }, [saved, settled, state.slots, legacy]);

  const exportJson = () => {
    try {
      const file = buildScenarioFile({ portfolio: state.portfolio, baselineId: state.baselineId, scenarios: state.slots.map((s) => s.run.outputInput ?? s.draft), filter: state.filter, notes: state.notes }, state.slots.map((s) => s.run.output!));
      downloadText(`${safeFileName(state.portfolio.meta.name)}-scenarios.json`, JSON.stringify(file, null, 1), 'application/json');
    } catch (e) {
      setImportMsg({ kind: 'err', text: (e as Error).message, details: e instanceof PopulationMismatchError ? e.problems : undefined });
    }
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await readFileText(f);
      const { workspace, savedResults, legacy: old } = parseScenarioFile(text);
      importWorkspace(workspace);
      setSaved(savedResults);
      setLegacy(old);
      setImportMsg(old
        ? { kind: 'info', text: `Imported assumptions and notes from a file made with model ${old.fromVersion}. Recalculating every scenario with ${MODEL_VERSION}…` }
        : { kind: 'ok', text: 'Imported. Re-running to check the results reproduce…' });
    } catch (e) {
      setImportMsg({ kind: 'err', text: e instanceof ImportError ? e.message : `Import failed: ${(e as Error).message}`, details: e instanceof ImportError ? e.details : undefined });
    }
  };
  const setNote = (id: string, field: keyof DecisionNote, text: string) => {
    const cur = state.notes[id] ?? { whatChanged: '', evidence: '', investigateNext: '' };
    dispatch({ type: 'setNote', id, note: { ...cur, [field]: text.slice(0, 4000) } });
  };
  const focus = entries.find((e) => !e.isBaseline) ?? entries[0];
  const baseItem = assessment.items.find((x) => x.id === state.baselineId);
  const baseSummary = baseItem?.current && baseItem.output ? baseItem.output.summary : null;
  const baseItemInput = state.slots.find((x) => x.draft.scenarioId === state.baselineId)?.run.outputInput ?? null;
  const cell = (id: string, f: (s: SummaryMetrics) => string, trend?: [TrendMetric, (s: SummaryMetrics) => number | null]) => {
    const item = assessment.items.find((x) => x.id === id)!;
    if (item.current && item.output) {
      const s = item.output.summary;
      const slot = state.slots.find((x) => x.draft.scenarioId === id);
      const same = !!slot?.run.outputInput && !!baseItemInput && diffInputs(baseItemInput, slot.run.outputInput).length === 0;
      if (!trend || !baseSummary || id === state.baselineId || same) return f(s);
      return <>{f(s)} <TrendArrow trend={trendOf(trend[0], trend[1](baseSummary), trend[1](s))} /></>;
    }
    if (item.phase === 'running') return 'Calculating…';
    if (!item.output) return 'Not run';
    return 'Not compared: different population';
  };
  return (
    <div className="stack">
      <h1>Decision room</h1>
      <TermsOnPage ids={['upb', 'cpr', 'prepaid', 'npv', 'pv', 'wal', 'bp', 'psa', 'recapture', 'discount']} />
      <p className="muted">Up to four scenarios, including the frozen baseline, on the same valuation date ({formatMonth(state.portfolio.meta.asOfMonth)}) and the same population.</p>
      <PopulationBadge />
      {editedUnrun.length > 0 && (
        <div className="notice warn" role="status" data-testid="edits-unrun">
          <strong>Brief and export are paused.</strong> {editedUnrun.map((s) => s.draft.name).join(', ')} {editedUnrun.length === 1 ? 'has' : 'have'} edits that have not been run, so {editedUnrun.length === 1 ? 'its' : 'their'} columns show the previous run. Run or undo the edits so every result matches the assumptions it was calculated with.
        </div>
      )}
      {!assessment.comparable && (
        <div className="notice warn" role="status" data-testid="comparison-blocked">
          <strong>{anyRunning ? 'Recalculating for the current population.' : 'Comparison, brief and export are unavailable until every scenario has a result for the current population.'}</strong>
          <ul style={{ margin: '0.25rem 0 0' }}>{assessment.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      <section className="card" aria-labelledby="cmp-h">
        <h2 id="cmp-h">Scenario comparison</h2>
        {state.slots.length > 1 && <TrendKey />}
        <p className="muted" style={{ fontSize: '0.85rem' }}>Cash-flow and value rows are the servicer’s. Speed, principal and average-life rows describe timing only; this simulator does not calculate the loan owner’s investment value.</p>
        <div className="table-wrap">
          <table data-testid="compare-table">
            <caption className="sr-only">Scenario comparison</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {state.slots.map((s) => <th scope="col" key={s.draft.scenarioId}>{slotLabel(state, s)}{s.draft.scenarioId !== state.baselineId && isDirty(s) && s.run.output && <><br /><span className="badge dirty">Previous run</span></>}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Model mode</th>
                {state.slots.map((s) => <td key={s.draft.scenarioId}>{MODE_LABELS[(s.run.outputInput ?? s.draft).mode]}</td>)}
              </tr>
              {METRICS.map(([label, f, term, trend]) => (
                <tr key={label}>
                  <th scope="row"><LabelWithHelp label={label} term={term} /></th>
                  {state.slots.map((s) => <td key={s.draft.scenarioId}>{cell(s.draft.scenarioId, f, trend)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ExcludedNotice excluded={excluded} />
      {focus && <ScenarioCharts entries={entries} focus={focus} />}
      <section className="card" aria-labelledby="notes-h">
        <h2 id="notes-h">Your reasoning</h2>
        <p className="muted" style={{ fontSize: '0.88rem' }}>Write down what you think changed, what evidence supports it, and what you would investigate next. A simulation is a hypothesis, not proof.</p>
        <div className="two-col">
          {state.slots.filter((s) => s.draft.scenarioId !== state.baselineId).map((s) => {
            const n = state.notes[s.draft.scenarioId] ?? { whatChanged: '', evidence: '', investigateNext: '' };
            const id = s.draft.scenarioId;
            return (
              <fieldset key={id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem' }}>
                <legend style={{ fontWeight: 600 }}>{s.draft.name}</legend>
                <label htmlFor={`${id}-w`}>What I think changed</label>
                <textarea id={`${id}-w`} value={n.whatChanged} maxLength={4000} onChange={(e) => setNote(id, 'whatChanged', e.target.value)} />
                <label htmlFor={`${id}-e`}>Evidence</label>
                <textarea id={`${id}-e`} value={n.evidence} maxLength={4000} onChange={(e) => setNote(id, 'evidence', e.target.value)} />
                <label htmlFor={`${id}-n`}>What I would investigate next</label>
                <textarea id={`${id}-n`} value={n.investigateNext} maxLength={4000} onChange={(e) => setNote(id, 'investigateNext', e.target.value)} />
              </fieldset>
            );
          })}
        </div>
      </section>
      <GridPanel />
      <section className="card" aria-labelledby="files-h">
        <h2 id="files-h">Brief, files and local data</h2>
        <div className="row">
          {settled ? <a className="button" href={href('brief')} data-testid="open-brief">Open one-page brief</a> : <button type="button" disabled data-testid="open-brief">Open one-page brief</button>}
          <button type="button" onClick={exportJson} disabled={!settled} data-testid="export-json">Export scenarios to a file</button>
          <label className="button" style={{ fontWeight: 400 }}>
            Import scenarios from a file
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} data-testid="import-input" />
          </label>
          <button type="button" onClick={() => void clearSaved()}>Clear data saved on this device</button>
          {backup && (
            <button type="button" onClick={() => downloadText('earlier-saved-workspace.json', backup.file, 'application/json')} data-testid="download-backup">
              Download earlier saved work (could not be opened)
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Files stay on your computer and are plain-text JavaScript Object Notation (JSON) files you can re-import. Imports are limited to 10 megabytes and 10,000 synthetic loans, are checked against a strict schema, and are never migrated or reinterpreted. Saved: {state.storage.savedAt ? new Date(state.storage.savedAt).toLocaleString() : 'not yet'}.
        </p>
        {state.storage.message && <Notice kind={state.storage.status === 'unavailable' ? 'err' : 'info'}>{state.storage.message}</Notice>}
        {importMsg && (
          <div data-testid="import-message">
            <Notice kind={importMsg.kind} role={importMsg.kind === 'err' ? 'alert' : 'status'}>
              {importMsg.text}
              {importMsg.details && importMsg.details.length > 0 && <ul>{importMsg.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
            </Notice>
          </div>
        )}
      </section>
    </div>
  );
}
