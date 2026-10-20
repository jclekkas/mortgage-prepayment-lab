import { useStore } from '../../app/store';

export type Perspective = 'servicer' | 'owner';

/** One perspective for cards, charts, arrows and explanations, stored with the learner's goal. */
export function usePerspective(): Perspective {
  const { state } = useStore();
  return state.goal === 'investor' ? 'owner' : 'servicer';
}

export function PerspectiveSwitch() {
  const { dispatch } = useStore();
  const p = usePerspective();
  return (
    <div role="radiogroup" aria-label="Perspective for headline measures, charts and explanations" className="seg" data-testid="perspective-switch">
      <span className="seg-label" aria-hidden="true">Perspective</span>
      <button type="button" role="radio" aria-checked={p === 'servicer'} onClick={() => dispatch({ type: 'setGoal', goal: 'servicing' })} data-testid="perspective-servicer">
        Servicer
      </button>
      <button type="button" role="radio" aria-checked={p === 'owner'} onClick={() => dispatch({ type: 'setGoal', goal: 'investor' })} data-testid="perspective-owner">
        Loan owner
      </button>
    </div>
  );
}
