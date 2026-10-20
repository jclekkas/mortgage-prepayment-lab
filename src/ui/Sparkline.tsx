/**
 * A tiny line with no axes. The scenario line is accent blue and the baseline a 1px dashed grey;
 * green and red are reserved for better / worse tags, so the line itself never carries a judgment.
 */
export function Sparkline({ lines, label, height = 30, className }: { lines: { values: number[]; dashed?: boolean }[]; label: string; height?: number; className?: string }) {
  const w = 140;
  let lo = Infinity, hi = -Infinity;
  for (const l of lines) for (const v of l.values) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return null;
  if (hi === lo) { hi += 1; lo -= 1; }
  return (
    <svg className={className} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ width: '100%', height, display: 'block', overflow: 'visible' }}>
      {lines.map((l, i) => {
        const n = l.values.length;
        const pts = l.values.map((v, k) => `${(n === 1 ? w / 2 : (k * w) / (n - 1)).toFixed(1)},${(2 + (height - 4) * (1 - (v - lo) / (hi - lo))).toFixed(1)}`).join(' ');
        return <polyline key={i} points={pts} fill="none" stroke={l.dashed ? 'var(--neutral-line)' : 'var(--accent)'} strokeWidth={l.dashed ? 1 : 1.6} strokeDasharray={l.dashed ? '3 3' : undefined} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}
