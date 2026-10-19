import { useState } from 'react';
import { useStore } from '../../app/store';
import { Explanation } from '../results/Explanation';
import { FormulaDrawer } from '../results/FormulaDrawer';
import { InvestorPanel } from '../results/InvestorPanel';
import { KpiCards } from '../results/KpiCards';
import { FullLedger, MonthLedger } from '../results/LedgerPanel';
import { RecapturePanel } from '../results/RecapturePanel';
import { PopulationBadge, RunStatus } from '../results/RunStatus';
import { entriesFor, ExcludedNotice, ScenarioCharts } from '../results/ScenarioCharts';
import { SensitivityPanel } from '../results/SensitivityPanel';
import { Controls } from './Controls';
import { RunBar } from './RunBar';

export function LabPage() {
  const { state, active, baseline } = useStore();
  const [lens, setLens] = useState<'servicing' | 'investor'>(state.goal === 'investor' ? 'investor' : 'servicing');
  const { entries, excluded } = entriesFor(state, state.slots.filter((s) => s === baseline || s === active));
  const focus = entries.find((e) => e.output.scenarioId === active.draft.scenarioId);
  // Only a result for the current population is shown in detail or exported.
  const out = focus ? active.run.output : null;
  const input = focus ? active.run.outputInput : null;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Scenario lab: {active.draft.name}</h1>
        <PopulationBadge />
      </div>
      <div className="lab-layout">
        <section aria-labelledby="assump-h" className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1rem 0' }}>
            <h2 id="assump-h">Assumptions</h2>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Change one thing at a time, run, and compare with the frozen baseline (dashed grey).</p>
          </div>
          <div style={{ padding: '0 1rem' }}>
            <Controls />
          </div>
          <RunBar />
        </section>
        <section aria-labelledby="results-h" className="stack" style={{ minWidth: 0 }}>
          <h2 id="results-h" className="sr-only">Results</h2>
          <RunStatus />
          <KpiCards />
          <div role="tablist" aria-label="Economic lens" className="chips">
            <button role="tab" type="button" className="chip" aria-selected={lens === 'servicing'} onClick={() => setLens('servicing')}>Servicing economics</button>
            <button role="tab" type="button" className="chip" aria-selected={lens === 'investor'} onClick={() => setLens('investor')} data-testid="lens-investor">Loan owner cash flows</button>
          </div>
          <ExcludedNotice excluded={excluded} />
          {focus && out && input ? (
            lens === 'servicing' ? (
              <>
                <ScenarioCharts entries={entries} focus={focus} />
                <MonthLedger out={out} baseOut={baseline.run.output} name={active.draft.name} />
                <FormulaDrawer out={out} input={input} />
                <RecapturePanel out={out} input={input} baseOut={baseline.run.output} />
                {state.role !== 'gm' && <SensitivityPanel input={input} />}
                <details className="drawer" open={state.role === 'analyst'}>
                  <summary>Monthly portfolio ledger table</summary>
                  <FullLedger out={out} horizon={input.chartHorizon} />
                </details>
              </>
            ) : (
              <>
                <InvestorPanel out={out} baseOut={baseline.run.output} name={active.draft.name} />
                <MonthLedger out={out} baseOut={baseline.run.output} name={active.draft.name} />
              </>
            )
          ) : (
            <p className="muted" data-testid="no-current-result">{active.run.status === 'running' ? 'Calculating for the current population…' : 'No result for the current population yet. Run the scenario to see results.'}</p>
          )}
          {state.role === 'gm' && out && input && lens === 'servicing' && (
            <details className="drawer">
              <summary>Sensitivities (one factor at a time)</summary>
              <SensitivityPanel input={input} />
            </details>
          )}
        </section>
        <aside className="explain-col" aria-label="Explanation">
          <Explanation />
        </aside>
      </div>
    </div>
  );
}
