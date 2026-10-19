/** Display formatting only. Never used inside calculations. */
const NA = 'Not applicable';

export function usd(v: number | null | undefined, opts: { compact?: boolean; signed?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = opts.signed && v > 0 ? '+' : v < 0 ? '−' : '';
  const a = Math.abs(v);
  let body: string;
  if (opts.compact && a >= 1e9) body = `$${(a / 1e9).toFixed(2)}B`;
  else if (opts.compact && a >= 1e6) body = `$${(a / 1e6).toFixed(2)}M`;
  else if (opts.compact && a >= 1e4) body = `$${(a / 1e3).toFixed(1)}K`;
  else body = `$${a.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 2 : 0, minimumFractionDigits: a < 100 && a > 0 ? 2 : 0 })}`;
  return `${sign}${body}`;
}

/** Exact dollars with cents (ledgers, CSV-like tables). */
export function usdExact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `−$${s}` : `$${s}`;
}

/** A decimal rate as a percent. */
export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${(v * 100).toFixed(digits)}%`;
}

/** Difference of two rates in percentage points. */
export function pp(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v * 100).toFixed(digits)} pp`;
}

export function bps(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)} bps`;
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function years(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${v.toFixed(2)} years`;
}

export function signedPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v * 100).toFixed(digits)}%`;
}
