import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialState, reducer, type AppState } from '../../src/app/store';
import { loadPreset } from '../../src/data/presets';
import {
  BANDS, buildCreditFixture, CREDIT_FIXTURE_VERSION, OTHER_MODEL, OTHER_SOURCE, PRIMARY_SOURCE, REFERENCE_MODEL, SCORE_AWARE_MODEL, breakEven, breakEvenProblems, comparePairs, creditFixture,
  defaultAppliedIds, isRefreshApplied, loanView, observationRows, snapshotCoverage, snapshotsFor, summarize, ZERO_BREAK_EVEN,
  type CreditSnapshot, type ScoreObservation, type Tally,
} from '../../src/domain/credit';
import { runScenario, selectPopulation } from '../../src/domain/engine';
import { hashValue } from '../../src/domain/hash';
import { scenarioInputHash } from '../../src/domain/scenario';
import { buildScenarioFile, parseScenarioFile, type Workspace } from '../../src/storage/files';
import { makePortfolio, scenarioFor, simpleLoan } from '../helpers';

const p = loadPreset('mixed');
const f = creditFixture(p);
const [orig, prior, next] = f.snapshots;
const sum = (ts: Tally[]) => ts.reduce((a, t) => ({ loans: a.loans + t.loans, upb: a.upb + t.upb }), { loans: 0, upb: 0 });
const close = (a: Tally, b: Tally) => { expect(a.loans).toBe(b.loans); expect(a.upb).toBeCloseTo(b.upb, 4); };

describe('synthetic credit fixture', () => {
  it('is deterministic: the same portfolio and snapshot give the same records and fingerprints', () => {
    const again = buildCreditFixture(p);
    expect(again).not.toBe(f);
    expect(again.snapshots.map((s) => s.fingerprint)).toEqual(f.snapshots.map((s) => s.fingerprint));
    for (const s of f.snapshots) expect(s.fingerprint).toBe(hashValue(s.observations));
    // Pinned: a change to the fixture must change its version.
    expect(CREDIT_FIXTURE_VERSION).toBe('synthetic-credit-1.0.0');
    expect(f.snapshots.map((s) => s.fingerprint.slice(0, 12))).toMatchInlineSnapshot(`
      [
        "3fff4a0dc8d3",
        "282806e3cf52",
        "971813789c73",
      ]
    `);
  });

  it('records are immutable and never overwrite earlier snapshots', () => {
    expect(Object.isFrozen(next.observations)).toBe(true);
    expect(Object.isFrozen(next.observations[0])).toBe(true);
    expect(() => { (next.observations[0] as { score: number | null }).score = 1; }).toThrow();
    // Each loan keeps a distinct origination, earlier and newest record.
    const id = p.loans[0].id;
    const recs = f.snapshots.map((s) => s.observations.find((o) => o.loanId === id)).filter(Boolean) as ScoreObservation[];
    expect(new Set(recs.map((r) => r.snapshotId)).size).toBe(recs.length);
  });

  it('covers improvements, declines, unchanged scores, missing, unscorable, other versions, other sources and late records', () => {
    const cmp = comparePairs(p.loans, [orig, prior], next, f.analysisDate);
    expect(cmp.increased.loans).toBeGreaterThan(0);
    expect(cmp.decreased.loans).toBeGreaterThan(0);
    expect(cmp.unchanged.loans).toBeGreaterThan(0);
    const st = (s: CreditSnapshot, pred: (o: ScoreObservation) => boolean) => s.observations.filter(pred).length;
    expect(st(next, (o) => o.status === 'missing')).toBeGreaterThan(0);
    expect(st(next, (o) => o.status === 'unscorable')).toBeGreaterThan(0);
    expect(st(next, (o) => o.scoreModel === OTHER_MODEL)).toBeGreaterThan(0);
    expect(st(next, (o) => o.source === OTHER_SOURCE)).toBeGreaterThan(0);
    expect(st(next, (o) => o.availableOn > f.analysisDate)).toBeGreaterThan(0);
    expect(st(orig, (o) => o.status === 'missing')).toBeGreaterThan(0);
    for (const s of f.snapshots) for (const o of s.observations) {
      expect(o.provenance).toBe('synthetic-fixture');
      if (o.status === 'scored') expect(Number.isInteger(o.score) && o.score! >= 300 && o.score! <= 850).toBe(true);
      else expect(o.score).toBeNull();
    }
  });

  it('only loans that existed get a refresh record', () => {
    const priorIds = new Set(prior.observations.map((o) => o.loanId));
    for (const l of p.loans) expect(priorIds.has(l.id)).toBe(l.ageMonths > 12);
  });
});

describe('comparisons', () => {
  const loan = simpleLoan({ id: 'L1', ageMonths: 24 });
  const book = makePortfolio([loan, simpleLoan({ id: 'L2', ageMonths: 24 })]);
  const o = (snapshotId: string, over: Partial<ScoreObservation>): ScoreObservation =>
    ({ loanId: 'L1', status: 'scored', score: 700, scoreModel: REFERENCE_MODEL, source: PRIMARY_SOURCE, observedOn: '2025-09-12', availableOn: '2025-09-19', snapshotId, provenance: 'synthetic-fixture', ...over });
  const snap = (id: string, obs: ScoreObservation[]): CreditSnapshot => ({ id, kind: 'refresh', label: id, observedLabel: id, fixtureVersion: 'test', provenance: 'test', observations: obs, fingerprint: hashValue(obs) });
  const earlier = snap('a', [o('a', {})]);
  const at = '2026-09-30';
  const one = (newer: ScoreObservation) => comparePairs(book.loans.slice(0, 1), [earlier], snap('b', [newer]), at);

  it('subtracts compatible scores of the same loan', () => {
    const c = one(o('b', { score: 742, observedOn: '2026-09-12', availableOn: '2026-09-19' }));
    expect(c.pairs).toHaveLength(1);
    expect(c.pairs[0].change).toBe(42);
    expect(c.increased.loans).toBe(1);
    expect(c.movedUp.loans).toBe(1);
  });
  it('never subtracts across score versions or sources', () => {
    expect(one(o('b', { score: 760, scoreModel: OTHER_MODEL, observedOn: '2026-09-12', availableOn: '2026-09-19' })).excluded.versionChange.loans).toBe(1);
    expect(one(o('b', { score: 760, source: OTHER_SOURCE, observedOn: '2026-09-12', availableOn: '2026-09-19' })).excluded.sourceChange.loans).toBe(1);
  });
  it('excludes missing and future-dated records, and falls back to the earlier usable score', () => {
    expect(one(o('b', { status: 'missing', score: null })).excluded.noNewerScore.loans).toBe(1);
    const late = o('b', { score: 650, observedOn: '2026-09-12', availableOn: '2026-10-14' });
    expect(one(late).excluded.noNewerScore.loans).toBe(1);
    const v = loanView(loan, [earlier, snap('b', [late])], at);
    expect(v.usable?.snapshotId).toBe('a');
    expect(v.ageMonths).toBe(12);
    // An analysis date after it arrives would use it.
    expect(loanView(loan, [earlier, snap('b', [late])], '2026-10-31').usable?.score).toBe(650);
  });
  it('a loan with no score at all stays in the population and its balance', () => {
    const s = summarize(book.loans, [earlier], at);
    expect(s.population.loans).toBe(2);
    expect(s.usable.loans).toBe(1);
    expect(s.noUsable.noRecord.loans).toBe(1);
    close(sum([s.usable, ...Object.values(s.noUsable)]), s.population);
  });
});

describe('totals reconcile to the selected population', () => {
  for (const filter of [{}, { coupon: ['ge7'] }, { age: ['0to12'] }, { coupon: ['lt4'], age: ['0to12'] }]) {
    it(`filter ${JSON.stringify(filter)}`, () => {
      const pop = selectPopulation(p, filter);
      const popT = { loans: pop.length, upb: pop.reduce((a, l) => a + l.currentBalance, 0) };
      for (const set of [[orig, prior], [orig, prior, next]]) {
        const s = summarize(pop, set, f.analysisDate);
        close(s.population, popT);
        close(sum([s.usable, ...Object.values(s.noUsable)]), popT);
        close(sum([...Object.values(s.bands), ...Object.values(s.noUsable)]), popT);
        close(sum(s.age.map((a) => a.tally)), s.usable);
      }
      const c = comparePairs(pop, [orig, prior], next, f.analysisDate);
      close(sum([c.comparable, ...Object.values(c.excluded)]), popT);
      close(sum([c.increased, c.decreased, c.unchanged]), c.comparable);
      close(sum([c.movedUp, c.sameBand, c.movedDown]), c.comparable);
      close(sum(BANDS.flatMap((a) => BANDS.map((b) => c.migration[a.id][b.id]))), c.comparable);
      const cov = snapshotCoverage(pop, next, f.analysisDate);
      close(sum([cov.usable, ...Object.values(cov.reasons)]), popT);
    });
  }
});

describe('break-even calculator', () => {
  it('all zero: no cost, no benefit, break-even undefined', () => {
    expect(breakEven(ZERO_BREAK_EVEN)).toEqual({ refreshCost: 0, totalCost: 0, incrementalContribution: 0, netBenefit: 0, breakEvenOutcomes: null });
  });
  it('zero cost with positive contribution breaks even at zero outcomes', () => {
    expect(breakEven({ ...ZERO_BREAK_EVEN, contributionPerOutcome: 500 }).breakEvenOutcomes).toBe(0);
  });
  it('cost with zero benefit is a negative net', () => {
    const r = breakEven({ ...ZERO_BREAK_EVEN, billableRefreshes: 1000, unitCost: 2.5, fixedCost: 10_000, actionCost: 5_000 });
    expect(r.refreshCost).toBe(2500);
    expect(r.totalCost).toBe(17_500);
    expect(r.netBenefit).toBe(-17_500);
    expect(r.breakEvenOutcomes).toBeNull();
  });
  it('break-even is cost divided by contribution per outcome', () => {
    const r = breakEven({ billableRefreshes: 1000, unitCost: 2.5, fixedCost: 10_000, actionCost: 5_000, incrementalOutcomes: 10, contributionPerOutcome: 1_000 });
    expect(r.incrementalContribution).toBe(10_000);
    expect(r.netBenefit).toBe(-7_500);
    expect(r.breakEvenOutcomes).toBe(17.5);
  });
  it('undefined break-even when each outcome loses money', () => {
    expect(breakEven({ ...ZERO_BREAK_EVEN, fixedCost: 1, contributionPerOutcome: -10 }).breakEvenOutcomes).toBeNull();
  });
  it('rejects negative costs and non-finite values', () => {
    expect(breakEvenProblems({ ...ZERO_BREAK_EVEN, unitCost: -1 })).toHaveLength(1);
    expect(breakEvenProblems({ ...ZERO_BREAK_EVEN, actionCost: Number.NaN })).toHaveLength(1);
    expect(breakEvenProblems(ZERO_BREAK_EVEN)).toEqual([]);
  });
});

describe('credit information never changes financial results', () => {
  it('no score-aware model exists', () => expect(SCORE_AWARE_MODEL).toBeNull());
  it('simulate, apply, revert and discard leave scenarios, filters and run keys unchanged', () => {
    const s0: AppState = { ...initialState(), filter: { coupon: ['ge7'] } };
    const before = s0.slots.map((x) => runScenario(s0.portfolio, x.draft, s0.filter));
    let s = reducer(s0, { type: 'creditSimulate' });
    expect(s.creditPreview).toBe(true);
    expect(isRefreshApplied(f, s.credit)).toBe(false);
    s = reducer(s, { type: 'creditApply' });
    expect(isRefreshApplied(f, s.credit)).toBe(true);
    expect(s.slots).toBe(s0.slots);
    expect(s.filter).toBe(s0.filter);
    const after = s.slots.map((x) => runScenario(s.portfolio, x.draft, s.filter));
    after.forEach((r, i) => {
      expect(r.runKey).toBe(before[i].runKey);
      expect(r.inputHash).toBe(scenarioInputHash(s0.slots[i].draft));
      expect(r.summary).toEqual(before[i].summary);
    });
    s = reducer(s, { type: 'creditRevert' });
    expect(s.credit.appliedSnapshotIds).toEqual(defaultAppliedIds(f));
    s = reducer(reducer(s, { type: 'creditSimulate' }), { type: 'creditDiscard' });
    expect(s.creditPreview).toBe(false);
    expect(s.credit.appliedSnapshotIds).toEqual(defaultAppliedIds(f));
    expect(s.slots).toBe(s0.slots);
  });
  it('a refresh applied twice gives identical figures', () => {
    const a = summarize(p.loans, [orig, prior, next], f.analysisDate);
    const b = summarize(p.loans, snapshotsFor(creditFixture(p), [orig.id, prior.id, next.id]), f.analysisDate);
    expect(b).toEqual(a);
  });
});

describe('persistence and import', () => {
  const base = scenarioFor(p);
  const ws: Workspace = { portfolio: p, baselineId: base.scenarioId, scenarios: [base], filter: {}, notes: {} };
  const results = [runScenario(p, base, {})];
  const credit = { appliedSnapshotIds: f.snapshots.map((s) => s.id), breakEven: { ...ZERO_BREAK_EVEN, unitCost: 3, incrementalOutcomes: 2 } };

  it('round-trips the applied snapshots, fingerprints and break-even inputs', () => {
    const file = buildScenarioFile({ ...ws, credit }, results);
    expect(file.credit?.usedByPrepaymentResults).toBe(false);
    expect(file.credit?.appliedSnapshots.map((s) => s.fingerprint)).toEqual(f.snapshots.map((s) => s.fingerprint));
    const r = parseScenarioFile(JSON.stringify(file));
    expect(r.workspace.credit).toEqual(credit);
    expect(r.creditNote).toBeNull();
    // Saved results are unaffected by the credit block.
    expect(r.savedResults[0].runKey).toBe(results[0].runKey);
  });
  it('files without a credit block (all earlier files) import unchanged and use the default', () => {
    const file = buildScenarioFile(ws, results);
    expect('credit' in file).toBe(false);
    const r = parseScenarioFile(JSON.stringify(file));
    expect(r.workspace.credit).toBeUndefined();
    expect(r.creditNote).toBeNull();
    for (const n of ['mpl-engine-1.0.0-mixed-rate-cut.json', 'mpl-engine-1.0.0-saved-workspace.json']) {
      const raw = JSON.parse(readFileSync(new URL(`../fixtures/legacy/${n}`, import.meta.url), 'utf8'));
      // The saved-workspace fixture is a stored record whose scenario file sits under `file`.
      const legacy = parseScenarioFile(typeof raw.file === 'string' ? raw.file : JSON.stringify(raw));
      expect(legacy.workspace.credit).toBeUndefined();
      expect(legacy.creditNote).toBeNull();
    }
    const s = reducer(initialState(), { type: 'restore', ws: r.workspace, started: true });
    expect(s.credit.appliedSnapshotIds).toEqual(defaultAppliedIds(f));
  });
  it('a tampered fingerprint or unknown snapshot falls back to the default with a note, keeping scenarios', () => {
    const file = buildScenarioFile({ ...ws, credit }, results);
    const bad = structuredClone(file);
    bad.credit!.appliedSnapshots[2].fingerprint = '0'.repeat(64);
    const r = parseScenarioFile(JSON.stringify(bad));
    expect(r.workspace.credit).toBeUndefined();
    expect(r.creditNote).toMatch(/fingerprint differs/);
    expect(r.workspace.scenarios).toHaveLength(1);
    const unknown = structuredClone(file);
    unknown.credit!.appliedSnapshots[1].id = 'refresh-1999-01';
    expect(parseScenarioFile(JSON.stringify(unknown)).creditNote).toMatch(/does not have/);
    const version = structuredClone(file);
    version.credit!.fixtureVersion = 'synthetic-credit-9.0.0';
    expect(parseScenarioFile(JSON.stringify(version)).creditNote).toMatch(/version synthetic-credit-9.0.0/);
  });
  it('rejects a credit block that claims results used scores, or has negative costs', () => {
    const file = buildScenarioFile({ ...ws, credit }, results) as unknown as { credit: Record<string, unknown> & { breakEven: Record<string, number> } };
    expect(() => parseScenarioFile(JSON.stringify({ ...file, credit: { ...file.credit, usedByPrepaymentResults: true } }))).toThrow(/scenario format/);
    expect(() => parseScenarioFile(JSON.stringify({ ...file, credit: { ...file.credit, breakEven: { ...file.credit.breakEven, unitCost: -1 } } }))).toThrow(/scenario format/);
  });
  it('the per-loan export carries provenance and covers only the selected population', () => {
    const pop = selectPopulation(p, { coupon: ['ge7'] });
    const rows = observationRows(pop, f, defaultAppliedIds(f));
    const ids = new Set(pop.map((l) => l.id));
    expect(rows.length).toBeGreaterThan(pop.length);
    for (const r of rows) {
      expect(ids.has(r[0] as string)).toBe(true);
      expect(r[11]).toBe(CREDIT_FIXTURE_VERSION);
      expect(r[13]).toBe('Illustrative score data, not actual FICO Scores');
    }
  });
});
