/**
 * Issue 3 regression: the import reproduction check must compare every saved summary
 * metric (including nulls) within the documented tolerance, not just run key and NPV.
 */
import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { buildScenarioFile, parseScenarioFile } from '../../src/storage/files';
import { compareSummaries, numbersMatch, REPRO_ABS_TOL, REPRO_REL_TOL, verifyReproduction } from '../../src/storage/verify';
import { scenarioFor } from '../helpers';

const p = loadPreset('mixed');
const base = scenarioFor(p);
const s1 = { ...scenarioFor(p), scenarioId: 's1', name: 'Rates down', baselineId: 'baseline', ratePath: { ...base.ratePath, shockBps: -100 } };
const outs = [runScenario(p, base), runScenario(p, s1)];
const exported = () => JSON.parse(JSON.stringify(buildScenarioFile({ portfolio: p, baselineId: 'baseline', scenarios: [base, s1], filter: {}, notes: {} }, outs)));
const summary = (i: number) => outs[i].summary as unknown as Record<string, number | null>;

describe('reproduction verification', () => {
  it('an unmodified export reproduces on every metric', () => {
    const { savedResults } = parseScenarioFile(JSON.stringify(exported()));
    const r = verifyReproduction(savedResults, outs);
    expect(r).toMatchObject({ matched: 2, total: 2 });
    expect(r.scenarios.every((v) => v.differences.length === 0 && v.problems.length === 0)).toBe(true);
    expect(Object.keys(savedResults[0].summary).sort()).toEqual(Object.keys(outs[0].summary).sort());
  });

  it('REGRESSION: a changed prepaid12 is detected even though NPV and run key are unchanged', () => {
    const f = exported();
    f.results[1].summary.prepaid12 += 1000;
    const { savedResults } = parseScenarioFile(JSON.stringify(f));
    expect(savedResults[1].runKey).toBe(outs[1].runKey);
    expect(savedResults[1].summary.servicingNpv).toBe(outs[1].summary.servicingNpv);
    const r = verifyReproduction(savedResults, outs);
    expect(r).toMatchObject({ matched: 1, total: 2 });
    const bad = r.scenarios.find((v) => v.scenarioId === 's1')!;
    expect(bad.ok).toBe(false);
    expect(bad.problems).toEqual([]);
    expect(bad.differences).toEqual([{ metric: 'prepaid12', saved: outs[1].summary.prepaid12 + 1000, actual: outs[1].summary.prepaid12 }]);
  });

  it('null matches only null, and a missing or extra metric is reported', () => {
    const saved = { ...summary(0) };
    expect(saved.recapturePv).not.toBeNull();
    expect(compareSummaries({ ...saved, recapturePv: null }, summary(0))).toEqual([{ metric: 'recapturePv', saved: null, actual: summary(0).recapturePv }]);
    const fixed = runScenario(p, { ...base, mode: 'fixedCpr' }).summary as unknown as Record<string, number | null>;
    expect(fixed.recapturePv).toBeNull();
    expect(compareSummaries({ ...fixed, recapturePv: 0 }, fixed)).toEqual([{ metric: 'recapturePv', saved: 0, actual: null }]);
    const missing = { ...saved };
    delete missing.wal;
    expect(compareSummaries(missing, summary(0))).toEqual([{ metric: 'wal', saved: 'missing', actual: summary(0).wal }]);
    expect(compareSummaries({ ...saved, futureMetric: 1 }, summary(0))).toEqual([{ metric: 'futureMetric', saved: 1, actual: 'missing' }]);
  });

  it('applies the documented tolerance: max(1e-6, 1e-9 x magnitude)', () => {
    expect(REPRO_ABS_TOL).toBe(1e-6);
    expect(REPRO_REL_TOL).toBe(1e-9);
    expect(numbersMatch(3_545_316, 3_545_316 * (1 + 5e-10))).toBe(true); // within relative tolerance
    expect(numbersMatch(3_545_316, 3_545_316 + 0.01)).toBe(false); // 2.8e-9 relative: outside
    expect(numbersMatch(0, 5e-7)).toBe(true); // within absolute tolerance
    expect(numbersMatch(0, 2e-6)).toBe(false);
  });

  it('reports identity problems: missing re-run, changed run key or input hash', () => {
    const { savedResults } = parseScenarioFile(JSON.stringify(exported()));
    expect(verifyReproduction(savedResults, [outs[0]]).scenarios[1].problems).toEqual(['No re-run result for this scenario.']);
    const other = runScenario(p, { ...s1, ratePath: { ...s1.ratePath, shockBps: -50 } });
    const r = verifyReproduction(savedResults, [outs[0], other]);
    expect(r.scenarios[1].problems.join(' ')).toMatch(/Input hash differs.*Run key differs/);
  });
});
