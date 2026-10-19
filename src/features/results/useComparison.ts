import { isDirty, useStore, type Slot } from '../../app/store';
import type { RunOutput, ScenarioInput } from '../../domain/types';

export interface Pair {
  baseSlot: Slot;
  actSlot: Slot;
  baseOut: RunOutput | null;
  actOut: RunOutput | null;
  baseInput: ScenarioInput | null;
  actInput: ScenarioInput | null;
  ready: boolean;
  dirty: boolean;
  isBaseline: boolean;
}

export function useComparison(): Pair {
  const { baseline, active, state } = useStore();
  const baseOut = baseline.run.output;
  const actOut = active.run.output;
  return {
    baseSlot: baseline,
    actSlot: active,
    baseOut,
    actOut,
    baseInput: baseline.run.outputInput,
    actInput: active.run.outputInput,
    ready: !!(baseOut && actOut && baseline.run.outputInput && active.run.outputInput),
    dirty: isDirty(active),
    isBaseline: active.draft.scenarioId === state.baselineId,
  };
}
