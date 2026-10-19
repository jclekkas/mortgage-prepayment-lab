import { currentContext, isDirty, useStore, type Slot } from '../../app/store';
import { stalenessReason } from '../../domain/comparability';
import type { RunOutput, ScenarioInput } from '../../domain/types';

export interface Pair {
  baseSlot: Slot;
  actSlot: Slot;
  /** Results only when they belong to the current portfolio, valuation month and population; otherwise null. */
  baseOut: RunOutput | null;
  actOut: RunOutput | null;
  baseInput: ScenarioInput | null;
  actInput: ScenarioInput | null;
  /** True when both results are current and can be compared. */
  ready: boolean;
  /** Why a side is excluded, for display; empty when ready. */
  blockers: string[];
  dirty: boolean;
  isBaseline: boolean;
}

export function useComparison(): Pair {
  const { baseline, active, state } = useStore();
  const ctx = currentContext(state);
  const why = (s: Slot) => stalenessReason(s.run.output, ctx);
  const baseWhy = why(baseline);
  const actWhy = why(active);
  const isBaseline = active.draft.scenarioId === state.baselineId;
  const blockers = [
    ...(baseWhy && baseline.run.output ? [`Baseline: ${baseWhy}`] : []),
    ...(actWhy && active.run.output && !isBaseline ? [`${active.draft.name}: ${actWhy}`] : []),
  ];
  return {
    baseSlot: baseline,
    actSlot: active,
    baseOut: baseWhy ? null : baseline.run.output,
    actOut: actWhy ? null : active.run.output,
    baseInput: baseWhy ? null : baseline.run.outputInput,
    actInput: actWhy ? null : active.run.outputInput,
    ready: !baseWhy && !actWhy && !!baseline.run.outputInput && !!active.run.outputInput,
    blockers,
    dirty: isDirty(active),
    isBaseline,
  };
}
