/**
 * Credit score refresh: synthetic, educational information about borrowers' credit scores.
 *
 * Score observations are kept apart from loan economics. Nothing here is read by the
 * prepayment engine, so applying a refresh cannot change a forecast or a servicing value.
 * Observations are immutable: a refresh adds a snapshot, it never overwrites an earlier one.
 *
 * Fixtures are deterministic. The same portfolio, snapshot and settings always produce the
 * same observations: no randomness is drawn when the learner presses "Simulate score refresh".
 * The scores are illustrative numbers, not FICO Scores, and no scoring algorithm is implied.
 */
import { addMonths, parseMonth } from './calendar';
import { hashValue } from './hash';
import type { Loan, PopulationFilter, Portfolio, ScenarioInput } from './types';

export const CREDIT_FIXTURE_VERSION = 'synthetic-credit-1.0.0';
export const CREDIT_DATA_LABEL = 'Illustrative score data, not actual FICO Scores';
export const CREDIT_PROVENANCE = `Synthetic fixture ${CREDIT_FIXTURE_VERSION}, generated in the browser from synthetic loan identifiers. Not from a credit bureau, not about real people.`;

/** The score version this workspace bands and compares. Other versions are shown, never mixed in. */
export const REFERENCE_MODEL = 'Synthetic score model A, version 1.0';
export const OTHER_MODEL = 'Synthetic score model B, version 2.0';
export const PRIMARY_SOURCE = 'Synthetic source 1';
export const OTHER_SOURCE = 'Synthetic source 2';

export type ScoreStatus = 'scored' | 'missing' | 'unscorable';
export type SnapshotKind = 'origination' | 'refresh';

export interface ScoreObservation {
  /** Synthetic loan identifier; links to the loan without copying any loan economics. */
  readonly loanId: string;
  readonly status: ScoreStatus;
  /** Whole number from 300 to 850 when scored; null when missing or unscorable. */
  readonly score: number | null;
  readonly scoreModel: string;
  readonly source: string;
  /** 'YYYY-MM-DD' date the score was observed. */
  readonly observedOn: string;
  /** 'YYYY-MM-DD' date the observation reached the servicer and could be used. */
  readonly availableOn: string;
  readonly snapshotId: string;
  readonly provenance: 'synthetic-fixture';
}

export interface CreditSnapshot {
  readonly id: string;
  readonly kind: SnapshotKind;
  readonly label: string;
  /** Plain description of when observations were taken. */
  readonly observedLabel: string;
  readonly fixtureVersion: string;
  readonly provenance: string;
  readonly observations: readonly ScoreObservation[];
  /** SHA-256 of the observations, so a saved workspace can prove it points at the same data. */
  readonly fingerprint: string;
}

export interface CreditFixture {
  readonly portfolioHash: string;
  readonly fixtureVersion: string;
  /** Last day of the portfolio's as-of month: nothing available after it is used. */
  readonly analysisDate: string;
  /** In time order: origination, earlier refresh, newest (simulated) refresh. */
  readonly snapshots: readonly [CreditSnapshot, CreditSnapshot, CreditSnapshot];
}

// ---------------------------------------------------------------------------------------------
// Dates

const pad = (n: number) => String(n).padStart(2, '0');
export const dateIn = (month: string, day: number) => `${month}-${pad(day)}`;

export function lastDayOf(month: string): string {
  const { year, month: m } = parseMonth(month);
  return dateIn(month, new Date(Date.UTC(year, m, 0)).getUTCDate());
}

/** Whole calendar months from one date to a later one (days ignored). */
export function monthsBetween(from: string, to: string): number {
  const a = parseMonth(from.slice(0, 7)), b = parseMonth(to.slice(0, 7));
  return (b.year - a.year) * 12 + (b.month - a.month);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDate(d: string): string {
  const { year, month } = parseMonth(d.slice(0, 7));
  return `${MONTHS[month - 1]} ${Number(d.slice(8, 10))}, ${year}`;
}

export const originationMonth = (l: Loan) => addMonths(l.asOfMonth, -l.ageMonths);

// ---------------------------------------------------------------------------------------------
// Deterministic fixture

/** FNV-1a with a final avalanche: integer-only, so every browser engine gets the same bits. */
function draw(...parts: string[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
const clampScore = (s: number) => Math.min(850, Math.max(300, s));

function obs(loanId: string, snapshotId: string, o: Partial<ScoreObservation> & Pick<ScoreObservation, 'observedOn' | 'availableOn'>): ScoreObservation {
  return { loanId, status: 'scored', score: null, scoreModel: REFERENCE_MODEL, source: PRIMARY_SOURCE, snapshotId, provenance: 'synthetic-fixture', ...o };
}

const cache = new Map<string, CreditFixture>();

/**
 * Builds the synthetic score history for a portfolio. Dates are relative to the portfolio's
 * as-of month, so every preset has an origination snapshot, a refresh 12 months earlier and
 * a newest refresh in the as-of month (a few of whose records arrive after the analysis date).
 */
export function creditFixture(portfolio: Portfolio): CreditFixture {
  const key = `${portfolio.meta.hash}|${CREDIT_FIXTURE_VERSION}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const fixture = buildCreditFixture(portfolio);
  cache.set(key, fixture);
  return fixture;
}

/** Uncached: builds the fixture from the loans alone. */
export function buildCreditFixture(portfolio: Portfolio): CreditFixture {
  const asOf = portfolio.meta.asOfMonth;
  const seed = portfolio.meta.hash.slice(0, 16);
  const priorMonth = addMonths(asOf, -12);
  const ids = { orig: 'origination', prior: `refresh-${priorMonth}`, next: `refresh-${asOf}` };
  const priorObserved = dateIn(priorMonth, 12), priorAvailable = dateIn(priorMonth, 19);
  const nextObserved = dateIn(asOf, 12), nextAvailable = dateIn(asOf, 19), lateAvailable = dateIn(addMonths(asOf, 1), 14);

  const orig: ScoreObservation[] = [], prior: ScoreObservation[] = [], next: ScoreObservation[] = [];
  for (const l of portfolio.loans) {
    const om = originationMonth(l);
    const atOrig = dateIn(addMonths(om, -1), 20);
    // Origination: about 1.5% of files carry no recorded score.
    const o1 = draw(seed, l.id, 'orig');
    const origScore = 620 + (o1 % 201);
    orig.push(o1 % 1000 < 15
      ? obs(l.id, ids.orig, { status: 'missing', observedOn: atOrig, availableOn: atOrig })
      : obs(l.id, ids.orig, { score: origScore, observedOn: atOrig, availableOn: atOrig }));

    // Earlier refresh: only loans that existed then. About 3% missing and 1% unscorable.
    let lastKnown = origScore;
    if (om < priorMonth) {
      const p = draw(seed, l.id, 'prior');
      const score = clampScore(origScore + (p % 61) - 30);
      const m = (p >>> 8) % 1000;
      if (m < 30) prior.push(obs(l.id, ids.prior, { status: 'missing', observedOn: priorObserved, availableOn: priorAvailable }));
      else if (m < 40) prior.push(obs(l.id, ids.prior, { status: 'unscorable', observedOn: priorObserved, availableOn: priorAvailable }));
      else {
        prior.push(obs(l.id, ids.prior, { score, observedOn: priorObserved, availableOn: priorAvailable }));
        lastKnown = score;
      }
    }

    // Newest refresh: improvements, declines and unchanged scores, plus records that cannot be
    // compared (another score version or source), missing, unscorable and late-arriving ones.
    if (om < asOf) {
      const n = draw(seed, l.id, 'next');
      const r = n % 100;
      const change = r < 25 ? 0 : r < 62 ? 1 + ((n >>> 8) % 60) : -(1 + ((n >>> 8) % 75));
      const score = clampScore(lastKnown + change);
      const m = (n >>> 16) % 1000;
      const base = { observedOn: nextObserved, availableOn: nextAvailable };
      if (m < 30) next.push(obs(l.id, ids.next, { ...base, status: 'missing' }));
      else if (m < 40) next.push(obs(l.id, ids.next, { ...base, status: 'unscorable' }));
      else if (m < 90) next.push(obs(l.id, ids.next, { ...base, score: clampScore(score + 18), scoreModel: OTHER_MODEL }));
      else if (m < 110) next.push(obs(l.id, ids.next, { ...base, score, source: OTHER_SOURCE }));
      else if (m < 130) next.push(obs(l.id, ids.next, { ...base, score, availableOn: lateAvailable }));
      else next.push(obs(l.id, ids.next, { ...base, score }));
    }
  }
  const snap = (id: string, kind: SnapshotKind, label: string, observedLabel: string, observations: ScoreObservation[]): CreditSnapshot =>
    Object.freeze({ id, kind, label, observedLabel, fixtureVersion: CREDIT_FIXTURE_VERSION, provenance: CREDIT_PROVENANCE, observations: Object.freeze(observations.map((x) => Object.freeze(x))), fingerprint: hashValue(observations) });
  const fixture: CreditFixture = Object.freeze({
    portfolioHash: portfolio.meta.hash,
    fixtureVersion: CREDIT_FIXTURE_VERSION,
    analysisDate: lastDayOf(asOf),
    snapshots: Object.freeze([
      snap(ids.orig, 'origination', 'At origination', 'Each loan’s score from its application, the month before it was made', orig),
      snap(ids.prior, 'refresh', `Earlier refresh, ${formatDate(priorObserved).replace(/ \d+,/, '')}`, `Observed ${formatDate(priorObserved)}, available ${formatDate(priorAvailable)}`, prior),
      snap(ids.next, 'refresh', `Newest refresh, ${formatDate(nextObserved).replace(/ \d+,/, '')} (simulated)`, `Observed ${formatDate(nextObserved)}, available ${formatDate(nextAvailable)}; some records arrive ${formatDate(lateAvailable)}`, next),
    ]) as unknown as CreditFixture['snapshots'],
  });
  return fixture;
}

// ---------------------------------------------------------------------------------------------
// Information state

/** Which snapshots the educational analysis uses. Saved with the workspace; never part of scenario inputs. */
export interface CreditSelection {
  /** Snapshot ids in time order; always origination plus the earlier refresh, optionally the newest. */
  appliedSnapshotIds: string[];
  breakEven: BreakEvenInputs;
}

export const defaultAppliedIds = (f: CreditFixture) => [f.snapshots[0].id, f.snapshots[1].id];
export const allIds = (f: CreditFixture) => f.snapshots.map((s) => s.id);

export function defaultCreditSelection(f: CreditFixture): CreditSelection {
  return { appliedSnapshotIds: defaultAppliedIds(f), breakEven: { ...ZERO_BREAK_EVEN } };
}

export const isRefreshApplied = (f: CreditFixture, sel: CreditSelection) => sel.appliedSnapshotIds.length === 3 && sel.appliedSnapshotIds[2] === f.snapshots[2].id;

/** Whether a saved list of snapshot ids is one this fixture can reproduce. */
export function isValidApplied(f: CreditFixture, ids: readonly string[]): boolean {
  const all = allIds(f);
  return (ids.length === 2 || ids.length === 3) && ids.every((id, i) => id === all[i]);
}

/** Why a record is not usable for this analysis. */
export type UnusableReason = 'missing' | 'unscorable' | 'otherVersion' | 'notYetAvailable' | 'noRecord';

export const REASON_LABELS: Record<UnusableReason, string> = {
  missing: 'Missing: no score returned',
  unscorable: 'Unscorable: not enough credit history to calculate a score',
  otherVersion: 'Different score version, not mixed into these figures',
  notYetAvailable: 'Not yet available on the analysis date',
  noRecord: 'No record in this snapshot (for example, the loan did not exist yet)',
};

export function unusableReason(o: ScoreObservation | undefined, analysisDate: string): UnusableReason | null {
  if (!o) return 'noRecord';
  if (o.availableOn > analysisDate) return 'notYetAvailable';
  if (o.status === 'missing') return 'missing';
  if (o.status === 'unscorable') return 'unscorable';
  if (o.scoreModel !== REFERENCE_MODEL) return 'otherVersion';
  return null;
}

const byLoan = (s: CreditSnapshot) => {
  const m = new Map<string, ScoreObservation>();
  for (const o of s.observations) m.set(o.loanId, o);
  return m;
};
const loanIndex = new WeakMap<CreditSnapshot, Map<string, ScoreObservation>>();
function lookup(s: CreditSnapshot, loanId: string): ScoreObservation | undefined {
  let m = loanIndex.get(s);
  if (!m) loanIndex.set(s, (m = byLoan(s)));
  return m.get(loanId);
}

export function snapshotsFor(f: CreditFixture, ids: readonly string[]): CreditSnapshot[] {
  return ids.map((id) => {
    const s = f.snapshots.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown credit snapshot ${id}`);
    return s;
  });
}

/** The most recent usable score for a loan in an information set, or why there is none. */
export interface LoanView {
  loan: Loan;
  usable: ScoreObservation | null;
  /** When there is no usable score: the reason from the most recent record. */
  reason: UnusableReason | null;
  ageMonths: number | null;
}

export function loanView(loan: Loan, set: readonly CreditSnapshot[], analysisDate: string): LoanView {
  let reason: UnusableReason = 'noRecord';
  for (let i = set.length - 1; i >= 0; i--) {
    const o = lookup(set[i], loan.id);
    const why = unusableReason(o, analysisDate);
    if (!why) return { loan, usable: o!, reason: null, ageMonths: monthsBetween(o!.observedOn, analysisDate) };
    if (reason === 'noRecord') reason = why;
  }
  return { loan, usable: null, reason, ageMonths: null };
}

// ---------------------------------------------------------------------------------------------
// Bands and summaries

export const BANDS = [
  { id: 'lt620', label: 'Below 620', min: 300, max: 619 },
  { id: '620', label: '620 to 679', min: 620, max: 679 },
  { id: '680', label: '680 to 739', min: 680, max: 739 },
  { id: '740', label: '740 to 799', min: 740, max: 799 },
  { id: '800', label: '800 and above', min: 800, max: 850 },
] as const;
export type BandId = (typeof BANDS)[number]['id'];
export const bandOf = (score: number): BandId => BANDS.find((b) => score >= b.min && score <= b.max)!.id;
export const bandLabel = (id: BandId) => BANDS.find((b) => b.id === id)!.label;

export interface Tally { loans: number; upb: number }
const zero = (): Tally => ({ loans: 0, upb: 0 });
const add = (t: Tally, l: Loan) => { t.loans += 1; t.upb += l.currentBalance; };

export interface InformationSummary {
  population: Tally;
  usable: Tally;
  noUsable: Record<UnusableReason, Tally>;
  bands: Record<BandId, Tally>;
  age: { bucket: AgeBucket; tally: Tally }[];
  medianAgeMonths: number | null;
}

export const AGE_BUCKETS = [
  { id: '0-6', label: '6 months or less', max: 6 },
  { id: '7-12', label: '7 to 12 months', max: 12 },
  { id: '13-24', label: '13 to 24 months', max: 24 },
  { id: '25+', label: 'More than 24 months', max: Infinity },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]['id'];

const reasonTallies = (): Record<UnusableReason, Tally> => ({ missing: zero(), unscorable: zero(), otherVersion: zero(), notYetAvailable: zero(), noRecord: zero() });

/** Coverage, score age and band distribution for an information set over the selected population. */
export function summarize(population: readonly Loan[], set: readonly CreditSnapshot[], analysisDate: string): InformationSummary {
  const s: InformationSummary = {
    population: zero(), usable: zero(), noUsable: reasonTallies(),
    bands: Object.fromEntries(BANDS.map((b) => [b.id, zero()])) as Record<BandId, Tally>,
    age: AGE_BUCKETS.map((b) => ({ bucket: b.id, tally: zero() })),
    medianAgeMonths: null,
  };
  const ages: number[] = [];
  for (const loan of population) {
    add(s.population, loan);
    const v = loanView(loan, set, analysisDate);
    if (!v.usable) { add(s.noUsable[v.reason!], loan); continue; }
    add(s.usable, loan);
    add(s.bands[bandOf(v.usable.score!)], loan);
    const i = AGE_BUCKETS.findIndex((b) => v.ageMonths! <= b.max);
    add(s.age[i].tally, loan);
    ages.push(v.ageMonths!);
  }
  ages.sort((a, b) => a - b);
  if (ages.length) s.medianAgeMonths = ages.length % 2 ? ages[(ages.length - 1) / 2] : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2;
  return s;
}

/** What a snapshot itself returned for the selected population, before any fallback to older records. */
export interface SnapshotCoverage {
  population: Tally;
  usable: Tally;
  otherSource: Tally;
  reasons: Record<UnusableReason, Tally>;
}

export function snapshotCoverage(population: readonly Loan[], snapshot: CreditSnapshot, analysisDate: string): SnapshotCoverage {
  const c: SnapshotCoverage = { population: zero(), usable: zero(), otherSource: zero(), reasons: reasonTallies() };
  for (const loan of population) {
    add(c.population, loan);
    const o = lookup(snapshot, loan.id);
    const why = unusableReason(o, analysisDate);
    if (why) add(c.reasons[why], loan);
    else {
      add(c.usable, loan);
      if (o!.source !== PRIMARY_SOURCE) add(c.otherSource, loan);
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Comparisons between earlier and newer information

export type PairExclusion = 'noEarlierScore' | 'noNewerScore' | 'versionChange' | 'sourceChange';

export const PAIR_EXCLUSION_LABELS: Record<PairExclusion, string> = {
  noEarlierScore: 'No usable earlier score to compare against',
  noNewerScore: 'No usable newer score (missing, unscorable, not yet available or no record)',
  versionChange: 'Score version changed: different scales, so the scores are not subtracted',
  sourceChange: 'Source changed: scores from different sources are not subtracted',
};

export interface ScorePair {
  loan: Loan;
  earlier: ScoreObservation;
  newer: ScoreObservation;
  change: number;
}

export interface PairComparison {
  population: Tally;
  comparable: Tally;
  increased: Tally;
  decreased: Tally;
  unchanged: Tally;
  excluded: Record<PairExclusion, Tally>;
  /** earlier band -> newer band -> tally, comparable pairs only. */
  migration: Record<BandId, Record<BandId, Tally>>;
  movedUp: Tally;
  sameBand: Tally;
  movedDown: Tally;
  pairs: ScorePair[];
}

/**
 * Pairs each loan's latest usable score in the earlier information with its record in the
 * newer snapshot. A change is computed only when both are scored, available, on the same score
 * version and from the same source; anything else is counted as excluded, with the reason.
 */
export function comparePairs(population: readonly Loan[], earlierSet: readonly CreditSnapshot[], newer: CreditSnapshot, analysisDate: string): PairComparison {
  const c: PairComparison = {
    population: zero(), comparable: zero(), increased: zero(), decreased: zero(), unchanged: zero(),
    excluded: { noEarlierScore: zero(), noNewerScore: zero(), versionChange: zero(), sourceChange: zero() },
    migration: Object.fromEntries(BANDS.map((a) => [a.id, Object.fromEntries(BANDS.map((b) => [b.id, zero()]))])) as PairComparison['migration'],
    movedUp: zero(), sameBand: zero(), movedDown: zero(), pairs: [],
  };
  const order = BANDS.map((b) => b.id as BandId);
  for (const loan of population) {
    add(c.population, loan);
    const before = loanView(loan, earlierSet, analysisDate).usable;
    const after = lookup(newer, loan.id);
    const afterWhy = unusableReason(after, analysisDate);
    if (!before) { add(c.excluded.noEarlierScore, loan); continue; }
    if (after && after.status === 'scored' && after.availableOn <= analysisDate && after.scoreModel !== before.scoreModel) { add(c.excluded.versionChange, loan); continue; }
    if (afterWhy) { add(c.excluded.noNewerScore, loan); continue; }
    if (after!.source !== before.source) { add(c.excluded.sourceChange, loan); continue; }
    const change = after!.score! - before.score!;
    add(c.comparable, loan);
    add(change > 0 ? c.increased : change < 0 ? c.decreased : c.unchanged, loan);
    const a = bandOf(before.score!), b = bandOf(after!.score!);
    add(c.migration[a][b], loan);
    const d = order.indexOf(b) - order.indexOf(a);
    add(d > 0 ? c.movedUp : d < 0 ? c.movedDown : c.sameBand, loan);
    c.pairs.push({ loan, earlier: before, newer: after!, change });
  }
  return c;
}

/** Example loans for the "older versus newer" explanation: one rise, one fall, one version change. */
export function exampleLoans(population: readonly Loan[], earlierSet: readonly CreditSnapshot[], newer: CreditSnapshot, analysisDate: string) {
  const cmp = comparePairs(population, earlierSet, newer, analysisDate);
  const up = cmp.pairs.find((p) => p.change >= 20 && bandOf(p.earlier.score!) !== bandOf(p.newer.score!)) ?? cmp.pairs.find((p) => p.change > 0) ?? null;
  const down = cmp.pairs.find((p) => p.change <= -20 && bandOf(p.earlier.score!) !== bandOf(p.newer.score!)) ?? cmp.pairs.find((p) => p.change < 0) ?? null;
  let version: { loan: Loan; earlier: ScoreObservation; newer: ScoreObservation } | null = null;
  for (const loan of population) {
    const before = loanView(loan, earlierSet, analysisDate).usable;
    const after = lookup(newer, loan.id);
    if (before && after && after.status === 'scored' && after.scoreModel !== before.scoreModel && after.availableOn <= analysisDate) { version = { loan, earlier: before, newer: after }; break; }
  }
  return { up, down, version };
}

// ---------------------------------------------------------------------------------------------
// Forecast revisions: not estimated

export const FORECAST_NOT_ESTIMATED = 'Not estimated: the current prepayment model does not use credit scores.';

/**
 * Extension interface for a future score-aware prepayment model. NOT IMPLEMENTED and not
 * offered in the app: `SCORE_AWARE_MODEL` is null, and the page says forecasts were not revised.
 *
 * Contract for an implementation:
 * - It runs the same scenario twice, once with the earlier and once with the newer credit
 *   information. Portfolio, valuation month, analysis date, market assumptions (rate path),
 *   model version and every non-credit input are held fixed: the single `scenario` and
 *   `filter` below are shared by both runs, so only the credit information can differ.
 * - It reports a forecast revision (difference in expected prepayment), never realized profit.
 * - It must cite out-of-sample evidence that score information improves forecasts on real,
 *   permissioned data; a relationship invented for teaching is not acceptable.
 * - It must not infer default or delinquency from score bands unless that is separately modeled
 *   and evidenced.
 */
export interface CreditInformationRef {
  fixtureVersion: string;
  snapshotIds: readonly string[];
  fingerprints: readonly string[];
}

export interface ScoreAwareForecastRequest {
  /** Holds portfolio hash, valuation month, rate path and every non-credit assumption fixed. */
  scenario: ScenarioInput;
  filter: PopulationFilter;
  analysisDate: string;
  earlier: CreditInformationRef;
  newer: CreditInformationRef;
}

export interface ScoreAwareForecastRevision {
  modelId: string;
  modelVersion: string;
  /** Change in projected prepaid principal and speed caused only by the newer information. */
  prepaid12Revision: number;
  nextMonthCprRevision: number;
  evidence: string;
}

export interface ScoreAwarePrepaymentModel {
  readonly id: string;
  readonly version: string;
  revise(request: ScoreAwareForecastRequest): ScoreAwareForecastRevision;
}

/** No score-aware model exists in this release. */
export const SCORE_AWARE_MODEL: ScoreAwarePrepaymentModel | null = null;

// ---------------------------------------------------------------------------------------------
// Break-even calculator

export interface BreakEvenInputs {
  /** Number of score refreshes that would be billed. */
  billableRefreshes: number;
  /** Cost per refresh, dollars. */
  unitCost: number;
  /** One-time implementation cost, dollars. */
  fixedCost: number;
  /** Cost of the action or campaign that uses the information, dollars. */
  actionCost: number;
  /** Assumed outcomes that would not have happened without the action. */
  incrementalOutcomes: number;
  /** Net contribution per incremental outcome, dollars (may be negative). */
  contributionPerOutcome: number;
}

export const ZERO_BREAK_EVEN: BreakEvenInputs = { billableRefreshes: 0, unitCost: 0, fixedCost: 0, actionCost: 0, incrementalOutcomes: 0, contributionPerOutcome: 0 };

export const BREAK_EVEN_LIMITS: Record<keyof BreakEvenInputs, { min: number; max: number }> = {
  billableRefreshes: { min: 0, max: 10_000_000 },
  unitCost: { min: 0, max: 10_000 },
  fixedCost: { min: 0, max: 1_000_000_000 },
  actionCost: { min: 0, max: 1_000_000_000 },
  incrementalOutcomes: { min: 0, max: 10_000_000 },
  contributionPerOutcome: { min: -1_000_000, max: 1_000_000 },
};

export interface BreakEvenResult {
  refreshCost: number;
  totalCost: number;
  incrementalContribution: number;
  netBenefit: number;
  /** Outcomes needed to cover the cost; null when each outcome contributes nothing or loses money. */
  breakEvenOutcomes: number | null;
}

export function breakEven(i: BreakEvenInputs): BreakEvenResult {
  const refreshCost = i.billableRefreshes * i.unitCost;
  const totalCost = refreshCost + i.fixedCost + i.actionCost;
  const incrementalContribution = i.incrementalOutcomes * i.contributionPerOutcome;
  return {
    refreshCost,
    totalCost,
    incrementalContribution,
    netBenefit: incrementalContribution - totalCost,
    breakEvenOutcomes: i.contributionPerOutcome > 0 ? totalCost / i.contributionPerOutcome : null,
  };
}

export function breakEvenProblems(i: BreakEvenInputs): string[] {
  return (Object.keys(BREAK_EVEN_LIMITS) as (keyof BreakEvenInputs)[]).flatMap((k) => {
    const v = i[k], b = BREAK_EVEN_LIMITS[k];
    return Number.isFinite(v) && v >= b.min && v <= b.max ? [] : [`${k} must be between ${b.min} and ${b.max}.`];
  });
}

// ---------------------------------------------------------------------------------------------
// Export

/** Per-loan observations for the selected population, with provenance, as CSV rows. */
export function observationRows(population: readonly Loan[], f: CreditFixture, ids: readonly string[]): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const s of snapshotsFor(f, ids)) {
    for (const loan of population) {
      const o = lookup(s, loan.id);
      if (!o) continue;
      const why = unusableReason(o, f.analysisDate);
      rows.push([o.loanId, s.id, s.kind, o.status, o.score, o.scoreModel, o.source, o.observedOn, o.availableOn, why ? 'no' : 'yes', why ? REASON_LABELS[why] : '', f.fixtureVersion, s.fingerprint, CREDIT_DATA_LABEL]);
    }
  }
  return rows;
}

export const OBSERVATION_HEADER = ['loan_id', 'snapshot_id', 'snapshot_kind', 'status', 'score', 'score_model', 'source', 'observed_on', 'available_on', 'usable_on_analysis_date', 'not_usable_reason', 'fixture_version', 'snapshot_fingerprint', 'data_label'];
