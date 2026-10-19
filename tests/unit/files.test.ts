import { describe, expect, it } from 'vitest';
import { loadPreset } from '../../src/data/presets';
import { runScenario } from '../../src/domain/engine';
import { ledgerCsv } from '../../src/storage/exports';
import { buildScenarioFile, ImportError, parseScenarioFile, type Workspace } from '../../src/storage/files';
import { csvCell } from '../../src/storage/sanitize';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

const p = loadPreset('mixed');
const baseline = scenarioFor(p);
const shocked = { ...scenarioFor(p), scenarioId: 's1', name: 'Rates down 100', baselineId: 'baseline', ratePath: { ...baseline.ratePath, shockBps: -100 } };
const ws: Workspace = { portfolio: p, baselineId: 'baseline', scenarios: [baseline, shocked], filter: { coupon: ['ge7'] }, notes: {} };
const results = ws.scenarios.map((s) => runScenario(p, s, ws.filter));
const fileText = () => JSON.stringify(buildScenarioFile(ws, results, '2026-10-18T00:00:00Z'));

const expectImportError = (text: string, match: RegExp) => {
  try {
    parseScenarioFile(text);
  } catch (e) {
    expect(e).toBeInstanceOf(ImportError);
    const err = e as ImportError;
    expect(`${err.message} ${err.details.join(' ')}`).toMatch(match);
    return;
  }
  throw new Error('expected import to fail');
};

describe('scenario files', () => {
  it('N16: export then import reproduces the same results exactly', () => {
    const { workspace, savedResults } = parseScenarioFile(fileText());
    const rerun = workspace.scenarios.map((s) => runScenario(workspace.portfolio, s, workspace.filter));
    rerun.forEach((r, i) => {
      expect(r.runKey).toBe(savedResults[i].runKey);
      expect(r.summary).toEqual(results[i].summary);
    });
  });
  it('rejects a future schema without migrating', () => {
    const f = JSON.parse(fileText());
    f.schemaVersion = 2;
    expectImportError(JSON.stringify(f), /newer version/);
  });
  it('rejects an unsupported model version', () => {
    const f = JSON.parse(fileText());
    f.modelVersion = 'mpl-engine-0.9.0';
    expectImportError(JSON.stringify(f), /does not know how that version’s assumptions map/);
  });
  it('rejects malformed JSON, unexpected fields and out-of-bounds numbers', () => {
    expectImportError('{not json', /not valid JavaScript Object Notation/);
    const extra = JSON.parse(fileText());
    extra.scenarios[0].fetchUrl = 'https://example.com';
    expectImportError(JSON.stringify(extra), /Unrecognized key|fetchUrl/);
    const big = JSON.parse(fileText());
    big.scenarios[1].ratePath.shockBps = 900;
    expectImportError(JSON.stringify(big), /shockBps/);
    const nan = fileText().replace('"discountRate":0.1', '"discountRate":1e999');
    expectImportError(nan, /discountRate/);
  });
  it('rejects non-synthetic and unsupported loan records', () => {
    const loans = [simpleLoan({ id: 'A1' }), simpleLoan({ id: 'A2' })];
    const custom = makePortfolio(loans);
    const s = scenarioFor(custom);
    const good = JSON.stringify(buildScenarioFile({ portfolio: custom, baselineId: 'baseline', scenarios: [s], filter: {}, notes: {} }, []));
    expect(parseScenarioFile(good).workspace.portfolio.loans).toHaveLength(2);
    const real = JSON.parse(good);
    real.portfolio.meta.synthetic = false;
    expectImportError(JSON.stringify(real), /synthetic/);
    const io = JSON.parse(good);
    io.portfolio.loans[0].contractualPayment = io.portfolio.loans[0].currentBalance * 0.065 / 12; // interest-only
    expectImportError(JSON.stringify(io), /not supported/);
    const tampered = JSON.parse(good);
    tampered.portfolio.loans[1].refiPropensity = 1.4;
    expectImportError(JSON.stringify(tampered), /hash/);
  });
  it('a preset fingerprint mismatch rebuilds the preset explicitly, re-points scenarios and says it is not a reproduction', () => {
    const f = JSON.parse(fileText());
    const old = '0'.repeat(64);
    f.portfolio.hash = old;
    for (const s of f.scenarios) s.portfolioHash = old;
    const r = parseScenarioFile(JSON.stringify(f));
    expect(r.legacy?.note).toContain('not checked as a reproduction');
    expect(r.workspace.scenarios.every((s) => s.portfolioHash === r.workspace.portfolio.meta.hash)).toBe(true);
  });
});

describe('exports', () => {
  it('N15: ledger CSV has no NaN, Infinity or blank cells', () => {
    const csv = ledgerCsv(runScenario(p, { ...baseline, mode: 'fixedCpr' }), 'Fixed');
    expect(csv).not.toMatch(/NaN|Infinity/);
    for (const line of csv.trim().split('\r\n')) expect(line.split(',').every((c) => c.length > 0)).toBe(true);
    expect(csv).toMatch(/not applicable/); // offer rate is not applicable in fixed mode
  });
  it('neutralizes spreadsheet formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell('plain')).toBe('plain');
  });
});
