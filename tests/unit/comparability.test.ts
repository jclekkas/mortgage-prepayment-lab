/**
 * Issue 1 regression: after the population filter changes, a scenario whose
 * recalculation was cancelled (or failed) keeps an old-population result. That result
 * must not be compared, charted, printed or exported as if it used the new population.
 */
import { describe, expect, it } from 'vitest';
import { assessSlots, initialState, reducer, type Action, type AppState } from '../../src/app/store';
import { filterKey, populationContext, stalenessReason } from '../../src/domain/comparability';
import { runScenario } from '../../src/domain/engine';
import type { PopulationFilter, ScenarioInput } from '../../src/domain/types';
import { entriesFor } from '../../src/features/results/ScenarioCharts';
import { ledgerCsv } from '../../src/storage/exports';
import { buildScenarioFile, PopulationMismatchError, type Workspace } from '../../src/storage/files';

const apply = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const slotInput = (s: AppState, id: string): ScenarioInput => s.slots.find((x) => x.draft.scenarioId === id)!.draft;
const done = (s: AppState, id: string, filter: PopulationFilter): Action => {
  const input = slotInput(s, id);
  return { type: 'runDone', id, input, output: runScenario(s.portfolio, input, filter), cached: false };
};
const workspace = (s: AppState): Workspace => ({ portfolio: s.portfolio, baselineId: s.baselineId, scenarios: s.slots.map((x) => x.draft), filter: s.filter, notes: s.notes });
const outputs = (s: AppState) => s.slots.map((x) => x.run.output!).filter(Boolean);

const NEW_FILTER: PopulationFilter = { coupon: ['ge7'] };

function afterCancelledRecalculation() {
  let s = initialState();
  const [base, s1] = s.slots.map((x) => x.draft.scenarioId);
  s = apply(s, done(s, base, {}), done(s, s1, {}));
  expect(assessSlots(s).comparable).toBe(true);
  // The filter changes; both recalculations start; the baseline finishes, scenario 1 is cancelled.
  s = apply(s, { type: 'setFilter', filter: NEW_FILTER }, { type: 'runStart', id: base }, { type: 'runStart', id: s1 });
  s = apply(s, done(s, base, NEW_FILTER), { type: 'runCancelled', id: s1 });
  return { s, base, s1 };
}

describe('population comparability', () => {
  it('a result is current only for the same portfolio, valuation month and normalized filter', () => {
    const s = initialState();
    const out = runScenario(s.portfolio, s.slots[0].draft, { coupon: ['ge7', '6to7'] });
    expect(stalenessReason(out, populationContext(s.portfolio, { coupon: ['6to7', 'ge7', 'ge7'] }))).toBeNull();
    expect(stalenessReason(out, populationContext(s.portfolio, {}))).toMatch(/different population/);
    expect(stalenessReason({ ...out, portfolioHash: '0'.repeat(64) }, populationContext(s.portfolio, out.population.filter))).toMatch(/different portfolio/);
    expect(stalenessReason({ ...out, valuationMonth: '2026-08' }, populationContext(s.portfolio, out.population.filter))).toMatch(/valuation month 2026-08/);
    expect(filterKey({ coupon: [], state: ['TX'] })).toBe(filterKey({ state: ['TX'] }));
  });

  it('REGRESSION: change filter, cancel one recalculation: old-population result cannot be compared or exported', () => {
    const { s, base, s1 } = afterCancelledRecalculation();
    const slot1 = s.slots.find((x) => x.draft.scenarioId === s1)!;
    // The cancel no longer masquerades as a finished run.
    expect(slot1.run.status).toBe('cancelled');
    expect(slot1.run.output!.population.filter).toEqual({});

    const a = assessSlots(s);
    expect(a.comparable).toBe(false);
    expect(a.items.find((x) => x.id === base)!.current).toBe(true);
    const item = a.items.find((x) => x.id === s1)!;
    expect(item.current).toBe(false);
    expect(item.reason).toMatch(/cancelled/);
    expect(item.reason).toMatch(/different population/);

    // Charts drop it and say why.
    const { entries, excluded } = entriesFor(s);
    expect(entries.map((e) => e.output.scenarioId)).toEqual([base]);
    expect(excluded.join(' ')).toMatch(/Scenario 1: .*different population/);

    // The scenario file refuses to label it with the new population.
    expect(() => buildScenarioFile(workspace(s), outputs(s))).toThrow(PopulationMismatchError);
    try {
      buildScenarioFile(workspace(s), outputs(s));
    } catch (e) {
      expect((e as PopulationMismatchError).problems).toHaveLength(1);
      expect((e as PopulationMismatchError).problems[0]).toMatch(new RegExp(`^${s1}: .*different population`));
    }

    // A CSV of the retained result states the population it was really calculated for.
    const csv = ledgerCsv(slot1.run.output!, 'Scenario 1');
    expect(csv.split('\r\n')[1]).toContain('Whole portfolio');
    expect(csv).not.toContain('7.00% and above');
  });

  it('a failed recalculation is excluded the same way', () => {
    let s = initialState();
    const [base, s1] = s.slots.map((x) => x.draft.scenarioId);
    s = apply(s, done(s, base, {}), done(s, s1, {}), { type: 'setFilter', filter: NEW_FILTER });
    s = apply(s, done(s, base, NEW_FILTER), { type: 'runFail', id: s1, error: 'engine stopped', fields: [] });
    const a = assessSlots(s);
    expect(a.comparable).toBe(false);
    expect(a.items.find((x) => x.id === s1)!.reason).toMatch(/failed/);
    expect(() => buildScenarioFile(workspace(s), outputs(s))).toThrow(PopulationMismatchError);
  });

  it('while recalculating, an old-population result is excluded; a same-population result stays usable', () => {
    let s = initialState();
    const [base, s1] = s.slots.map((x) => x.draft.scenarioId);
    s = apply(s, done(s, base, {}), done(s, s1, {}), { type: 'runStart', id: s1 });
    expect(assessSlots(s).comparable).toBe(true); // same population, re-run in progress
    s = apply(s, { type: 'setFilter', filter: NEW_FILTER }, { type: 'runStart', id: base });
    const a = assessSlots(s);
    expect(a.comparable).toBe(false);
    expect(a.items.every((x) => /Recalculating/.test(x.reason ?? ''))).toBe(true);
  });

  it('re-running for the new population restores comparison and export', () => {
    const { s, s1 } = afterCancelledRecalculation();
    const fixed = apply(s, done(s, s1, NEW_FILTER));
    expect(assessSlots(fixed).comparable).toBe(true);
    const file = buildScenarioFile(workspace(fixed), outputs(fixed));
    expect(file.results).toHaveLength(2);
    expect(file.filter).toEqual(NEW_FILTER);
  });
});
