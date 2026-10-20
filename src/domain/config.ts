/**
 * Behavioral-mode coefficients. These are deliberately illustrative teaching values,
 * versioned with the model. They are not FICO parameters and not empirically
 * calibrated estimates. See docs/METHODOLOGY.md.
 */
export const BEHAVIORAL_COEFFICIENTS = {
  version: 'behavioral-coeff-1.0.0',
  /** Monthly turnover (move / home sale) hazard at multiplier 1. */
  baseTurnoverHazard: 0.003,
  /** Monthly refinance hazard scale at full incentive, seasoning and propensity 1. */
  baseRefiHazard: 0.04,
  /** Incentive (bps) that moves the sigmoid by one unit of z. */
  incentiveScaleBps: 50,
  /** Months until the seasoning factor reaches 1. */
  seasoningMonths: 30,
  /** Burnout decay per prior month of positive effective incentive. */
  burnoutDecay: 0.02,
} as const;

/**
 * Disclosed seasonal preset for turnover. Arithmetic mean is exactly 1, so it shifts
 * timing within a year without changing the average annual turnover level.
 * Index 0 = January.
 */
export const SEASONAL_TURNOVER_PRESET: readonly number[] = [
  0.8, 0.8, 0.95, 1.05, 1.15, 1.2, 1.2, 1.15, 1.05, 0.95, 0.85, 0.85,
];

/** Supported bounds for user inputs. The UI and the import validator both read these. */
export const BOUNDS = {
  offerRate: { min: 0.01, max: 0.15 },
  shockBps: { min: -300, max: 300 },
  fixedCpr: { min: 0, max: 0.6 },
  psaPercent: { min: 0, max: 500 },
  turnoverMultiplier: { min: 0, max: 2 },
  refiMultiplier: { min: 0, max: 2 },
  frictionBps: { min: 0, max: 200 },
  feeBps: { min: 0, max: 100 },
  costPerLoan: { min: 0, max: 1000 },
  discountRate: { min: 0, max: 0.3 },
  recaptureShare: { min: 0, max: 1 },
  contributionPerLoan: { min: -10000, max: 10000 },
  campaignCost: { min: 0, max: 1_000_000 },
} as const;

export const CHART_HORIZONS = [12, 36, 60] as const;
export type ChartHorizon = (typeof CHART_HORIZONS)[number];

/** Import limits. */
export const IMPORT_LIMITS = { maxBytes: 10 * 1024 * 1024, maxLoans: 10_000 } as const;
