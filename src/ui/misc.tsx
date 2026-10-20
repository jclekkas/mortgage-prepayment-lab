import type { ReactNode } from 'react';

export function Notice({ kind, children, role }: { kind: 'warn' | 'err' | 'ok' | 'info'; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={`notice ${kind}`} role={role}>{children}</div>;
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/** Horizontal bars around a zero midline, with the number always printed (no color-only meaning). */
export function DeltaBars({ rows, format, caption }: { rows: { label: string; value: number | null; note?: string }[]; format: (v: number) => string; caption: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value ?? 0)));
  return (
    <div role="table" aria-label={caption}>
      <div role="rowgroup">
        {rows.map((r) => (
          <div className="bar-row" role="row" key={r.label}>
            <span role="rowheader">{r.label}</span>
            <span className="bar-track" role="cell" aria-hidden="true">
              <span className="bar-mid" />
              {r.value !== null && (
                <span
                  className="bar-fill"
                  style={{
                    left: r.value >= 0 ? '50%' : `${50 - (Math.abs(r.value) / max) * 50}%`,
                    width: `${(Math.abs(r.value) / max) * 50}%`,
                    background: r.value >= 0 ? 'var(--s1)' : 'var(--s2)',
                  }}
                />
              )}
            </span>
            <span role="cell" style={{ textAlign: 'right' }}>{r.value === null ? (r.note ?? 'Not applicable') : format(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
