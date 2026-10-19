import { useState } from 'react';
import { isDirty, newScenarioId, useStore } from '../../app/store';

export function RunBar() {
  const { state, dispatch, active, run, cancel, draftErrors } = useStore();
  const d = active.draft;
  const frozen = d.scenarioId === state.baselineId;
  const dirty = isDirty(active);
  const running = active.run.status === 'running';
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(d.name);
  return (
    <>
    <div className="run-bar" data-testid="run-bar">
      {draftErrors.length > 0 && (
        <div className="notice err" role="alert" style={{ width: '100%', margin: 0 }}>
          {draftErrors.map((e) => <div key={e.field + e.message}>{e.message}</div>)}
        </div>
      )}
      <button type="button" className="primary" onClick={() => run(d.scenarioId)} disabled={draftErrors.length > 0 || frozen} aria-busy={running} data-testid="run">
        {running ? 'Running…' : 'Run'}
      </button>
      {running && <button type="button" onClick={() => cancel(d.scenarioId)} data-testid="cancel">Cancel</button>}
      {!frozen && <span className={`badge ${dirty ? 'dirty' : 'ok'}`} data-testid="dirty-badge">{dirty ? 'Unsaved changes: not yet run' : 'Results match inputs'}</span>}
      <button type="button" onClick={() => dispatch({ type: 'undo', id: d.scenarioId })} disabled={frozen || active.undo.length === 0}>Undo last edit</button>
    </div>
    <div className="row scenario-actions" aria-label="Scenario actions" role="group">
      <button type="button" onClick={() => dispatch({ type: 'resetToBaseline', id: d.scenarioId })} disabled={frozen}>Reset to baseline</button>
      <button type="button" onClick={() => dispatch({ type: 'duplicate', id: d.scenarioId, newId: newScenarioId() })} disabled={state.slots.length >= 4} title={state.slots.length >= 4 ? 'Up to four scenarios including the baseline' : undefined}>
        Duplicate
      </button>
      {renaming ? (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const n = name.trim().slice(0, 120); if (n) dispatch({ type: 'rename', id: d.scenarioId, name: n }); setRenaming(false); }}>
          <label className="sr-only" htmlFor="rename">Scenario name</label>
          <input id="rename" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit">Save name</button>
        </form>
      ) : (
        <button type="button" onClick={() => { setName(d.name); setRenaming(true); }}>Rename</button>
      )}
      <button type="button" onClick={() => dispatch({ type: 'freeze', id: d.scenarioId })} disabled={frozen || dirty || !active.run.output} title={dirty ? 'Run the scenario first' : undefined} data-testid="freeze">
        Freeze as baseline
      </button>
      {!frozen && <button type="button" onClick={() => dispatch({ type: 'remove', id: d.scenarioId })}>Delete scenario</button>}
    </div>
    </>
  );
}
