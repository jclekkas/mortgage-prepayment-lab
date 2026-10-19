import { currentContext, useStore } from '../../app/store';
import { stalenessReason } from '../../domain/comparability';
import { describeFilter, isFilterEmpty } from '../../domain/segments';
import { Notice, Progress } from '../../ui/misc';
import { useComparison } from './useComparison';

/**
 * States for the active scenario's result: running, cancelled, failed, previous run, and
 * retained results that belong to a different population (never compared or exported).
 */
export function RunStatus() {
  const { cancel, state } = useStore();
  const { actSlot, dirty, isBaseline } = useComparison();
  const r = actSlot.run;
  const stale = r.output ? stalenessReason(r.output, currentContext(state)) : null;
  return (
    <div aria-live="off" data-testid="run-status">
      {r.status === 'running' && (
        <div className="row" style={{ margin: '0.5rem 0' }}>
          <span>Calculating {actSlot.draft.name}…</span>
          <Progress value={r.progress} label="Calculation progress" />
          <button type="button" onClick={() => cancel(actSlot.draft.scenarioId)} data-testid="status-cancel">Cancel</button>
        </div>
      )}
      {r.status === 'cancelled' && (
        <Notice kind="warn">
          <strong>Calculation cancelled.</strong>{' '}
          {!r.output
            ? 'Press Run to try again.'
            : stale
              ? `The retained result is not shown, compared or exported: ${stale} Press Run to calculate it for the current population.`
              : 'The previous result for this population is still shown. Press Run to recalculate.'}
        </Notice>
      )}
      {r.status === 'error' && (
        <Notice kind="err" role="alert">
          <strong>The calculation failed:</strong> {r.error}
          {r.output && (stale ? ` The retained result is not shown, compared or exported: ${stale}` : ' The last successful result for this population is still shown and labeled as such.')}
        </Notice>
      )}
      {r.status === 'running' && stale && r.output && (
        <Notice kind="info">The previous result was for a different population and is hidden until this calculation finishes.</Notice>
      )}
      {r.output && !stale && !isBaseline && dirty && r.status !== 'running' && (
        <Notice kind="warn">
          <strong>Previous run.</strong> You have changed inputs since these results were calculated. Press Run to update them.
        </Notice>
      )}
      {r.output && !stale && r.isLastGood && r.status === 'done' && <Notice kind="warn">Showing the last good run.</Notice>}
    </div>
  );
}

export function PopulationBadge() {
  const { state, dispatch } = useStore();
  const { actOut } = useComparison();
  // Describes the current population from the filter itself, so it stays accurate while results recalculate.
  const filtered = !isFilterEmpty(state.filter);
  const total = state.portfolio.loans.length;
  const count = actOut ? actOut.population.loanCount.toLocaleString() : 'recalculating';
  return (
    <div className="row" data-testid="population-badge">
      <span className="badge" title={describeFilter(state.filter)}>
        Population: {filtered ? `${count} of ${total.toLocaleString()} loans (filtered)` : `all ${total.toLocaleString()} loans`}
      </span>
      {filtered && (
        <button type="button" className="link" onClick={() => dispatch({ type: 'setFilter', filter: {} })}>
          Clear filters
        </button>
      )}
      {filtered && <span className="muted" style={{ fontSize: '0.85rem' }}>All scenarios use this same population.</span>}
    </div>
  );
}
