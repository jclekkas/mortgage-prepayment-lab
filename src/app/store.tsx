import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { loadPreset } from '../data/presets';
import type { ChartHorizon } from '../domain/config';
import type { Lens } from '../domain/narrative';
import { defaultScenario, scenarioInputHash, validateScenario, type FieldError } from '../domain/scenario';
import type { Portfolio, PopulationFilter, RunOutput, ScenarioInput } from '../domain/types';
import { buildScenarioFile, parseScenarioFile, type DecisionNote, type Workspace } from '../storage/files';
import { kv } from '../storage/idb';
import { EngineClient, JobCancelled, JobError } from '../worker/client';

export type Role = 'gm' | 'director' | 'analyst';

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  output: RunOutput | null;
  /** The inputs that produced `output`. */
  outputInput: ScenarioInput | null;
  /** True when output is from an older run kept after a later failure. */
  isLastGood: boolean;
  error: string | null;
  fields: FieldError[];
  progress: number;
  cached: boolean;
}

export interface Slot {
  draft: ScenarioInput;
  undo: ScenarioInput[];
  run: RunState;
}

export interface ExerciseRecord {
  done: boolean;
  prediction?: string;
  correct?: boolean;
}

export interface StorageState {
  status: 'loading' | 'saved' | 'saving' | 'unavailable' | 'cleared';
  savedAt: string | null;
  message: string | null;
}

export interface AppState {
  started: boolean;
  goal: Lens;
  role: Role;
  portfolio: Portfolio;
  baselineId: string;
  slots: Slot[];
  activeId: string;
  filter: PopulationFilter;
  selectedMonth: number | null;
  notes: Record<string, DecisionNote>;
  exercises: Record<string, ExerciseRecord>;
  storage: StorageState;
  announcement: string;
  /** Bumped when the workspace is replaced, so every scenario recalculates. */
  generation: number;
}

const emptyRun = (): RunState => ({ status: 'idle', output: null, outputInput: null, isLastGood: false, error: null, fields: [], progress: 0, cached: false });

let idCounter = 0;
export const newScenarioId = () => `s-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function freshSlots(p: Portfolio): { slots: Slot[]; baselineId: string; activeId: string } {
  const base = defaultScenario(p.meta.hash, p.meta.asOfMonth);
  const s1: ScenarioInput = { ...structuredClone(base), scenarioId: 'scenario-1', name: 'Scenario 1', baselineId: base.scenarioId };
  return {
    baselineId: base.scenarioId,
    activeId: s1.scenarioId,
    slots: [
      { draft: base, undo: [], run: emptyRun() },
      { draft: s1, undo: [], run: emptyRun() },
    ],
  };
}

function initialState(): AppState {
  const portfolio = loadPreset('mixed');
  return {
    started: false,
    goal: 'servicing',
    role: 'gm',
    portfolio,
    ...freshSlots(portfolio),
    filter: {},
    selectedMonth: 0,
    notes: {},
    exercises: {},
    storage: { status: 'loading', savedAt: null, message: null },
    announcement: '',
    generation: 0,
  };
}

type Action =
  | { type: 'start'; goal: Lens; role: Role; portfolio: Portfolio }
  | { type: 'setGoal'; goal: Lens }
  | { type: 'setRole'; role: Role }
  | { type: 'setPortfolio'; portfolio: Portfolio }
  | { type: 'edit'; id: string; next: ScenarioInput }
  | { type: 'undo'; id: string }
  | { type: 'resetToBaseline'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'setHorizon'; id: string; horizon: ChartHorizon }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'addScenario'; scenario: ScenarioInput }
  | { type: 'remove'; id: string }
  | { type: 'setActive'; id: string }
  | { type: 'freeze'; id: string }
  | { type: 'runStart'; id: string }
  | { type: 'runProgress'; id: string; progress: number }
  | { type: 'runDone'; id: string; output: RunOutput; input: ScenarioInput; cached: boolean }
  | { type: 'runFail'; id: string; error: string; fields: FieldError[] }
  | { type: 'runCancelled'; id: string }
  | { type: 'setFilter'; filter: PopulationFilter }
  | { type: 'selectMonth'; index: number | null }
  | { type: 'setNote'; id: string; note: DecisionNote }
  | { type: 'exercise'; id: string; record: ExerciseRecord }
  | { type: 'storage'; storage: Partial<StorageState> }
  | { type: 'restore'; ws: Workspace; goal?: Lens; role?: Role; exercises?: Record<string, ExerciseRecord>; started: boolean }
  | { type: 'announce'; text: string };

const mapSlot = (s: AppState, id: string, fn: (x: Slot) => Slot): Slot[] => s.slots.map((x) => (x.draft.scenarioId === id ? fn(x) : x));

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'start':
      return { ...s, started: true, goal: a.goal, role: a.role, ...(a.portfolio.meta.hash !== s.portfolio.meta.hash ? { portfolio: a.portfolio, ...freshSlots(a.portfolio), filter: {}, notes: {} } : {}) };
    case 'setGoal':
      return { ...s, goal: a.goal };
    case 'setRole':
      return { ...s, role: a.role };
    case 'setPortfolio':
      return { ...s, portfolio: a.portfolio, ...freshSlots(a.portfolio), filter: {}, notes: {}, selectedMonth: 0 };
    case 'edit':
      if (a.id === s.baselineId) return s;
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, draft: a.next, undo: [...x.undo, x.draft].slice(-50) })) };
    case 'undo':
      return { ...s, slots: mapSlot(s, a.id, (x) => (x.undo.length ? { ...x, draft: x.undo[x.undo.length - 1], undo: x.undo.slice(0, -1) } : x)) };
    case 'resetToBaseline': {
      const base = s.slots.find((x) => x.draft.scenarioId === s.baselineId)!.draft;
      return {
        ...s,
        slots: mapSlot(s, a.id, (x) => ({ ...x, undo: [...x.undo, x.draft].slice(-50), draft: { ...structuredClone(base), scenarioId: x.draft.scenarioId, name: x.draft.name, baselineId: s.baselineId } })),
      };
    }
    case 'rename':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, draft: { ...x.draft, name: a.name }, run: x.run.outputInput ? { ...x.run, outputInput: { ...x.run.outputInput, name: a.name } } : x.run })) };
    case 'setHorizon':
      // Presentation only: applies to the draft and the shown run without recalculating (N13).
      return {
        ...s,
        slots: s.slots.map((x) => ({ ...x, draft: { ...x.draft, chartHorizon: a.horizon }, run: x.run.outputInput ? { ...x.run, outputInput: { ...x.run.outputInput, chartHorizon: a.horizon } } : x.run })),
      };
    case 'duplicate': {
      if (s.slots.length >= 4) return s;
      const src = s.slots.find((x) => x.draft.scenarioId === a.id);
      if (!src) return s;
      const draft: ScenarioInput = { ...structuredClone(src.draft), scenarioId: a.newId, name: `${src.draft.name} (copy)`.slice(0, 120), baselineId: s.baselineId };
      return { ...s, slots: [...s.slots, { draft, undo: [], run: emptyRun() }], activeId: a.newId };
    }
    case 'addScenario':
      if (s.slots.length >= 4) return s;
      return { ...s, slots: [...s.slots, { draft: a.scenario, undo: [], run: emptyRun() }], activeId: a.scenario.scenarioId };
    case 'remove': {
      if (a.id === s.baselineId) return s;
      const slots = s.slots.filter((x) => x.draft.scenarioId !== a.id);
      const notes = { ...s.notes };
      delete notes[a.id];
      return { ...s, slots, notes, activeId: s.activeId === a.id ? slots[slots.length - 1].draft.scenarioId : s.activeId };
    }
    case 'setActive':
      return { ...s, activeId: a.id };
    case 'freeze': {
      // The active scenario's last run becomes the new frozen baseline; the old baseline is replaced.
      const src = s.slots.find((x) => x.draft.scenarioId === a.id);
      if (!src?.run.outputInput || !src.run.output) return s;
      const baseSlot: Slot = {
        draft: { ...structuredClone(src.run.outputInput), scenarioId: s.baselineId, name: `Baseline (from ${src.draft.name})`.slice(0, 120), baselineId: null },
        undo: [],
        run: { ...src.run, output: { ...src.run.output, scenarioId: s.baselineId }, outputInput: { ...structuredClone(src.run.outputInput), scenarioId: s.baselineId, baselineId: null } },
      };
      return { ...s, slots: s.slots.map((x) => (x.draft.scenarioId === s.baselineId ? baseSlot : x)), announcement: `${src.draft.name} is now the frozen baseline.` };
    }
    case 'runStart':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, run: { ...x.run, status: 'running', progress: 0, error: null, fields: [] } })) };
    case 'runProgress':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, run: { ...x.run, progress: a.progress } })) };
    case 'runDone':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, run: { status: 'done', output: a.output, outputInput: a.input, isLastGood: false, error: null, fields: [], progress: 1, cached: a.cached } })) };
    case 'runFail':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, run: { ...x.run, status: 'error', error: a.error, fields: a.fields, isLastGood: !!x.run.output } })) };
    case 'runCancelled':
      return { ...s, slots: mapSlot(s, a.id, (x) => ({ ...x, run: { ...x.run, status: x.run.output ? 'done' : 'cancelled', progress: 0 } })) };
    case 'setFilter':
      return { ...s, filter: a.filter };
    case 'selectMonth':
      return { ...s, selectedMonth: a.index };
    case 'setNote':
      return { ...s, notes: { ...s.notes, [a.id]: a.note } };
    case 'exercise':
      return { ...s, exercises: { ...s.exercises, [a.id]: a.record } };
    case 'storage':
      return { ...s, storage: { ...s.storage, ...a.storage } };
    case 'restore': {
      const slots = a.ws.scenarios.map((d) => ({ draft: d, undo: [], run: emptyRun() }));
      const active = slots.find((x) => x.draft.scenarioId !== a.ws.baselineId) ?? slots[0];
      return {
        ...s,
        started: a.started,
        portfolio: a.ws.portfolio,
        baselineId: a.ws.baselineId,
        slots,
        activeId: active.draft.scenarioId,
        filter: a.ws.filter,
        notes: a.ws.notes,
        goal: a.goal ?? s.goal,
        role: a.role ?? s.role,
        exercises: a.exercises ?? s.exercises,
        generation: s.generation + 1,
      };
    }
    case 'announce':
      return { ...s, announcement: a.text };
  }
}

export function isDirty(slot: Slot): boolean {
  if (!slot.run.outputInput) return true;
  return scenarioInputHash(slot.draft) !== scenarioInputHash(slot.run.outputInput);
}

interface Api {
  state: AppState;
  dispatch: (a: Action) => void;
  client: EngineClient;
  run: (id: string) => void;
  /** Replace a scenario's draft and run it immediately. */
  applyAndRun: (next: ScenarioInput) => void;
  cancel: (id: string) => void;
  runAll: () => void;
  baseline: Slot;
  active: Slot;
  draftErrors: FieldError[];
  importWorkspace: (ws: Workspace) => void;
  clearSaved: () => Promise<void>;
}

const Ctx = createContext<Api | null>(null);

const STORAGE_KEY = 'workspace-v1';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const clientRef = useRef<EngineClient | null>(null);
  clientRef.current ??= new EngineClient();
  const client = clientRef.current;
  const latest = useRef(new Map<string, { id: number; cancel: () => void }>());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    client.setPortfolio(state.portfolio);
  }, [client, state.portfolio]);

  const runInput = useCallback(
    (slotId: string, input: ScenarioInput, filter: PopulationFilter, announce: boolean) => {
      const prev = latest.current.get(slotId);
      prev?.cancel(); // supersede any older run for this slot
      const h = client.request({ kind: 'run', scenario: input, filter }, (done, total) => dispatch({ type: 'runProgress', id: slotId, progress: total ? done / total : 1 }));
      latest.current.set(slotId, { id: h.id, cancel: h.cancel });
      dispatch({ type: 'runStart', id: slotId });
      h.promise.then(
        ({ result, cached }) => {
          if (latest.current.get(slotId)?.id !== h.id) return; // stale: a newer run exists
          dispatch({ type: 'runDone', id: slotId, output: result, input, cached });
          if (announce) dispatch({ type: 'announce', text: `Calculation complete for ${input.name}. ${result.population.loanCount} loans.` });
        },
        (e: Error) => {
          if (latest.current.get(slotId)?.id !== h.id) return;
          if (e instanceof JobCancelled) dispatch({ type: 'runCancelled', id: slotId });
          else dispatch({ type: 'runFail', id: slotId, error: e.message, fields: e instanceof JobError ? (e.fields ?? []) : [] });
          if (announce) dispatch({ type: 'announce', text: e instanceof JobCancelled ? 'Calculation cancelled.' : `Calculation failed: ${e.message}` });
        },
      );
    },
    [client],
  );

  const run = useCallback(
    (id: string) => {
      const slot = stateRef.current.slots.find((x) => x.draft.scenarioId === id);
      if (!slot) return;
      runInput(id, slot.draft, stateRef.current.filter, true);
    },
    [runInput],
  );

  const applyAndRun = useCallback(
    (next: ScenarioInput) => {
      dispatch({ type: 'edit', id: next.scenarioId, next });
      runInput(next.scenarioId, next, stateRef.current.filter, true);
    },
    [runInput],
  );

  const runAll = useCallback(() => {
    const s = stateRef.current;
    for (const slot of s.slots) runInput(slot.draft.scenarioId, slot.run.outputInput ?? slot.draft, s.filter, false);
  }, [runInput]);

  const cancel = useCallback((id: string) => latest.current.get(id)?.cancel(), []);

  // Re-run every scenario whenever the population or the portfolio changes, so comparisons share one population.
  const popKey = `${state.generation}|${state.portfolio.meta.hash}|${JSON.stringify(state.filter)}|${state.slots.map((x) => x.draft.scenarioId).join(',')}`;
  useEffect(() => {
    runAll();
  }, [popKey, runAll]);

  // Restore saved workspace once.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    (async () => {
      try {
        const saved = await kv.get<{ savedAt: string; file: string; goal: Lens; role: Role; exercises: Record<string, ExerciseRecord>; started: boolean }>(STORAGE_KEY);
        if (saved) {
          try {
            const { workspace } = parseScenarioFile(saved.file);
            dispatch({ type: 'restore', ws: workspace, goal: saved.goal, role: saved.role, exercises: saved.exercises, started: saved.started });
            dispatch({ type: 'storage', storage: { status: 'saved', savedAt: saved.savedAt, message: null } });
          } catch (e) {
            dispatch({ type: 'storage', storage: { status: 'saved', savedAt: null, message: `A saved workspace could not be restored (${(e as Error).message}). Starting fresh.` } });
          }
        } else dispatch({ type: 'storage', storage: { status: 'saved', savedAt: null, message: null } });
      } catch (e) {
        dispatch({ type: 'storage', storage: { status: 'unavailable', message: `Local storage is unavailable: ${(e as Error).message} Your work stays in this tab only; use Export to keep it.` } });
      }
    })();
  }, []);

  // Debounced save.
  const saveKey = JSON.stringify([state.started, state.goal, state.role, state.portfolio.meta.hash, state.baselineId, state.slots.map((x) => x.draft), state.filter, state.notes, state.exercises]);
  useEffect(() => {
    if (state.storage.status === 'loading' || state.storage.status === 'unavailable') return;
    const t = setTimeout(async () => {
      const s = stateRef.current;
      try {
        const ws: Workspace = { portfolio: s.portfolio, baselineId: s.baselineId, scenarios: s.slots.map((x) => x.draft), filter: s.filter, notes: s.notes };
        const file = JSON.stringify(buildScenarioFile(ws, []));
        const savedAt = new Date().toISOString();
        await kv.set(STORAGE_KEY, { savedAt, file, goal: s.goal, role: s.role, exercises: s.exercises, started: s.started });
        dispatch({ type: 'storage', storage: { status: 'saved', savedAt } });
      } catch (e) {
        dispatch({ type: 'storage', storage: { status: 'unavailable', message: `Could not save on this device: ${(e as Error).message}` } });
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey]);

  const importWorkspace = useCallback((ws: Workspace) => {
    dispatch({ type: 'restore', ws, started: true });
    dispatch({ type: 'announce', text: `Imported ${ws.scenarios.length} scenario(s).` });
  }, []);

  const clearSaved = useCallback(async () => {
    try {
      await kv.clear();
      dispatch({ type: 'storage', storage: { status: 'cleared', savedAt: null, message: 'Saved data was cleared from this device.' } });
    } catch (e) {
      dispatch({ type: 'storage', storage: { status: 'unavailable', message: `Could not clear local data: ${(e as Error).message}` } });
    }
  }, []);

  const baseline = state.slots.find((x) => x.draft.scenarioId === state.baselineId)!;
  const active = state.slots.find((x) => x.draft.scenarioId === state.activeId) ?? baseline;
  const draftErrors = useMemo(() => validateScenario(active.draft), [active.draft]);

  const api: Api = { state, dispatch, client, run, applyAndRun, cancel, runAll, baseline, active, draftErrors, importWorkspace, clearSaved };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}
