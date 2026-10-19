import type { Loan, PopulationFilter, SegmentDimension } from './types';

interface Band {
  key: string;
  label: string;
  test: (loan: Loan) => boolean;
}

const between = (lo: number, hi: number) => (v: number) => v >= lo && v < hi;

const COUPON: Band[] = [
  { key: 'lt4', label: 'Below 4.00%', test: (l) => l.noteRate < 0.04 },
  { key: '4to5', label: '4.00% to 4.99%', test: (l) => between(0.04, 0.05)(l.noteRate) },
  { key: '5to6', label: '5.00% to 5.99%', test: (l) => between(0.05, 0.06)(l.noteRate) },
  { key: '6to7', label: '6.00% to 6.99%', test: (l) => between(0.06, 0.07)(l.noteRate) },
  { key: 'ge7', label: '7.00% and above', test: (l) => l.noteRate >= 0.07 },
];

const AGE: Band[] = [
  { key: '0to12', label: '0 to 12 months old', test: (l) => l.ageMonths <= 12 },
  { key: '13to36', label: '13 to 36 months old', test: (l) => l.ageMonths > 12 && l.ageMonths <= 36 },
  { key: '37to60', label: '37 to 60 months old', test: (l) => l.ageMonths > 36 && l.ageMonths <= 60 },
  { key: 'gt60', label: 'Over 60 months old', test: (l) => l.ageMonths > 60 },
];

const TERM: Band[] = [
  { key: 'le240', label: '240 months or fewer left', test: (l) => l.remainingTerm <= 240 },
  { key: '241to300', label: '241 to 300 months left', test: (l) => l.remainingTerm > 240 && l.remainingTerm <= 300 },
  { key: '301to330', label: '301 to 330 months left', test: (l) => l.remainingTerm > 300 && l.remainingTerm <= 330 },
  { key: 'gt330', label: 'Over 330 months left', test: (l) => l.remainingTerm > 330 },
];

const BALANCE: Band[] = [
  { key: 'lt200', label: 'Under $200k', test: (l) => l.currentBalance < 200_000 },
  { key: '200to400', label: '$200k to $400k', test: (l) => between(200_000, 400_000)(l.currentBalance) },
  { key: '400to600', label: '$400k to $600k', test: (l) => between(400_000, 600_000)(l.currentBalance) },
  { key: 'ge600', label: '$600k and above', test: (l) => l.currentBalance >= 600_000 },
];

const PROPENSITY: Band[] = [
  { key: 'low', label: 'Low (0.50 to 0.83)', test: (l) => l.refiPropensity < 5 / 6 },
  { key: 'mid', label: 'Middle (0.83 to 1.17)', test: (l) => l.refiPropensity >= 5 / 6 && l.refiPropensity < 7 / 6 },
  { key: 'high', label: 'High (1.17 to 1.50)', test: (l) => l.refiPropensity >= 7 / 6 },
];

export const DIMENSIONS: readonly SegmentDimension[] = [
  'coupon',
  'age',
  'remainingTerm',
  'balance',
  'state',
  'propensity',
];

export const DIMENSION_LABELS: Record<SegmentDimension, string> = {
  coupon: 'Note rate (coupon)',
  age: 'Loan age',
  remainingTerm: 'Remaining term',
  balance: 'Current balance',
  state: 'State',
  propensity: 'Synthetic refinance propensity',
};

const STATIC_BANDS: Partial<Record<SegmentDimension, Band[]>> = {
  coupon: COUPON,
  age: AGE,
  remainingTerm: TERM,
  balance: BALANCE,
  propensity: PROPENSITY,
};

/** Bucket key of a loan along a dimension. */
export function segmentKey(loan: Loan, dim: SegmentDimension): string {
  if (dim === 'state') return loan.state;
  const bands = STATIC_BANDS[dim]!;
  for (const b of bands) if (b.test(loan)) return b.key;
  return 'other';
}

export function segmentOptions(dim: SegmentDimension, loans: readonly Loan[]): { key: string; label: string }[] {
  if (dim === 'state') {
    return [...new Set(loans.map((l) => l.state))].sort().map((s) => ({ key: s, label: s }));
  }
  return STATIC_BANDS[dim]!.map(({ key, label }) => ({ key, label }));
}

export function segmentLabel(dim: SegmentDimension, key: string): string {
  if (dim === 'state') return key;
  return STATIC_BANDS[dim]!.find((b) => b.key === key)?.label ?? key;
}

export function isFilterEmpty(filter: PopulationFilter): boolean {
  return DIMENSIONS.every((d) => !filter[d] || filter[d]!.length === 0);
}

export function matchesFilter(loan: Loan, filter: PopulationFilter): boolean {
  for (const d of DIMENSIONS) {
    const allowed = filter[d];
    if (allowed && allowed.length > 0 && !allowed.includes(segmentKey(loan, d))) return false;
  }
  return true;
}

/** Normalized filter: sorted, de-duplicated, empty dimensions removed. Used for cache keys. */
export function normalizeFilter(filter: PopulationFilter): PopulationFilter {
  const out: PopulationFilter = {};
  for (const d of DIMENSIONS) {
    const v = filter[d];
    if (v && v.length > 0) out[d] = [...new Set(v)].sort();
  }
  return out;
}

export function describeFilter(filter: PopulationFilter): string {
  const parts: string[] = [];
  for (const d of DIMENSIONS) {
    const v = filter[d];
    if (v && v.length > 0) parts.push(`${DIMENSION_LABELS[d]}: ${v.map((k) => segmentLabel(d, k)).join(', ')}`);
  }
  return parts.length ? parts.join('; ') : 'Whole portfolio';
}
