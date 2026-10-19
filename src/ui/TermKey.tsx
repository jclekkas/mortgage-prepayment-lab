/** Every abbreviation the app shows, spelled out once at the top of each screen that uses it. */
export const TERMS = {
  UPB: 'unpaid principal balance',
  CPR: 'conditional prepayment rate (annualized prepayment speed)',
  SMM: 'single monthly mortality (monthly prepayment rate)',
  PSA: 'Public Securities Association prepayment benchmark',
  NPV: 'net present value',
  PV: 'present value',
  WAL: 'weighted-average life',
  bps: 'basis points (100 bps = 1 percentage point)',
  pp: 'percentage points',
  MSR: 'mortgage servicing right',
  MBS: 'mortgage-backed security',
  ARM: 'adjustable-rate mortgage',
  OCC: 'Office of the Comptroller of the Currency',
  JSON: 'JavaScript Object Notation, a plain-text data file',
  CSV: 'comma-separated values, a spreadsheet-readable file',
  PDF: 'Portable Document Format',
  MB: 'megabytes',
} as const;

export type Term = keyof typeof TERMS;

export function TermKey({ terms }: { terms: Term[] }) {
  return (
    <p className="term-key muted" data-testid="term-key">
      Abbreviations on this page:{' '}
      {terms.map((t, i) => (
        <span key={t}>
          {i > 0 && '; '}
          <strong>{t}</strong>, {TERMS[t]}
        </span>
      ))}
      .
    </p>
  );
}
