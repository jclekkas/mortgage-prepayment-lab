import { useStore } from '../../app/store';
import { Notice, Progress } from '../../ui/misc';
import { useComparison } from './useComparison';

/** States for the active scenario's result: running, previous run, failure with last good run kept. */
export function RunStatus() {
  const { cancel } = useStore();
  const { actSlot, dirty, isBaseline } = useComparison();
  const r = actSlot.run;
  return (
    <div aria-live="off">
      {r.status === 'running' && (
        <div className="row" style={{ margin: '0.5rem 0' }}>
          <span>Calculating {actSlot.draft.name}…</span>
          <Progress value={r.progress} label="Calculation progress" />
          <button type="button" onClick={() => cancel(actSlot.draft.scenarioId)}>Cancel</button>
        </div>
      )}
      {r.status === 'cancelled' && !r.output && <Notice kind="info">The calculation was cancelled. Press Run to try again.</Notice>}
      {r.status === 'error' && (
        <Notice kind="err" role="alert">
          <strong>The calculation failed:</strong> {r.error}
          {r.isLastGood && ' The results below are the last successful run and are labeled as such.'}
        </Notice>
      )}
      {r.output && !isBaseline && dirty && r.status !== 'running' && (
        <Notice kind="warn">
          <strong>Previous run.</strong> You have changed inputs since these results were calculated. Press Run to update them.
        </Notice>
      )}
      {r.output && r.isLastGood && r.status !== 'error' && <Notice kind="warn">Showing the last good run.</Notice>}
    </div>
  );
}

export function PopulationBadge() {
  const { state, dispatch } = useStore();
  const { actOut } = useComparison();
  if (!actOut) return null;
  const pop = actOut.population;
  return (
    <div className="row" data-testid="population-badge">
      <span className="badge">
        Population: {pop.isFiltered ? `${pop.loanCount.toLocaleString()} of ${pop.totalLoans.toLocaleString()} loans (filtered)` : `all ${pop.totalLoans.toLocaleString()} loans`}
      </span>
      {pop.isFiltered && (
        <button type="button" className="link" onClick={() => dispatch({ type: 'setFilter', filter: {} })}>
          Clear filters
        </button>
      )}
      {pop.isFiltered && Object.keys(state.filter).length > 0 && <span className="muted" style={{ fontSize: '0.85rem' }}>All scenarios use this same population.</span>}
    </div>
  );
}
