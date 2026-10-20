import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';

export function ScenarioManagement() {
  const { state, active, dispatch } = useStore();
  const [target, setTarget] = useState<{ id: string; name: string } | 'all' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const count = state.slots.length - 1;
  const frozen = active.draft.scenarioId === state.baselineId;
  useEffect(() => {
    if (target) { dialog.current?.showModal(); cancel.current?.focus(); }
    else dialog.current?.close();
  }, [target]);
  const remove = () => {
    if (target === 'all') dispatch({ type: 'removeAllScenarios' });
    else if (target) dispatch({ type: 'remove', id: target.id });
    setTarget(null);
  };
  return <div className="scenario-management" role="group" aria-label="Delete scenarios">
    <span>{frozen ? 'Baseline selected — kept for comparison.' : `Selected: ${active.draft.name}`}</span>
    <button type="button" disabled={frozen} onClick={() => setTarget({ id: active.draft.scenarioId, name: active.draft.name })}>Delete selected scenario</button>
    <button type="button" disabled={count === 0} onClick={() => setTarget('all')}>Delete all scenarios ({count})</button>
    <span className="muted">Baseline stays. To wipe the entire workspace, use Home → Clear workspace and start over.</span>
    <dialog ref={dialog} className="dialog reset-dialog" aria-labelledby="delete-scenarios-title" onCancel={() => setTarget(null)}>
      <h2 id="delete-scenarios-title">{target === 'all' ? 'Delete all comparison scenarios?' : `Delete “${target?.name ?? ''}”?`}</h2>
      <p>{target === 'all' ? `This deletes all ${count} comparison scenarios, their results and their decision notes.` : 'This deletes the selected scenario, its results and its decision notes.'} This cannot be undone.</p>
      <p>Your portfolio, frozen baseline, filters, lessons and credit refresh selections stay. Choose + New scenario afterward to start a new comparison.</p>
      <div className="row"><button ref={cancel} type="button" onClick={() => setTarget(null)}>Keep my scenarios</button><button type="button" onClick={remove}>{target === 'all' ? 'Confirm delete all scenarios' : 'Confirm delete scenario'}</button></div>
    </dialog>
  </div>;
}
