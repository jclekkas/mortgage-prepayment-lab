/** Shown in place of results that are missing or belong to a different population. */
export function BlockedNotice({ what, blockers }: { what: string; blockers: string[] }) {
  if (blockers.length === 0) return <p className="muted">{what}: calculating for the current population…</p>;
  return (
    <div className="notice warn" role="status" data-testid="results-blocked">
      <strong>{what}: not shown, because a result is for a different population.</strong>
      <ul style={{ margin: '0.25rem 0 0' }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
    </div>
  );
}
