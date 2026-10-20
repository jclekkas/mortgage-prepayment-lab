/**
 * Pure conversion and benchmark functions. Rates are annual decimals unless named
 * otherwise; nothing here rounds.
 */

/** Single monthly mortality from annual conditional prepayment rate. */
export function cprToSmm(cpr: number): number {
  if (cpr <= 0) return 0;
  if (cpr >= 1) return 1;
  // expm1/log1p keep precision for small speeds.
  return -Math.expm1(Math.log1p(-cpr) / 12);
}

/** Annual conditional prepayment rate from single monthly mortality. */
export function smmToCpr(smm: number): number {
  if (smm <= 0) return 0;
  if (smm >= 1) return 1;
  return -Math.expm1(12 * Math.log1p(-smm));
}

/**
 * Geometric annualization of k monthly SMMs: 1 - [prod(1 - SMM_t)]^(12/k).
 * Returns null when there are no applicable months.
 */
export function geometricAnnualCpr(smms: readonly (number | null)[]): number | null {
  const valid = smms.filter((s): s is number => s !== null);
  if (valid.length === 0) return null;
  let survival = 1;
  for (const s of valid) survival *= 1 - s;
  if (survival <= 0) return 1;
  return 1 - Math.pow(survival, 12 / valid.length);
}

/** Ratio that is "not applicable" (null) when the denominator is zero. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  return numerator / denominator;
}

/** 100% PSA annual CPR at loan age a (months): min(0.002 a, 0.06), scaled by PSA%/100. */
export function psaCpr(ageMonths: number, psaPercent: number): number {
  const base = Math.min(0.002 * Math.max(ageMonths, 0), 0.06);
  return Math.min(1, base * (psaPercent / 100));
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/** Discount factor for a cash flow received at the end of month t at annual effective rate d. */
export function discountFactor(annualRate: number, month: number): number {
  return Math.pow(1 + annualRate, -month / 12);
}

/** Level monthly principal-and-interest payment. A = B r / (1 - (1+r)^-n); r = 0 gives B/n. */
export function levelPayment(balance: number, annualRate: number, months: number): number {
  if (months <= 0) return balance;
  const r = annualRate / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

/** Contractual balance after k scheduled payments at payment A (no prepayment). */
export function balanceAfter(
  originalBalance: number,
  annualRate: number,
  payment: number,
  paymentsMade: number,
): number {
  const r = annualRate / 12;
  let b = originalBalance;
  for (let k = 0; k < paymentsMade; k++) {
    const interest = b * r;
    const principal = Math.min(b, Math.max(0, payment - interest));
    b -= principal;
  }
  return b;
}
