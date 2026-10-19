import { useEffect, useState } from 'react';
import { href } from '../../app/router';
import { useStore } from '../../app/store';
import { formatMonth } from '../../domain/calendar';
import { pct, usd, years } from '../../domain/format';
import { MODE_LABELS } from '../../domain/scenario';
import type { SummaryMetrics } from '../../domain/types';
import { buildScenarioFile, ImportError, parseScenarioFile, readFileText, type DecisionNote } from '../../storage/files';
import { downloadText, safeFileName } from '../../storage/exports';
import type { ScenarioFile } from '../../storage/schema';
import { Notice } from '../../ui/misc';
import { PopulationBadge } from '../results/RunStatus';
import { entriesFor, ScenarioCharts } from '../results/ScenarioCharts';
import { GridPanel } from './GridPanel';

const METRICS: [string, (s: SummaryMetrics) => string][] = [
  ['Current UPB', (s) => usd(s.currentUpb, { compact: true })],
  ['Month-1 CPR', (s) => pct(s.nextMonthCpr)],
  ['12-month CPR (geometric)', (s) => pct(s.cpr12)],
  ['12-month prepaid principal', (s) => usd(s.prepaid12, { compact: true })],
  ['12-month net servicing cash flow', (s) => usd(s.netServicing12, { compact: true })],
  ['Illustrative servicing NPV', (s) => usd(s.servicingNpv, { compact: true })],
  ['Servicing NPV, bps of UPB', (s) => (s.servicingValueBps === null ? 'Not applicable' : s.servicingValueBps.toFixed(1))],
  ['Recapture contribution PV', (s) => usd(s.recapturePv, { compact: true })],
  ['Combined contribution (not fair value)', (s) => usd(s.combinedContribution, { compact: true })],
  ['Principal weighted-average life', (s) => years(s.wal)],
];

export function DecisionPage() {
  const { state, dispatch, importWorkspace, clearSaved } = useStore();
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'err'; text: string; details?: string[] } | null>(null);
  const [saved, setSaved] = useState<ScenarioFile['results'] | null>(null);
  const entries = entriesFor(state.slots, state.baselineId);
  const allDone = state.slots.every((s) => s.run.status === 'done' && s.run.output);

  // After an import, compare re-run results with the results stored in the file.
  useEffect(() => {
    if (!saved || !allDone) return;
    const matched = saved.filter((r) => state.slots.some((s) => s.run.output?.scenarioId === r.scenarioId && s.run.output.runKey === r.runKey && s.run.output.summary.servicingNpv === r.summary.servicingNpv)).length;
    setImportMsg({ kind: matched === saved.length ? 'ok' : 'err', text: saved.length === 0 ? 'Imported. The file had no saved results to compare.' : `Reproduced ${matched} of ${saved.length} saved results exactly (same run key and NPV).` });
    setSaved(null);
  }, [saved, allDone, state.slots]);

  const exportJson = () => {
    const file = buildScenarioFile({ portfolio: state.portfolio, baselineId: state.baselineId, scenarios: state.slots.map((s) => s.run.outputInput ?? s.draft), filter: state.filter, notes: state.notes }, state.slots.map((s) => s.run.output!).filter(Boolean));
    downloadText(`${safeFileName(state.portfolio.meta.name)}-scenarios.json`, JSON.stringify(file, null, 1), 'application/json');
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await readFileText(f);
      const { workspace, savedResults } = parseScenarioFile(text);
      importWorkspace(workspace);
      setSaved(savedResults);
      setImportMsg({ kind: 'ok', text: 'Imported. Re-running to check the results reproduce…' });
    } catch (e) {
      setImportMsg({ kind: 'err', text: e instanceof ImportError ? e.message : `Import failed: ${(e as Error).message}`, details: e instanceof ImportError ? e.details : undefined });
    }
  };
  const setNote = (id: string, field: keyof DecisionNote, text: string) => {
    const cur = state.notes[id] ?? { whatChanged: '', evidence: '', investigateNext: '' };
    dispatch({ type: 'setNote', id, note: { ...cur, [field]: text.slice(0, 4000) } });
  };
  const focus = entries.find((e) => !e.isBaseline) ?? entries[0];
  return (
    <div className="stack">
      <h1>Decision room</h1>
      <p className="muted">Up to four scenarios, including the frozen baseline, on the same valuation date ({formatMonth(state.portfolio.meta.asOfMonth)}) and the same population.</p>
      <PopulationBadge />
      <section className="card" aria-labelledby="cmp-h">
        <h2 id="cmp-h">Scenario comparison</h2>
        <div className="table-wrap">
          <table data-testid="compare-table">
            <caption className="sr-only">Scenario comparison</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {state.slots.map((s) => <th scope="col" key={s.draft.scenarioId}>{s.draft.scenarioId === state.baselineId && !s.draft.name.toLowerCase().startsWith('baseline') ? `Baseline: ${s.draft.name}` : s.draft.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Model mode</th>
                {state.slots.map((s) => <td key={s.draft.scenarioId}>{MODE_LABELS[(s.run.outputInput ?? s.draft).mode]}</td>)}
              </tr>
              {METRICS.map(([label, f]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {state.slots.map((s) => <td key={s.draft.scenarioId}>{s.run.output ? f(s.run.output.summary) : s.run.status === 'running' ? 'Calculating…' : 'Not run'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
          <a className="button" href={href('brief')} data-testid="open-brief">Open one-page brief</a>
          <button type="button" onClick={exportJson} disabled={!allDone} data-testid="export-json">Export scenarios (JSON)</button>
          <label className="button" style={{ fontWeight: 400 }}>
            Import scenarios (JSON)
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} data-testid="import-input" />
          </label>
          <button type="button" onClick={() => void clearSaved()}>Clear data saved on this device</button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Files stay on your computer. Imports are limited to 10 MB and 10,000 synthetic loans, are checked against a strict schema, and are never migrated or reinterpreted. Saved: {state.storage.savedAt ? new Date(state.storage.savedAt).toLocaleString() : 'not yet'}.
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
