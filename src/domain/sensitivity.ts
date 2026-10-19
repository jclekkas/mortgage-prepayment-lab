/**
 * One-factor-at-a-time sensitivities and the two-dimensional grid. OFAT effects are
 * NOT additive: interactions mean their sum is not the total change, and the UI says so.
 */
import { BOUNDS } from './config';
import { runScenario } from './engine';
import type { ModelMode, Portfolio, PopulationFilter, ScenarioInput, SummaryMetrics } from './types';

export interface SensitivityFactor {
  id: string;
  label: string;
  /** Plain description of the change applied. */
  change: string;
  apply: (s: ScenarioInput) => ScenarioInput | null;
}

const clone = (s: ScenarioInput): ScenarioInput => structuredClone(s);

const within = (v: number, b: { min: number; max: number }) => v >= b.min - 1e-12 && v <= b.max + 1e-12;

function factorsFor(mode: ModelMode): SensitivityFactor[] {
  const common: SensitivityFactor[] = [
    {
      id: 'discount',
      label: 'Discount rate',
      change: '+1 percentage point',
      apply: (s) => {
        const v = s.servicingParameters.discountRate + 0.01;
        if (!within(v, BOUNDS.discountRate)) return null;
        const n = clone(s);
        n.servicingParameters.discountRate = v;
        return n;
      },
    },
    {
      id: 'cost',
      label: 'Cost per active loan',
      change: '+$25 a year',
      apply: () => null, // handled by costBump, which needs the portfolio
    },
  ];
  if (mode === 'behavioral') {
    return [
      {
        id: 'rate',
        label: 'Mortgage offer rate',
        change: '-100 bps shock',
        apply: (s) => {
          const v = s.ratePath.shockBps - 100;
          if (!within(v, BOUNDS.shockBps)) return null;
          const n = clone(s);
          n.ratePath.shockBps = v;
          return n;
        },
      },
      {
        id: 'refi',
        label: 'Refinance response',
        change: '+0.25 multiplier',
        apply: (s) => {
          const v = s.behavioralParameters.refiMultiplier + 0.25;
          if (!within(v, BOUNDS.refiMultiplier)) return null;
          const n = clone(s);
          n.behavioralParameters.refiMultiplier = v;
          return n;
        },
      },
      {
        id: 'turnover',
        label: 'Turnover',
        change: '+0.25 multiplier',
        apply: (s) => {
          const v = s.behavioralParameters.turnoverMultiplier + 0.25;
          if (!within(v, BOUNDS.turnoverMultiplier)) return null;
          const n = clone(s);
          n.behavioralParameters.turnoverMultiplier = v;
          return n;
        },
      },
      {
        id: 'friction',
        label: 'Refinance friction',
        change: '-25 bps',
        apply: (s) => {
          const v = s.behavioralParameters.frictionBps - 25;
          if (!within(v, BOUNDS.frictionBps)) return null;
          const n = clone(s);
          n.behavioralParameters.frictionBps = v;
          return n;
        },
      },
      ...common,
    ];
  }
  if (mode === 'fixedCpr') {
    return [
      {
        id: 'cpr',
        label: 'Fixed annual CPR',
        change: '+4 percentage points',
        apply: (s) => {
          const v = s.prepaymentParameters.fixedCpr + 0.04;
          if (!within(v, BOUNDS.fixedCpr)) return null;
          const n = clone(s);
          n.prepaymentParameters.fixedCpr = v;
          return n;
        },
      },
      ...common,
    ];
  }
  return [
    {
      id: 'psa',
      label: 'PSA multiplier',
      change: '+50% PSA',
      apply: (s) => {
        const v = s.prepaymentParameters.psaPercent + 50;
        if (!within(v, BOUNDS.psaPercent)) return null;
        const n = clone(s);
        n.prepaymentParameters.psaPercent = v;
        return n;
      },
    },
    ...common,
  ];
}

export interface SensitivityRow {
  id: string;
  label: string;
  change: string;
  /** null when the change would leave supported bounds. */
  npvDelta: number | null;
  prepaid12Delta: number | null;
  nextMonthCprDelta: number | null;
  skippedReason: string | null;
}

function costBump(p: Portfolio, s: ScenarioInput): ScenarioInput | null {
  const n = clone(s);
  if (s.servicingParameters.costPerLoan !== null) {
    const v = s.servicingParameters.costPerLoan + 25;
    if (!within(v, BOUNDS.costPerLoan)) return null;
    n.servicingParameters.costPerLoan = v;
    return n;
  }
  // Loan-level costs: +$25 is only expressible as a uniform override when all loans share a cost.
  const costs = new Set(p.loans.map((l) => l.annualCost));
  if (costs.size !== 1) return null;
  const v = [...costs][0] + 25;
  if (!within(v, BOUNDS.costPerLoan)) return null;
  n.servicingParameters.costPerLoan = v;
  return n;
}

export const SKIPPED_OUT_OF_RANGE = 'This change would leave the supported input range.';

/** One planned sensitivity: the scenario to run, or null with the reason it is skipped. */
export interface SensitivityPlanItem {
  id: string;
  label: string;
  change: string;
  scenario: ScenarioInput | null;
  skippedReason: string | null;
}

/**
 * The scenarios a one-factor analysis needs, without running them. Callers run each
 * planned scenario however suits them (synchronously in tests, chunked and cancellable
 * in the worker) and pass the summaries to assembleSensitivities.
 */
export function planSensitivities(portfolio: Portfolio, scenario: ScenarioInput): SensitivityPlanItem[] {
  return factorsFor(scenario.mode).map((f) => {
    const next = f.id === 'cost' ? costBump(portfolio, scenario) : f.apply(scenario);
    return { id: f.id, label: f.label, change: f.change, scenario: next, skippedReason: next ? null : SKIPPED_OUT_OF_RANGE };
  });
}

/** Turn run summaries (aligned with the plan; null for skipped items) into delta rows. */
export function assembleSensitivities(plan: SensitivityPlanItem[], base: SummaryMetrics, results: (SummaryMetrics | null)[]): SensitivityRow[] {
  return plan.map((item, i) => {
    const r = results[i];
    if (!item.scenario || !r) {
      return { id: item.id, label: item.label, change: item.change, npvDelta: null, prepaid12Delta: null, nextMonthCprDelta: null, skippedReason: item.skippedReason ?? SKIPPED_OUT_OF_RANGE };
    }
    return {
      id: item.id,
      label: item.label,
      change: item.change,
      npvDelta: r.servicingNpv - base.servicingNpv,
      prepaid12Delta: r.prepaid12 - base.prepaid12,
      nextMonthCprDelta: r.nextMonthCpr !== null && base.nextMonthCpr !== null ? r.nextMonthCpr - base.nextMonthCpr : null,
      skippedReason: null,
    };
  });
}

/** Synchronous convenience over plan + assemble. */
export function oneFactorSensitivities(
  portfolio: Portfolio,
  scenario: ScenarioInput,
  filter: PopulationFilter,
  baseSummary?: SummaryMetrics,
): SensitivityRow[] {
  const base = baseSummary ?? runScenario(portfolio, scenario, filter).summary;
  const plan = planSensitivities(portfolio, scenario);
  return assembleSensitivities(plan, base, plan.map((p) => (p.scenario ? runScenario(portfolio, p.scenario, filter).summary : null)));
}

export interface GridAxis {
  id: string;
  label: string;
  values: number[];
  format: 'pct' | 'mult' | 'psa';
}

export interface GridCell {
  row: number;
  col: number;
  scenario: ScenarioInput;
  servicingNpv: number | null;
  servicingValueBps: number | null;
  nextMonthCpr: number | null;
  error: string | null;
}

export interface GridResult {
  rowAxis: GridAxis;
  colAxis: GridAxis;
  cells: GridCell[];
  note: string;
}

const clampAxis = (vals: number[], b: { min: number; max: number }) => [...new Set(vals.filter((v) => within(v, b)).map((v) => Math.round(v * 1e8) / 1e8))].sort((a, z) => a - z);

/** Grid axes for the scenario's mode. Behavioral: offer rate x refinance response. Fixed: CPR x discount. PSA: PSA x discount. */
export function gridAxes(s: ScenarioInput): { rowAxis: GridAxis; colAxis: GridAxis; note: string } {
  const discountAxis: GridAxis = {
    id: 'discount',
    label: 'Annual discount rate',
    values: clampAxis([-0.04, -0.02, 0, 0.02, 0.04].map((d) => s.servicingParameters.discountRate + d), BOUNDS.discountRate),
    format: 'pct',
  };
  if (s.mode === 'behavioral') {
    const level = s.ratePath.offerRate + s.ratePath.shockBps / 10_000;
    return {
      rowAxis: {
        id: 'offer',
        label: 'Mortgage offer rate (immediate, flat)',
        values: clampAxis([-0.02, -0.01, 0, 0.01, 0.02].map((d) => level + d), BOUNDS.offerRate),
        format: 'pct',
      },
      colAxis: { id: 'refi', label: 'Refinance response multiplier', values: [0.5, 0.75, 1, 1.25, 1.5], format: 'mult' },
      note: 'Each cell applies a flat offer rate from month 1 (no ramp or custom path) and keeps every other assumption.',
    };
  }
  if (s.mode === 'fixedCpr') {
    return {
      rowAxis: { id: 'cpr', label: 'Fixed annual CPR', values: [0.04, 0.08, 0.12, 0.16, 0.2], format: 'pct' },
      colAxis: discountAxis,
      note: 'Each cell changes only fixed CPR and discount rate.',
    };
  }
  return {
    rowAxis: { id: 'psa', label: 'PSA multiplier', values: [50, 100, 150, 200, 300], format: 'psa' },
    colAxis: discountAxis,
    note: 'Each cell changes only the PSA multiplier and discount rate.',
  };
}

export function gridCellScenario(s: ScenarioInput, rowAxis: GridAxis, colAxis: GridAxis, r: number, c: number): ScenarioInput {
  const n = clone(s);
  const rv = rowAxis.values[r];
  const cv = colAxis.values[c];
  if (rowAxis.id === 'offer') n.ratePath = { offerRate: rv, shockBps: 0, shape: 'immediate', customPath: [] };
  if (rowAxis.id === 'cpr') n.prepaymentParameters.fixedCpr = rv;
  if (rowAxis.id === 'psa') n.prepaymentParameters.psaPercent = rv;
  if (colAxis.id === 'refi') n.behavioralParameters.refiMultiplier = cv;
  if (colAxis.id === 'discount') n.servicingParameters.discountRate = cv;
  return n;
}

export interface GridPlan {
  rowAxis: GridAxis;
  colAxis: GridAxis;
  note: string;
  /** Row-major cells. */
  cells: { row: number; col: number; scenario: ScenarioInput }[];
}

export function planGrid(s: ScenarioInput): GridPlan {
  const { rowAxis, colAxis, note } = gridAxes(s);
  const cells: GridPlan['cells'] = [];
  for (let r = 0; r < rowAxis.values.length; r++) {
    for (let c = 0; c < colAxis.values.length; c++) cells.push({ row: r, col: c, scenario: gridCellScenario(s, rowAxis, colAxis, r, c) });
  }
  return { rowAxis, colAxis, note, cells };
}

/** Each result is a summary, or an error message for a cell that could not be run. */
export type GridCellOutcome = { summary: SummaryMetrics } | { error: string };

export function assembleGrid(plan: GridPlan, outcomes: GridCellOutcome[]): GridResult {
  const cells: GridCell[] = plan.cells.map((cell, i) => {
    const o = outcomes[i];
    if ('summary' in o) {
      return { ...cell, servicingNpv: o.summary.servicingNpv, servicingValueBps: o.summary.servicingValueBps, nextMonthCpr: o.summary.nextMonthCpr, error: null };
    }
    return { ...cell, servicingNpv: null, servicingValueBps: null, nextMonthCpr: null, error: o.error };
  });
  return { rowAxis: plan.rowAxis, colAxis: plan.colAxis, cells, note: plan.note };
}

/** Synchronous convenience over plan + assemble. */
export function sensitivityGrid(
  portfolio: Portfolio,
  s: ScenarioInput,
  filter: PopulationFilter,
  onProgress?: (done: number, total: number) => void,
): GridResult {
  const plan = planGrid(s);
  const outcomes = plan.cells.map((cell, i): GridCellOutcome => {
    let o: GridCellOutcome;
    try {
      o = { summary: runScenario(portfolio, cell.scenario, filter).summary };
    } catch (e) {
      o = { error: (e as Error).message };
    }
    onProgress?.(i + 1, plan.cells.length);
    return o;
  });
  return assembleGrid(plan, outcomes);
}
