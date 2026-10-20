import { useEffect, useRef, useState } from 'react';
import { isDirty, newScenarioId, useStore, type Role } from '../../app/store';
import { CTRL_W, clampCtrlW, usePref } from '../../app/prefs';
import { Explanation, ShortHeadline } from '../results/Explanation';
import { FormulaDrawer } from '../results/FormulaDrawer';
import { InvestorPanel } from '../results/InvestorPanel';
import { KpiCards } from '../results/KpiCards';
import { MonthLedger } from '../results/LedgerPanel';
import { BookPanel } from '../results/BookPanel';
import { RecapturePanel } from '../results/RecapturePanel';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, ScenarioCharts } from '../results/ScenarioCharts';
import { SensitivityPanel } from '../results/SensitivityPanel';
import { usePerspective } from '../results/Perspective';
import { Controls } from './Controls';
import { TermsOnPage } from '../../ui/TermHelp';
import { Tabs } from '../../ui/Tabs';

const SERVICER_TABS = [
  { id: 'charts', label: 'Charts' }, { id: 'ledger', label: 'Month ledger' }, { id: 'formulas', label: 'Formulas' },
  { id: 'recapture', label: 'Recapture' }, { id: 'sensitivities', label: 'Sensitivities' }, { id: 'book', label: 'Month by month' },
];
const OWNER_TABS = [{ id: 'owner', label: 'Owner cash flows' }, { id: 'ledger', label: 'Month ledger' }];
/** "Opens by default": which results tab each role sees first. It never changes formulas or what can be opened. */
const FIRST_TAB: Record<Role, string> = { gm: 'charts', director: 'sensitivities', analyst: 'ledger' };

export function LabPage() {
  const { state, active, baseline } = useStore();
  const owner = usePerspective() === 'owner';
  const { entries, excluded } = entriesFor(state, state.slots.filter((s) => s === baseline || s === active));
  const focus = entries.find((e) => e.output.scenarioId === active.draft.scenarioId);
  // Only a result for the current population is shown in detail or exported.
  const out = focus ? active.run.output : null;
  const input = focus ? active.run.outputInput : null;
  const [tab, setTab] = useState(FIRST_TAB[state.role]);
  useEffect(() => setTab(FIRST_TAB[state.role]), [state.role]);
  const [ctrlW, setCtrlW] = usePref<number>('ctrlW', CTRL_W.initial);
  const tabs = owner ? OWNER_TABS : SERVICER_TABS;
  const shownTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <div className="lab-split" style={{ ['--ctrl-w' as string]: `${clampCtrlW(ctrlW)}px` }}>
      <AssumptionsPanel />
      <SplitHandle width={clampCtrlW(ctrlW)} onWidth={(w) => setCtrlW(clampCtrlW(w))} />
      <section aria-labelledby="results-h" className="lab-results" style={{ minWidth: 0 }}>
        <h2 id="results-h" className="sr-only">Results: {active.draft.name}</h2>
        <PopulationBadge />
        <RunStatus />
        <KpiCards />
        <ShortHeadline size="lab" />
        <Explanation variant="details" />
        <ExcludedNotice excluded={excluded} />
        {focus && out && input ? (
          <>
            {isDirty(active) && active.draft.scenarioId !== state.baselineId && <p className="notice warn" data-testid="charts-stale"><strong>Previous run.</strong> The charts and ledger below are from the last run. Press Run to include your edits.</p>}
            <h2 className="sr-only" data-testid="detail-perspective">Details: {owner ? 'loan owner' : 'servicer'} perspective</h2>
            <Tabs tabs={tabs} selected={shownTab} onSelect={setTab} label={`Result details, ${owner ? 'loan owner' : 'servicer'} perspective`} testId="lab-tabs">
              {shownTab === 'charts' && <ScenarioCharts entries={entries} focus={focus} />}
              {shownTab === 'ledger' && <MonthLedger out={out} baseOut={baseline.run.output} name={active.draft.name} />}
              {shownTab === 'formulas' && <FormulaDrawer out={out} input={input} />}
              {shownTab === 'recapture' && <RecapturePanel out={out} input={input} baseOut={baseline.run.output} />}
              {shownTab === 'sensitivities' && <SensitivityPanel input={input} />}
              {shownTab === 'book' && <BookPanel out={out} name={active.draft.name} horizon={input.chartHorizon} onOpenMonth={() => setTab('ledger')} />}
              {shownTab === 'owner' && <InvestorPanel out={out} baseOut={baseline.run.output} name={active.draft.name} />}
            </Tabs>
          </>
        ) : (
          <p className="muted" data-testid="no-current-result">{active.run.status === 'running' ? 'Calculating for the current population…' : 'No result for the current population yet. Run the scenario to see results.'}</p>
        )}
        <TermsOnPage ids={['bp', 'ppt', 'cpr', 'smm', 'psa', 'upb', 'npv', 'pv', 'wal', 'prepaid', 'msr', 'mbs', 'incentive', 'friction', 'turnover', 'burnout', 'discount', 'servicingFee', 'netServicing', 'recapture']} />
      </section>
    </div>
  );
}

function SplitHandle({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <div className="split-handle" role="separator" aria-orientation="vertical" aria-label="Resize the assumptions panel"
      aria-valuenow={width} aria-valuemin={CTRL_W.min} aria-valuemax={CTRL_W.max} tabIndex={0}
      title="Drag, or use the arrow keys, to resize. Double-click to reset."
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { onWidth(width - 20); e.preventDefault(); }
        if (e.key === 'ArrowRight') { onWidth(width + 20); e.preventDefault(); }
      }}
      onDoubleClick={() => onWidth(CTRL_W.initial)}
      onPointerDown={(e) => {
        e.preventDefault();
        drag.current = { x: e.clientX, w: width };
        const move = (ev: PointerEvent) => { if (drag.current) onWidth(drag.current.w + ev.clientX - drag.current.x); };
        const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }} />
  );
}

function AssumptionsPanel() {
  const { state, dispatch, active } = useStore();
  const d = active.draft;
  const frozen = d.scenarioId === state.baselineId;
  const dirty = isDirty(active);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(d.name);
  return (
    <section aria-labelledby="assump-h" className="card assump">
      <div className="assump-head">
        <p className="kicker">Assumptions</p>
        {renaming ? (
          <form className="row" onSubmit={(e) => { e.preventDefault(); const n = name.trim().slice(0, 120); if (n) dispatch({ type: 'rename', id: d.scenarioId, name: n }); setRenaming(false); }}>
            <label className="sr-only" htmlFor="rename">Scenario name</label>
            <input id="rename" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus style={{ flex: 1, minWidth: 0 }} />
            <button type="submit">Save name</button>
          </form>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <h2 id="assump-h" style={{ margin: 0 }}>{d.name}</h2>
            <button type="button" className="ghost" onClick={() => { setName(d.name); setRenaming(true); }}>Rename</button>
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {frozen
            ? 'This is the frozen baseline: the starting assumptions, kept fixed for comparison. Pick a scenario tab to make changes.'
            : 'Edits apply to this scenario only and take effect when you press Run. The frozen baseline keeps the starting assumptions for comparison (dashed grey in charts).'}
        </p>
      </div>
      <div className="assump-body">
        <Controls />
      </div>
      <div className="assump-foot" role="group" aria-label="Scenario actions">
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'undo', id: d.scenarioId })} disabled={frozen || active.undo.length === 0}>Undo</button>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'resetToBaseline', id: d.scenarioId })} disabled={frozen}>Reset to baseline</button>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'duplicate', id: d.scenarioId, newId: newScenarioId() })} disabled={state.slots.length >= 4} title={state.slots.length >= 4 ? 'Up to four scenarios including the baseline' : undefined}>
          Duplicate
        </button>
        <button type="button" className="ghost" onClick={() => dispatch({ type: 'freeze', id: d.scenarioId })} disabled={frozen || dirty || !active.run.output} title={dirty ? 'Run the scenario first' : 'Replace the frozen baseline with this scenario’s last run'} data-testid="freeze">
          Make baseline
        </button>
        {!frozen && <button type="button" className="ghost" onClick={() => dispatch({ type: 'remove', id: d.scenarioId })}>Delete</button>}
      </div>
    </section>
  );
}
