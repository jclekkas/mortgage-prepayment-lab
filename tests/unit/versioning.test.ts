/**
 * Calculation versioning: files and saved work from an older compatible model keep their
 * assumptions and notes and are recalculated explicitly; unknown versions are refused without
 * changing anything. Fixtures were exported through the real UI of earlier builds:
 * - mpl-engine-1.0.0-mixed-rate-cut.json: commit b2016bd (after the threshold correction)
 * - mpl-engine-1.0.0-before-threshold-fix.json: commit 805f912 (before it)
 * - mpl-engine-1.0.0-saved-workspace.json: the IndexedDB record b2016bd keeps on a device
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/domain/engine';
import { APP_BUILD, LEGACY_MODEL_VERSIONS, MODEL_VERSION } from '../../src/domain/version';
import { ledgerCsv } from '../../src/storage/exports';
import { buildScenarioFile, ImportError, parseScenarioFile } from '../../src/storage/files';
import { compareSummaries } from '../../src/storage/verify';

const fixture = (n: string) => readFileSync(new URL(`../fixtures/legacy/${n}`, import.meta.url), 'utf8');

describe('calculation version policy', () => {
  it('the threshold correction has its own minor version, and 1.0.0 is a listed compatible predecessor', () => {
    expect(MODEL_VERSION).toBe('mpl-engine-1.1.0');
    expect(LEGACY_MODEL_VERSIONS['mpl-engine-1.0.0']).toContain('refinance-threshold');
  });
});

describe('older files', () => {
  it('keep assumptions and notes, are re-labeled for recalculation, and say why', () => {
    const r = parseScenarioFile(fixture('mpl-engine-1.0.0-mixed-rate-cut.json'));
    expect(r.legacy?.fromVersion).toBe('mpl-engine-1.0.0');
    expect(r.workspace.scenarios.every((s) => s.modelVersion === MODEL_VERSION)).toBe(true);
    expect(r.workspace.scenarios.map((s) => s.ratePath.shockBps).sort()).toEqual([-100, 0]);
    expect(Object.values(r.workspace.notes).map((n) => n.whatChanged)).toContain('Lower rates raised refinancing (note written in model 1.0.0).');
    expect(r.savedResults).toHaveLength(2);
  });

  it('a file from before the threshold correction recalculates to different numbers, and only the baseline changes', () => {
    const r = parseScenarioFile(fixture('mpl-engine-1.0.0-before-threshold-fix.json'));
    const outs = r.workspace.scenarios.map((s) => runScenario(r.workspace.portfolio, s));
    const base = outs.find((o) => o.scenarioId === r.workspace.baselineId)!;
    const savedBase = r.savedResults.find((x) => x.scenarioId === r.workspace.baselineId)!;
    expect(savedBase.summary.servicingNpv).toBeCloseTo(3_545_316, 0);
    expect(Math.abs(base.summary.servicingNpv - 3_524_196)).toBeLessThan(50);
    expect(compareSummaries(savedBase.summary, base.summary as unknown as Record<string, number | null>).map((d) => d.metric)).toContain('servicingNpv');
    // The -100 basis point scenario has no loan at the threshold: it moves only by the cent rounding of the rebuilt preset.
    const shocked = outs.find((o) => o.scenarioId !== r.workspace.baselineId)!;
    const savedShocked = r.savedResults.find((x) => x.scenarioId === shocked.scenarioId)!;
    expect(Math.abs(shocked.summary.servicingNpv - savedShocked.summary.servicingNpv!)).toBeLessThan(50);
    expect(r.legacy?.note).toContain('rounds amounts to cents');
  });

  it('a saved workspace from an older build on a learner’s device is readable', () => {
    const rec = JSON.parse(fixture('mpl-engine-1.0.0-saved-workspace.json')) as { file: string };
    const r = parseScenarioFile(rec.file);
    expect(r.legacy?.fromVersion).toBe('mpl-engine-1.0.0');
    expect(r.workspace.scenarios.length).toBe(2);
  });

  it('an unknown model version is refused and nothing is changed', () => {
    const f = JSON.parse(fixture('mpl-engine-1.0.0-mixed-rate-cut.json'));
    f.modelVersion = 'mpl-engine-2.0.0';
    expect(() => parseScenarioFile(JSON.stringify(f))).toThrow(ImportError);
    expect(() => parseScenarioFile(JSON.stringify(f))).toThrow(/nothing was imported or changed/);
  });
});

describe('current files and exports record model version and source build', () => {
  it('scenario files carry the model version and build, and round-trip without a legacy flag', () => {
    const r = parseScenarioFile(fixture('mpl-engine-1.0.0-mixed-rate-cut.json'));
    const outs = r.workspace.scenarios.map((s) => runScenario(r.workspace.portfolio, s));
    const file = buildScenarioFile(r.workspace, outs);
    expect(file.modelVersion).toBe(MODEL_VERSION);
    expect(file.appBuild).toBe(APP_BUILD);
    const again = parseScenarioFile(JSON.stringify(file));
    expect(again.legacy).toBeNull();
    // Exported scenarios are the assumptions that produced the exported results.
    for (const res of file.results) {
      const s = file.scenarios.find((x) => x.scenarioId === res.scenarioId)!;
      expect(runScenario(r.workspace.portfolio, s as never).runKey).toBe(res.runKey);
    }
  });

  it('the ledger spreadsheet states model version and build on every row', () => {
    const r = parseScenarioFile(fixture('mpl-engine-1.0.0-mixed-rate-cut.json'));
    const out = runScenario(r.workspace.portfolio, r.workspace.scenarios[0]);
    const [header, first] = ledgerCsv(out, 'x').split('\n');
    expect(header.split(',').slice(0, 4)).toEqual(['scenario', 'run_key', 'model_version', 'app_build']);
    expect(first).toContain(MODEL_VERSION);
    expect(first).toContain(APP_BUILD);
  });
});
