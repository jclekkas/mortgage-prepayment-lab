import { BOUNDS } from './config';
import { hashValue } from './hash';
import type { ModelMode, RatePath, ScenarioInput } from './types';
import { MODEL_VERSION, SCHEMA_VERSION } from './version';

export const DEFAULT_OFFER_RATE = 0.0625;

export function defaultScenario(portfolioHash: string, valuationMonth: string): ScenarioInput {
  return {
    schemaVersion: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    portfolioHash,
    baselineId: null,
    scenarioId: 'baseline',
    name: 'Baseline',
    valuationMonth,
    mode: 'behavioral',
    ratePath: { offerRate: DEFAULT_OFFER_RATE, shockBps: 0, shape: 'immediate', customPath: [] },
    behavioralParameters: {
      turnoverMultiplier: 1,
      refiMultiplier: 1,
      frictionBps: 50,
      burnout: true,
      seasonality: 'flat',
    },
    prepaymentParameters: { fixedCpr: 0.08, psaPercent: 100 },
    servicingParameters: { feeOverrideBps: null, costPerLoan: null, discountRate: 0.1 },
    recaptureParameters: { share: 0.2, contributionPerLoan: 1500, campaignCost: 0 },
    seed: 42,
    chartHorizon: 36,
  };
}

/**
 * The model-relevant inputs only. Controls that are disabled for the selected mode are
 * dropped, so they cannot change the hash or the result (N11). Names, ids and the chart
 * horizon are presentation and do not enter the hash (N13).
 */
export function effectiveInput(s: ScenarioInput) {
  const base = {
    schemaVersion: s.schemaVersion,
    modelVersion: s.modelVersion,
    portfolioHash: s.portfolioHash,
    valuationMonth: s.valuationMonth,
    mode: s.mode,
    seed: s.seed,
    servicingParameters: s.servicingParameters,
  };
  if (s.mode === 'behavioral') {
    const rp: RatePath = {
      offerRate: s.ratePath.offerRate,
      shockBps: s.ratePath.shockBps,
      shape: s.ratePath.shape,
      customPath: s.ratePath.shape === 'custom' ? s.ratePath.customPath : [],
    };
    return {
      ...base,
      ratePath: rp,
      behavioralParameters: s.behavioralParameters,
      recaptureParameters: s.recaptureParameters,
    };
  }
  if (s.mode === 'fixedCpr') return { ...base, fixedCpr: s.prepaymentParameters.fixedCpr };
  return { ...base, psaPercent: s.prepaymentParameters.psaPercent };
}

export function scenarioInputHash(s: ScenarioInput): string {
  return hashValue(effectiveInput(s));
}

/** Offer rate (annual decimal) for projection months 1..months. Index 0 = month 1. */
export function offerRatePath(rp: RatePath, months: number): Float64Array {
  const out = new Float64Array(months);
  const shock = rp.shockBps / 10_000;
  for (let i = 0; i < months; i++) {
    const t = i + 1;
    let level = rp.offerRate;
    let factor = 1;
    if (rp.shape === 'ramp12') factor = Math.min(t, 12) / 12;
    if (rp.shape === 'custom' && rp.customPath.length > 0) {
      level = rp.customPath[Math.min(i, rp.customPath.length - 1)];
    }
    out[i] = level + shock * factor;
  }
  return out;
}

export interface FieldError {
  field: string;
  message: string;
}

function checkRange(errors: FieldError[], field: string, v: number, b: { min: number; max: number }, label: string) {
  if (!Number.isFinite(v)) errors.push({ field, message: `${label} must be a number.` });
  else if (v < b.min || v > b.max) errors.push({ field, message: `${label} must be between ${b.min} and ${b.max}.` });
}

/** Bounds checks the engine enforces. Only mode-relevant inputs are checked. */
export function validateScenario(s: ScenarioInput): FieldError[] {
  const e: FieldError[] = [];
  const sp = s.servicingParameters;
  if (sp.feeOverrideBps !== null) checkRange(e, 'feeOverrideBps', sp.feeOverrideBps, BOUNDS.feeBps, 'Annual servicing fee (bps)');
  if (sp.costPerLoan !== null) checkRange(e, 'costPerLoan', sp.costPerLoan, BOUNDS.costPerLoan, 'Annual cost per active loan');
  checkRange(e, 'discountRate', sp.discountRate, BOUNDS.discountRate, 'Discount rate');
  if (s.mode === 'fixedCpr') checkRange(e, 'fixedCpr', s.prepaymentParameters.fixedCpr, BOUNDS.fixedCpr, 'Fixed annual CPR');
  if (s.mode === 'psa') checkRange(e, 'psaPercent', s.prepaymentParameters.psaPercent, BOUNDS.psaPercent, 'PSA multiplier');
  if (s.mode === 'behavioral') {
    const rp = s.ratePath;
    checkRange(e, 'offerRate', rp.offerRate, BOUNDS.offerRate, 'Mortgage offer rate');
    checkRange(e, 'shockBps', rp.shockBps, BOUNDS.shockBps, 'Rate shock (bps)');
    if (rp.shape === 'custom') {
      if (rp.customPath.length === 0) e.push({ field: 'customPath', message: 'A custom path needs at least one monthly rate.' });
      if (rp.customPath.length > 600) e.push({ field: 'customPath', message: 'A custom path can have at most 600 months.' });
      rp.customPath.forEach((r, i) => {
        if (!Number.isFinite(r)) e.push({ field: 'customPath', message: `Custom path month ${i + 1} is not a number.` });
      });
    }
    if (e.every((x) => x.field !== 'offerRate' && x.field !== 'shockBps' && x.field !== 'customPath')) {
      const n = rp.shape === 'custom' ? Math.max(rp.customPath.length, 12) : 12;
      const path = offerRatePath(rp, n);
      for (let i = 0; i < n; i++) {
        if (path[i] < BOUNDS.offerRate.min - 1e-12 || path[i] > BOUNDS.offerRate.max + 1e-12) {
          e.push({
            field: 'shockBps',
            message: `The shocked offer rate in month ${i + 1} is ${(path[i] * 100).toFixed(2)}%, outside the supported 1% to 15% range.`,
          });
          break;
        }
      }
    }
    const bp = s.behavioralParameters;
    checkRange(e, 'turnoverMultiplier', bp.turnoverMultiplier, BOUNDS.turnoverMultiplier, 'Turnover multiplier');
    checkRange(e, 'refiMultiplier', bp.refiMultiplier, BOUNDS.refiMultiplier, 'Refinance response multiplier');
    checkRange(e, 'frictionBps', bp.frictionBps, BOUNDS.frictionBps, 'Refinance friction (bps)');
    const rc = s.recaptureParameters;
    checkRange(e, 'recaptureShare', rc.share, BOUNDS.recaptureShare, 'Refinance recapture share');
    checkRange(e, 'contributionPerLoan', rc.contributionPerLoan, BOUNDS.contributionPerLoan, 'Net contribution per recaptured loan');
    checkRange(e, 'campaignCost', rc.campaignCost, BOUNDS.campaignCost, 'Incremental campaign cost');
  }
  return e;
}

export const MODE_LABELS: Record<ModelMode, string> = {
  behavioral: 'Behavioral (rate-responsive)',
  fixedCpr: 'Fixed CPR',
  psa: 'PSA benchmark',
};
