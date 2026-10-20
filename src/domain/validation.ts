/**
 * Synthetic validation lab (PRD 4F). A history book is frozen at a forecast origin 24
 * months before the app's as-of month. The "actual" outcomes come from a DIFFERENT
 * behavioral parameter set and the rate path that actually occurred, realized as
 * seeded loan-level payoff draws, so the forecast cannot fit perfectly by construction.
 * Everything here is synthetic and labeled as such.
 */
import { generatePortfolio } from '../data/generator';
import { mulberry32 } from '../data/prng';
import { addMonths } from './calendar';
import { createContext, runScenario, simulateLoan } from './engine';
import { geometricAnnualCpr, ratio, smmToCpr } from './math';
import { defaultScenario } from './scenario';
import { segmentKey, segmentLabel, segmentOptions } from './segments';
import type { Portfolio, ScenarioInput } from './types';

export const VALIDATION_ORIGIN = '2024-09';
export const VALIDATION_MONTHS = 24;
export const OUTCOME_SEED = 9001;

/** Offer rates that "actually" occurred, months 1-24 after the origin. Synthetic. */
export const ACTUAL_RATE_PATH: readonly number[] = [
  0.0675, 0.067, 0.066, 0.065, 0.064, 0.063, 0.062, 0.061, 0.0605, 0.06, 0.0595, 0.06,
  0.0605, 0.061, 0.062, 0.063, 0.0635, 0.064, 0.0645, 0.065, 0.065, 0.0645, 0.064, 0.064,
];

let cachedBook: Portfolio | null = null;
export function historyBook(): Portfolio {
  cachedBook ??= generatePortfolio({
    seed: 4242,
    asOfMonth: VALIDATION_ORIGIN,
    presetId: 'validation-history',
    name: 'Validation history book',
    description: 'Synthetic book frozen at the forecast origin',
  });
  return cachedBook;
}

/** The forecast as frozen at the origin: default behavior, rates assumed flat at 6.75%. */
export function frozenForecastScenario(book: Portfolio): ScenarioInput {
  const s = defaultScenario(book.meta.hash, book.meta.asOfMonth);
  return { ...s, scenarioId: 'frozen-forecast', name: 'Frozen forecast (origin assumptions)', ratePath: { offerRate: 0.0675, shockBps: 0, shape: 'immediate', customPath: [] } };
}

/** Same behavioral assumptions as the frozen forecast, re-run with the rates that actually occurred. */
export function actualRatesForecastScenario(book: Portfolio): ScenarioInput {
  const s = frozenForecastScenario(book);
  return { ...s, scenarioId: 'forecast-actual-rates', name: 'Forecast re-run with actual rates', ratePath: { offerRate: ACTUAL_RATE_PATH[0], shockBps: 0, shape: 'custom', customPath: [...ACTUAL_RATE_PATH] } };
}

/** Hidden "true" synthetic behavior used only to generate outcomes. Disclosed in the lab. */
export function outcomeScenario(book: Portfolio): ScenarioInput {
  const s = actualRatesForecastScenario(book);
  return {
    ...s,
    scenarioId: 'synthetic-outcome',
    name: 'Synthetic outcome generator',
    behavioralParameters: { turnoverMultiplier: 0.85, refiMultiplier: 1.35, frictionBps: 35, burnout: true, seasonality: 'seasonal' },
  };
}

export interface ValidationMonth {
  t: number;
  month: string;
  actualRate: number;
  actualCpr: number | null;
  actualPrepaid: number;
  frozenCpr: number | null;
  frozenPrepaid: number;
  actualRatesCpr: number | null;
  actualRatesPrepaid: number;
  fixedCpr: number;
  psaCpr: number | null;
}

export interface ForecastScore {
  id: string;
  label: string;
  /** Mean of (forecast - actual) monthly CPR, decimal. Positive = forecast too fast. */
  meanError: number | null;
  meanAbsError: number | null;
  /** Sum of forecast minus actual prepaid dollars over 24 months. */
  prepaidError: number;
}

export interface CohortBias {
  key: string;
  label: string;
  loanCount: number;
  forecastPrepaid: number;
  actualPrepaid: number;
  /** forecast - actual. */
  bias: number;
  /** bias / actual; null when actual is zero. */
  biasShare: number | null;
  forecastCpr: number | null;
  actualCpr: number | null;
}

export interface ValidationResult {
  origin: string;
  months: ValidationMonth[];
  scores: ForecastScore[];
  cohorts: CohortBias[];
  bookHash: string;
  outcomeSeed: number;
  disclosure: string;
}

/** Realize discrete loan payoffs from the outcome model with a seeded generator. */
function realizeOutcome(book: Portfolio, s: ScenarioInput, seed: number) {
  const ctx = createContext(s, VALIDATION_MONTHS);
  const rand = mulberry32(seed);
  const beg = new Float64Array(VALIDATION_MONTHS);
  const sched = new Float64Array(VALIDATION_MONTHS);
  const prep = new Float64Array(VALIDATION_MONTHS);
  const perLoanPrep = new Map<string, Float64Array>();
  const perLoanElig = new Map<string, Float64Array>();
  for (const loan of book.loans) {
    const lp = new Float64Array(VALIDATION_MONTHS);
    const le = new Float64Array(VALIDATION_MONTHS);
    let alive = true;
    simulateLoan(loan, ctx, (m) => {
      const u = rand(); // always drawn: the sequence does not depend on earlier outcomes
      if (!alive) return;
      const i = m.t - 1;
      const B = m.contractualBalance;
      const S = Math.min(B, m.scheduledPrincipal / m.survival);
      beg[i] += B;
      sched[i] += S;
      le[i] = B - S;
      if (u < m.payoffProbability) {
        prep[i] += B - S;
        lp[i] = B - S;
        alive = false;
      }
    });
    perLoanPrep.set(loan.id, lp);
    perLoanElig.set(loan.id, le);
  }
  return { beg, sched, prep, perLoanPrep, perLoanElig };
}

export function runValidation(): ValidationResult {
  const book = historyBook();
  const frozen = runScenario(book, frozenForecastScenario(book));
  const actualRates = runScenario(book, actualRatesForecastScenario(book));
  const fixed = runScenario(book, { ...frozenForecastScenario(book), mode: 'fixedCpr' });
  const psa = runScenario(book, { ...frozenForecastScenario(book), mode: 'psa' });
  const out = realizeOutcome(book, outcomeScenario(book), OUTCOME_SEED);

  const months: ValidationMonth[] = [];
  for (let i = 0; i < VALIDATION_MONTHS; i++) {
    const smm = ratio(out.prep[i], out.beg[i] - out.sched[i]);
    months.push({
      t: i + 1,
      month: addMonths(VALIDATION_ORIGIN, i + 1),
      actualRate: ACTUAL_RATE_PATH[i],
      actualCpr: smm === null ? null : smmToCpr(smm),
      actualPrepaid: out.prep[i],
      frozenCpr: frozen.ledger[i].cpr,
      frozenPrepaid: frozen.ledger[i].prepaidPrincipal,
      actualRatesCpr: actualRates.ledger[i].cpr,
      actualRatesPrepaid: actualRates.ledger[i].prepaidPrincipal,
      fixedCpr: fixed.ledger[i].cpr ?? 0,
      psaCpr: psa.ledger[i].cpr,
    });
  }

  const score = (id: string, label: string, cprs: (number | null)[], prepaid: number[]): ForecastScore => {
    const errs: number[] = [];
    months.forEach((m, i) => {
      const f = cprs[i];
      if (f !== null && m.actualCpr !== null) errs.push(f - m.actualCpr);
    });
    return {
      id,
      label,
      meanError: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null,
      meanAbsError: errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null,
      prepaidError: prepaid.reduce((a, b) => a + b, 0) - months.reduce((a, m) => a + m.actualPrepaid, 0),
    };
  };
  const scores = [
    score('frozen', 'Frozen behavioral forecast (assumed flat rates)', months.map((m) => m.frozenCpr), months.map((m) => m.frozenPrepaid)),
    score('actualRates', 'Same behavior, re-run with actual rates', months.map((m) => m.actualRatesCpr), months.map((m) => m.actualRatesPrepaid)),
    score('fixed', 'Fixed 8% CPR benchmark', months.map((m) => m.fixedCpr), fixed.ledger.slice(0, VALIDATION_MONTHS).map((m) => m.prepaidPrincipal)),
    score('psa', '100% PSA benchmark', months.map((m) => m.psaCpr), psa.ledger.slice(0, VALIDATION_MONTHS).map((m) => m.prepaidPrincipal)),
  ];

  // Cohort bias: frozen forecast vs actual, by note-rate band.
  const ctx = createContext(frozenForecastScenario(book), VALIDATION_MONTHS);
  const groups = new Map<string, { n: number; f: number; a: number; fE: Float64Array; fP: Float64Array; aE: Float64Array; aP: Float64Array }>();
  for (const loan of book.loans) {
    const key = segmentKey(loan, 'coupon');
    let g = groups.get(key);
    if (!g) {
      g = { n: 0, f: 0, a: 0, fE: new Float64Array(VALIDATION_MONTHS), fP: new Float64Array(VALIDATION_MONTHS), aE: new Float64Array(VALIDATION_MONTHS), aP: new Float64Array(VALIDATION_MONTHS) };
      groups.set(key, g);
    }
    g.n++;
    const gg = g;
    simulateLoan(loan, ctx, (m) => {
      gg.f += m.prepaidPrincipal;
      gg.fE[m.t - 1] += m.beginningBalance - m.scheduledPrincipal;
      gg.fP[m.t - 1] += m.prepaidPrincipal;
    });
    const ap = out.perLoanPrep.get(loan.id)!;
    const ae = out.perLoanElig.get(loan.id)!;
    for (let i = 0; i < VALIDATION_MONTHS; i++) {
      gg.a += ap[i];
      gg.aP[i] += ap[i];
      gg.aE[i] += ae[i];
    }
  }
  const cohorts: CohortBias[] = segmentOptions('coupon', book.loans)
    .filter((o) => groups.has(o.key))
    .map((o) => {
      const g = groups.get(o.key)!;
      const smms = (e: Float64Array, p: Float64Array) => Array.from(e, (x, i) => ratio(p[i], x));
      return {
        key: o.key,
        label: segmentLabel('coupon', o.key),
        loanCount: g.n,
        forecastPrepaid: g.f,
        actualPrepaid: g.a,
        bias: g.f - g.a,
        biasShare: g.a === 0 ? null : (g.f - g.a) / g.a,
        forecastCpr: geometricAnnualCpr(smms(g.fE, g.fP)),
        actualCpr: geometricAnnualCpr(smms(g.aE, g.aP)),
      };
    });

  return {
    origin: VALIDATION_ORIGIN,
    months,
    scores,
    cohorts,
    bookHash: book.meta.hash,
    outcomeSeed: OUTCOME_SEED,
    disclosure:
      'Outcomes were generated by the same model structure with different parameters (refinance response 1.35, turnover 0.85, friction 35 basis points, seasonal turnover) and realized as random loan-level payoffs (seed 9001). Real validation needs out-of-time data, payoff-reason handling and censoring (planned for a later release).',
  };
}
