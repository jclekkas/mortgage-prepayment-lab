/** Calendar helpers for 'YYYY-MM' month strings. */
export function parseMonth(m: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) throw new Error(`Invalid month "${m}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month "${m}"`);
  return { year, month };
}

export function addMonths(m: string, k: number): string {
  const { year, month } = parseMonth(m);
  const idx = year * 12 + (month - 1) + k;
  const y = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${y}-${String(mm).padStart(2, '0')}`;
}

/** 0-based calendar month (0 = January) of month k after the as-of month. */
export function calendarMonthIndex(asOf: string, k: number): number {
  const { month } = parseMonth(addMonths(asOf, k));
  return month - 1;
}

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatMonth(m: string): string {
  const { year, month } = parseMonth(m);
  return `${NAMES[month - 1]} ${year}`;
}
