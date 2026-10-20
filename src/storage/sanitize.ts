/** Strip control characters (except newline/tab) and cap length for user-entered text. */
export function cleanText(s: string, max = 2000): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

/**
 * Neutralize spreadsheet formula injection: a cell starting with = + - @ tab or CR is
 * prefixed with a single quote so spreadsheet apps treat it as text.
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'not applicable';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'not applicable';
    return String(v);
  }
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
