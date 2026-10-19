/**
 * The single numerical engine. It runs unchanged in tests, in the Web Worker and (for
 * small fixtures) anywhere else. React components never compute financial metrics.
 *
 * Expected-value projection: each loan carries a survival weight w. A surviving borrower
 * keeps paying the contractual payment on the contractual balance B; the pool's expected
 * balance is w * B. See docs/METHODOLOGY.md, "Loan balance and scheduled payment".
 */
import { addMonths, calendarMonthIndex } from './calendar';
import { BEHAVIORAL_COEFFICIENTS as C, SEASONAL_TURNOVER_PRESET } from './config';
import { hashValue } from './hash';
import { cprToSmm, discountFactor, geometricAnnualCpr, psaCpr, ratio, sigmoid, smmToCpr } from './math';
import { effectiveInput, offerRatePath, scenarioInputHash, validateScenario } from './scenario';
import { DIMENSIONS, matchesFilter, normalizeFilter, isFilterEmpty, segmentKey, segmentLabel, segmentOptions } from './segments';
import type {
  CohortRow,
  LedgerMonth,
  Loan,
  Portfolio,
  PopulationFilter,
  RunOutput,
  RunWarning,
  ScenarioInput,
  SegmentDimension,
  SummaryMetrics,
} from './types';
import { MODEL_VERSION } from './version';

/**
 * Effective incentive below this size (bps) is floating-point noise and is treated as zero.
 * Without it, (0.07 - 0.065) x 10,000 - 50 evaluates to +4e-14, so a loan exactly at the
 * refinance threshold would count as "positive incentive" and accrue burnout every month.
 */
export const INCENTIVE_EPSILON_BPS = 1e-6;
export const snapIncentive = (x: number) => (Math.abs(x) < INCENTIVE_EPSILON_BPS ? 0 : x);

export class EngineInputError extends Error {
  constructor(
    message: string,
    public readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'EngineInputError';
  }
}

/** Per-month values for one loan, already multiplied by the survival weight where noted. */
export interface LoanMonth {
  t: number;
  /** Survival weight at the start of the month. */
  survival: number;
  /** Contractual balance of a surviving borrower at the start of the month. */
  contractualBalance: number;
  contractualPayment: number;
  /** Expected values (survival-weighted). */
  beginningBalance: number;
  interest: number;
  scheduledPrincipal: number;
  prepaidPrincipal: number;
  endingBalance: number;
  /** Expected full voluntary payoffs, all causes (survival weight x payoff probability). */
  voluntaryPayoffs: number;
  /** Cause split. null in fixed CPR and PSA modes, which do not identify why a loan pays off. */
  refiPayoffs: number | null;
  turnoverPayoffs: number | null;
  refiPrepaidPrincipal: number | null;
  turnoverPrepaidPrincipal: number | null;
  /** Voluntary payoffs with no identified cause: all of them in fixed CPR and PSA modes, 0 in behavioral mode. */
  unclassifiedPayoffs: number;
  unclassifiedPrepaidPrincipal: number;
  matured: number;
  grossFee: number;
  operatingCost: number;
  /** Unweighted monthly probabilities. */
  payoffProbability: number;
  refiProbability: number | null;
  turnoverProbability: number | null;
  unclassifiedProbability: number;
  /** Behavioral detail (null in other modes). */
  offerRate: number | null;
  incentiveBps: number | null;
  refiHazard: number | null;
  turnoverHazard: number | null;
  burnoutFactor: number | null;
  burnoutMonths: number | null;
}

export interface RunContext {
  scenario: ScenarioInput;
  horizon: number;
  offer: Float64Array | null;
  seasonality: Float64Array;
  discount: Float64Array;
  fixedSmm: number;
}

export function createContext(scenario: ScenarioInput, horizon: number): RunContext {
  const errors = validateScenario(scenario);
  if (errors.length) throw new EngineInputError(errors[0].message, errors);
  const h = Math.max(horizon, 0);
  const seasonality = new Float64Array(h);
  const discount = new Float64Array(h);
  const seasonal = scenario.behavioralParameters.seasonality === 'seasonal';
  for (let i = 0; i < h; i++) {
    seasonality[i] = seasonal ? SEASONAL_TURNOVER_PRESET[calendarMonthIndex(scenario.valuationMonth, i + 1)] : 1;
    discount[i] = discountFactor(scenario.servicingParameters.discountRate, i + 1);
  }
  return {
    scenario,
    horizon: h,
    offer: scenario.mode === 'behavioral' ? offerRatePath(scenario.ratePath, h) : null,
    seasonality,
    discount,
    fixedSmm: cprToSmm(scenario.prepaymentParameters.fixedCpr),
  };
}

/** Simulate one loan month by month and hand each month to the sink. The record object is reused. */
export function simulateLoan(loan: Loan, ctx: RunContext, sink: (m: LoanMonth) => void): void {
  const s = ctx.scenario;
  const n = loan.remainingTerm;
  const r = loan.noteRate / 12;
  const A = loan.contractualPayment;
  const feeBps = s.servicingParameters.feeOverrideBps ?? loan.servicingFeeBps;
  const annualCost = s.servicingParameters.costPerLoan ?? loan.annualCost;
  const bp = s.behavioralParameters;
  const behavioral = s.mode === 'behavioral';
  const m: LoanMonth = {
    t: 0, survival: 0, contractualBalance: 0, contractualPayment: A, beginningBalance: 0, interest: 0,
    scheduledPrincipal: 0, prepaidPrincipal: 0, endingBalance: 0, voluntaryPayoffs: 0, refiPayoffs: null, turnoverPayoffs: null,
    refiPrepaidPrincipal: null, turnoverPrepaidPrincipal: null, unclassifiedPayoffs: 0, unclassifiedPrepaidPrincipal: 0,
    matured: 0, grossFee: 0, operatingCost: 0,
    payoffProbability: 0, refiProbability: null, turnoverProbability: null, unclassifiedProbability: 0, offerRate: null, incentiveBps: null,
    refiHazard: null, turnoverHazard: null, burnoutFactor: null, burnoutMonths: null,
  };
  let w = 1;
  let B = loan.currentBalance;
  let E = 0;
  for (let t = 1; t <= n && t <= ctx.horizon; t++) {
    const i = t - 1;
    const age = loan.ageMonths + t;
    const interest = B * r;
    const final = t === n;
    const S = final ? B : Math.min(B, Math.max(0, A - interest));
    const R = B - S;

    let q = 0, qRefi = 0, qMove = 0; // qRefi/qMove are set only in behavioral mode
    if (!final) {
      // Fixed CPR and PSA give a speed but no cause, so q stays unclassified (no qRefi/qMove).
      if (s.mode === 'fixedCpr') q = ctx.fixedSmm;
      else if (s.mode === 'psa') q = cprToSmm(psaCpr(age, s.prepaymentParameters.psaPercent));
    }
    if (behavioral) {
      const offer = ctx.offer![i];
      const x = snapIncentive((loan.noteRate - offer) * 10_000 - bp.frictionBps);
      const seasoning = Math.min(age / C.seasoningMonths, 1);
      const burnoutFactor = bp.burnout ? Math.exp(-C.burnoutDecay * E) : 1;
      const hMove = C.baseTurnoverHazard * bp.turnoverMultiplier * ctx.seasonality[i];
      const hRefi =
        C.baseRefiHazard * bp.refiMultiplier * loan.refiPropensity * seasoning * burnoutFactor * sigmoid(x / C.incentiveScaleBps);
      const hTotal = hMove + hRefi;
      if (!final && hTotal > 0) {
        q = 1 - Math.exp(-hTotal);
        qRefi = q * (hRefi / hTotal);
        qMove = q - qRefi; // exact split: qRefi + qMove === q
      }
      m.offerRate = offer;
      m.incentiveBps = x;
      m.refiHazard = hRefi;
      m.turnoverHazard = hMove;
      m.burnoutFactor = burnoutFactor;
      m.burnoutMonths = E;
      if (x > 0) E += 1; // incremented after the current month is computed
    }

    m.t = t;
    m.survival = w;
    m.contractualBalance = B;
    m.beginningBalance = w * B;
    m.interest = w * interest;
    m.scheduledPrincipal = w * S;
    m.prepaidPrincipal = w * R * q;
    m.endingBalance = w * R * (1 - q);
    m.voluntaryPayoffs = w * q;
    m.refiPayoffs = behavioral ? w * qRefi : null;
    m.turnoverPayoffs = behavioral ? w * qMove : null;
    m.refiPrepaidPrincipal = behavioral ? w * R * qRefi : null;
    m.turnoverPrepaidPrincipal = behavioral ? w * R * qMove : null;
    m.unclassifiedPayoffs = behavioral ? 0 : w * q;
    m.unclassifiedPrepaidPrincipal = behavioral ? 0 : w * R * q;
    m.matured = final ? w : 0;
    m.grossFee = (m.beginningBalance * feeBps) / 10_000 / 12;
    m.operatingCost = (w * annualCost) / 12;
    m.payoffProbability = q;
    m.refiProbability = behavioral ? qRefi : null;
    m.turnoverProbability = behavioral ? qMove : null;
    m.unclassifiedProbability = behavioral ? 0 : q;
    sink(m);

    w = final ? 0 : w * (1 - q);
    B = R;
  }
}

const COHORT_MONTHS = 12;

/** Running sums for a batch of loans. Build with createAccumulator, feed with accumulate, finish with finalize. */
export interface Accumulator {
  ctx: RunContext;
  portfolio: Portfolio;
  population: Loan[];
  filter: PopulationFilter;
  cols: Record<
    | 'beg' | 'sched' | 'prep' | 'end' | 'interest' | 'count' | 'volN' | 'refiN' | 'moveN' | 'refiP' | 'moveP' | 'unclN' | 'unclP'
    | 'matured' | 'fee' | 'cost' | 'recap',
    Float64Array
  >;
  /** Per-loan sums for cohort aggregation, indexed by position in `population`. */
  loanUpb: Float64Array;
  loanSched12: Float64Array;
  loanPrep12: Float64Array;
  loanNet12: Float64Array;
  loanNpv: Float64Array;
  loanElig: Float64Array; // population.length * 12
  loanPrepM: Float64Array; // population.length * 12
  done: number;
  started: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function selectPopulation(portfolio: Portfolio, filter: PopulationFilter): Loan[] {
  return isFilterEmpty(filter) ? portfolio.loans : portfolio.loans.filter((l) => matchesFilter(l, filter));
}

export function createAccumulator(portfolio: Portfolio, scenario: ScenarioInput, filter: PopulationFilter = {}): Accumulator {
  if (scenario.portfolioHash !== portfolio.meta.hash) {
    throw new EngineInputError('This scenario was built for a different portfolio (portfolio hash mismatch).');
  }
  if (scenario.valuationMonth !== portfolio.meta.asOfMonth) {
    throw new EngineInputError(
      `Valuation month ${scenario.valuationMonth} does not match the portfolio as-of month ${portfolio.meta.asOfMonth}.`,
    );
  }
  const started = now();
  const nf = normalizeFilter(filter);
  const population = selectPopulation(portfolio, nf);
  let horizon = 0;
  for (const l of population) if (l.remainingTerm > horizon) horizon = l.remainingTerm;
  const ctx = createContext(scenario, horizon);
  const col = () => new Float64Array(horizon);
  const n = population.length;
  return {
    ctx,
    portfolio,
    population,
    filter: nf,
    cols: {
      beg: col(), sched: col(), prep: col(), end: col(), interest: col(), count: col(), volN: col(), refiN: col(), moveN: col(),
      refiP: col(), moveP: col(), unclN: col(), unclP: col(), matured: col(), fee: col(), cost: col(), recap: col(),
    },
    loanUpb: new Float64Array(n),
    loanSched12: new Float64Array(n),
    loanPrep12: new Float64Array(n),
    loanNet12: new Float64Array(n),
    loanNpv: new Float64Array(n),
    loanElig: new Float64Array(n * COHORT_MONTHS),
    loanPrepM: new Float64Array(n * COHORT_MONTHS),
    done: 0,
    started,
  };
}

/** Process population[start, end). Returns the number of loans processed so far. */
export function accumulate(acc: Accumulator, start: number, end: number): number {
  const { cols, ctx } = acc;
  const stop = Math.min(end, acc.population.length);
  for (let k = start; k < stop; k++) {
    const loan = acc.population[k];
    acc.loanUpb[k] = loan.currentBalance;
    let s12 = 0, p12 = 0, n12 = 0, npv = 0;
    simulateLoan(loan, ctx, (m) => {
      const i = m.t - 1;
      cols.beg[i] += m.beginningBalance;
      cols.sched[i] += m.scheduledPrincipal;
      cols.prep[i] += m.prepaidPrincipal;
      cols.end[i] += m.endingBalance;
      cols.interest[i] += m.interest;
      cols.count[i] += m.survival;
      cols.volN[i] += m.voluntaryPayoffs;
      cols.refiN[i] += m.refiPayoffs ?? 0;
      cols.moveN[i] += m.turnoverPayoffs ?? 0;
      cols.refiP[i] += m.refiPrepaidPrincipal ?? 0;
      cols.moveP[i] += m.turnoverPrepaidPrincipal ?? 0;
      cols.unclN[i] += m.unclassifiedPayoffs;
      cols.unclP[i] += m.unclassifiedPrepaidPrincipal;
      cols.matured[i] += m.matured;
      cols.fee[i] += m.grossFee;
      cols.cost[i] += m.operatingCost;
      cols.recap[i] += m.refiPayoffs ?? 0;
      const net = m.grossFee - m.operatingCost;
      npv += net * ctx.discount[i];
      if (m.t <= COHORT_MONTHS) {
        s12 += m.scheduledPrincipal;
        p12 += m.prepaidPrincipal;
        n12 += net;
        acc.loanElig[k * COHORT_MONTHS + i] = m.beginningBalance - m.scheduledPrincipal;
        acc.loanPrepM[k * COHORT_MONTHS + i] = m.prepaidPrincipal;
      }
    });
    acc.loanSched12[k] = s12;
    acc.loanPrep12[k] = p12;
    acc.loanNet12[k] = n12;
    acc.loanNpv[k] = npv;
  }
  acc.done = stop;
  return stop;
}

function cohortTables(acc: Accumulator): Record<SegmentDimension, CohortRow[]> {
  const out = {} as Record<SegmentDimension, CohortRow[]>;
  const pop = acc.population;
  for (const dim of DIMENSIONS) {
    const groups = new Map<string, number[]>();
    pop.forEach((l, k) => {
      const key = segmentKey(l, dim);
      const g = groups.get(key);
      if (g) g.push(k);
      else groups.set(key, [k]);
    });
    const order = segmentOptions(dim, pop).map((o) => o.key);
    const rows: CohortRow[] = [];
    for (const key of order) {
      const idx = groups.get(key);
      if (!idx) continue;
      let upb = 0, s12 = 0, p12 = 0, n12 = 0, npv = 0;
      const elig = new Float64Array(COHORT_MONTHS);
      const prep = new Float64Array(COHORT_MONTHS);
      for (const k of idx) {
        upb += acc.loanUpb[k];
        s12 += acc.loanSched12[k];
        p12 += acc.loanPrep12[k];
        n12 += acc.loanNet12[k];
        npv += acc.loanNpv[k];
        for (let i = 0; i < COHORT_MONTHS; i++) {
          elig[i] += acc.loanElig[k * COHORT_MONTHS + i];
          prep[i] += acc.loanPrepM[k * COHORT_MONTHS + i];
        }
      }
      const smms = Array.from(elig, (e, i) => ratio(prep[i], e));
      const first = smms[0];
      rows.push({
        dimension: dim,
        key,
        label: segmentLabel(dim, key),
        loanCount: idx.length,
        beginningUpb: upb,
        nextMonthCpr: first === null ? null : smmToCpr(first),
        cpr12: geometricAnnualCpr(smms.slice(0, Math.min(COHORT_MONTHS, acc.ctx.horizon))),
        scheduled12: s12,
        prepaid12: p12,
        prepaid12Share: ratio(p12, upb),
        netServicing12: n12,
        servicingNpv: npv,
        servicingValueBps: upb === 0 ? null : (npv / upb) * 10_000,
      });
    }
    out[dim] = rows;
  }
  return out;
}

export function finalize(acc: Accumulator): RunOutput {
  const { ctx, cols, portfolio } = acc;
  const s = ctx.scenario;
  const H = ctx.horizon;
  const behavioral = s.mode === 'behavioral';
  const rc = s.recaptureParameters;
  const ledger: LedgerMonth[] = [];
  for (let i = 0; i < H; i++) {
    const t = i + 1;
    const eligible = cols.beg[i] - cols.sched[i];
    const smm = ratio(cols.prep[i], eligible);
    const net = cols.fee[i] - cols.cost[i];
    const recapturedLoans = behavioral ? cols.recap[i] * rc.share : null;
    ledger.push({
      t,
      month: addMonths(s.valuationMonth, t),
      beginningUpb: cols.beg[i],
      scheduledPrincipal: cols.sched[i],
      prepaidPrincipal: cols.prep[i],
      endingUpb: cols.end[i],
      noteInterest: cols.interest[i],
      beginningLoans: cols.count[i],
      voluntaryPayoffs: cols.volN[i],
      refiPayoffs: behavioral ? cols.refiN[i] : null,
      turnoverPayoffs: behavioral ? cols.moveN[i] : null,
      refiPrepaidPrincipal: behavioral ? cols.refiP[i] : null,
      turnoverPrepaidPrincipal: behavioral ? cols.moveP[i] : null,
      unclassifiedPayoffs: cols.unclN[i],
      unclassifiedPrepaidPrincipal: cols.unclP[i],
      maturedLoans: cols.matured[i],
      smm,
      cpr: smm === null ? null : smmToCpr(smm),
      grossFee: cols.fee[i],
      operatingCost: cols.cost[i],
      netServicing: net,
      discountFactor: ctx.discount[i],
      pvNetServicing: net * ctx.discount[i],
      offerRate: ctx.offer ? ctx.offer[i] : null,
      recapturedLoans,
      recaptureContribution: recapturedLoans === null ? null : recapturedLoans * rc.contributionPerLoan,
      ownerNetInterest: cols.interest[i] - cols.fee[i],
    });
  }
  const summary = summarize(acc, ledger);
  const warnings = buildWarnings(acc, summary);
  const inputHash = scenarioInputHash(s);
  return {
    inputHash,
    runKey: hashValue({ inputHash, filter: acc.filter }),
    modelVersion: MODEL_VERSION,
    portfolioHash: portfolio.meta.hash,
    valuationMonth: s.valuationMonth,
    scenarioId: s.scenarioId,
    mode: s.mode,
    population: {
      filter: acc.filter,
      loanCount: acc.population.length,
      totalLoans: portfolio.loans.length,
      upb: sumBalance(acc.population),
      totalUpb: sumBalance(portfolio.loans),
      isFiltered: !isFilterEmpty(acc.filter),
    },
    ledger,
    cohorts: cohortTables(acc),
    summary,
    warnings,
    durationMs: now() - acc.started,
  };
}

function sumBalance(loans: readonly Loan[]): number {
  let s = 0;
  for (const l of loans) s += l.currentBalance;
  return s;
}

function summarize(acc: Accumulator, ledger: LedgerMonth[]): SummaryMetrics {
  const s = acc.ctx.scenario;
  const upb = sumBalance(acc.population);
  let prepaid12 = 0, scheduled12 = 0, net12 = 0, fee12 = 0, cost12 = 0;
  let npv = 0, walNum = 0, lifePrep = 0, lifeSched = 0, lifeNet = 0, negMonths = 0;
  let recapLoans = 0, recapPvGross = 0;
  for (const m of ledger) {
    if (m.t <= 12) {
      prepaid12 += m.prepaidPrincipal;
      scheduled12 += m.scheduledPrincipal;
      net12 += m.netServicing;
      fee12 += m.grossFee;
      cost12 += m.operatingCost;
    }
    npv += m.pvNetServicing;
    walNum += (m.t / 12) * (m.scheduledPrincipal + m.prepaidPrincipal);
    lifePrep += m.prepaidPrincipal;
    lifeSched += m.scheduledPrincipal;
    lifeNet += m.netServicing;
    if (m.netServicing < 0 && m.beginningLoans > 0) negMonths++;
    if (m.recapturedLoans !== null) {
      recapLoans += m.recapturedLoans;
      recapPvGross += m.recaptureContribution! * m.discountFactor;
    }
  }
  const behavioral = s.mode === 'behavioral';
  const recapturePv = behavioral ? recapPvGross - s.recaptureParameters.campaignCost : null;
  return {
    loanCount: acc.population.length,
    currentUpb: upb,
    nextMonthCpr: ledger.length ? ledger[0].cpr : null,
    cpr12: geometricAnnualCpr(ledger.slice(0, 12).map((m) => m.smm)),
    prepaid12,
    scheduled12,
    netServicing12: net12,
    grossFee12: fee12,
    operatingCost12: cost12,
    servicingNpv: npv,
    servicingValueBps: upb === 0 ? null : (npv / upb) * 10_000,
    wal: upb === 0 ? null : walNum / upb,
    lifetimePrepaid: lifePrep,
    lifetimeScheduled: lifeSched,
    lifetimeNetServicing: lifeNet,
    recapturedLoans: behavioral ? recapLoans : null,
    recapturePv,
    combinedContribution: recapturePv === null ? null : npv + recapturePv,
    negativeMarginMonths: negMonths,
    projectionMonths: ledger.length,
  };
}

function buildWarnings(acc: Accumulator, summary: SummaryMetrics): RunWarning[] {
  const s = acc.ctx.scenario;
  const w: RunWarning[] = [];
  if (acc.population.length === 0) {
    w.push({ code: 'empty-population', message: 'No loans match the current filter, so there is nothing to project.' });
  }
  if (s.servicingParameters.feeOverrideBps !== null) {
    w.push({
      code: 'fee-override',
      message: `Contract change assumption: every loan's servicing fee is replaced by a hypothetical ${s.servicingParameters.feeOverrideBps} basis points a year, as if the book were acquired on new terms.`,
    });
  }
  if (s.servicingParameters.costPerLoan !== null) {
    w.push({
      code: 'cost-override',
      message: `Every loan uses an annual servicing cost of $${s.servicingParameters.costPerLoan.toLocaleString('en-US')} instead of its own cost field.`,
    });
  }
  if (summary.negativeMarginMonths > 0) {
    w.push({
      code: 'negative-margin',
      message: `Net servicing cash flow is negative in ${summary.negativeMarginMonths} projected month(s). Values are not clamped at zero.`,
    });
  }
  if (s.mode === 'behavioral' && s.behavioralParameters.burnout) {
    w.push({
      code: 'burnout-init',
      message: 'Burnout history starts at zero for every loan: the synthetic fixtures carry no record of past refinance opportunities.',
    });
  }
  if (s.mode !== 'behavioral') {
    w.push({
      code: 'rates-ignored',
      message:
        'In this mode mortgage rates do not drive prepayment, and the recapture overlay is off because the refinance versus move split is undefined.',
    });
  }
  return w;
}

/** Synchronous convenience: project the whole population at once. */
export function runScenario(portfolio: Portfolio, scenario: ScenarioInput, filter: PopulationFilter = {}): RunOutput {
  const acc = createAccumulator(portfolio, scenario, filter);
  accumulate(acc, 0, acc.population.length);
  return finalize(acc);
}

/** Month-by-month ledger for a single loan (drill-down and the "follow one dollar" lesson). */
export function loanLedger(portfolio: Portfolio, scenario: ScenarioInput, loanId: string): LoanMonth[] {
  const loan = portfolio.loans.find((l) => l.id === loanId);
  if (!loan) throw new EngineInputError(`Loan ${loanId} is not in this portfolio.`);
  const ctx = createContext(scenario, loan.remainingTerm);
  const rows: LoanMonth[] = [];
  simulateLoan(loan, ctx, (m) => rows.push({ ...m }));
  return rows;
}

export { effectiveInput };
