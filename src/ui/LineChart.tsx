import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { TermHelp } from './TermHelp';
import type { TermId } from './terms';

export interface Series {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export interface LineChartProps {
  title: string;
  /** Plain-English axis description, shown under the caption. */
  axes?: string;
  /** Adds a "What is this?" button after the title. */
  term?: TermId;
  /** Plain-language summary for screen readers and as the visible caption. */
  summary: string;
  series: Series[];
  xLabels: string[];
  yFormat: (v: number) => string;
  selectedIndex: number | null;
  onSelect?: (i: number) => void;
  includeZero?: boolean;
  testId?: string;
  /** Stack series (areas) instead of lines. */
  stacked?: boolean;
}

const W = 640, H = 260, M = { l: 80, r: 14, t: 12, b: 30 };

export function LineChart(p: LineChartProps) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const n = p.xLabels.length;
  const { lo, hi, paths, stackedVals } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    const stackedVals: (number | null)[][] = [];
    if (p.stacked) {
      const acc = new Array<number>(n).fill(0);
      for (const s of p.series) {
        const row = s.values.slice(0, n).map((v, i) => (v === null ? null : (acc[i] += v)));
        stackedVals.push(row);
      }
    }
    const src = p.stacked ? stackedVals : p.series.map((s) => s.values.slice(0, n));
    for (const vals of src) for (const v of vals) if (v !== null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (p.includeZero || p.stacked) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi === lo) { hi = lo + (Math.abs(lo) || 1) * 0.1; lo = lo - (Math.abs(lo) || 1) * 0.1; }
    const pad = (hi - lo) * 0.05;
    if (!(p.includeZero || p.stacked) || lo < 0) lo -= pad;
    hi += pad;
    const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
    const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
    const paths = src.map((vals, si) => {
      let d = '';
      let pen = false;
      vals.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      let area = '';
      if (p.stacked) {
        const below = si === 0 ? vals.map(() => 0) : src[si - 1];
        const top = vals.map((v, i) => `${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`);
        const bottom = below.map((v, i) => `${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`).reverse();
        area = `M${top.join('L')}L${bottom.join('L')}Z`;
      }
      return { d, area };
    });
    return { lo, hi, paths, stackedVals };
  }, [p.series, p.stacked, p.includeZero, n]);

  const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1];
  const sel = p.selectedIndex !== null && p.selectedIndex < n ? p.selectedIndex : null;

  const onKey = (e: KeyboardEvent) => {
    if (!p.onSelect || n === 0) return;
    const cur = sel ?? 0;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1);
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = n - 1;
    if (next !== null) { e.preventDefault(); p.onSelect(next); }
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!p.onSelect || n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1));
    p.onSelect(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <figure className="chart card chart-card" data-testid={p.testId} style={{ margin: 0 }}>
      <div className="chart-head">
        <div>
          <h3 id={`${id}-t`} style={{ display: 'inline' }}>{p.title}</h3>
          {p.term && <TermHelp id={p.term} />}
        </div>
        <button type="button" className="link" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <figcaption className="muted" style={{ fontSize: '0.85rem' }}>{p.summary}</figcaption>
      {p.axes && <p className="chart-axes">{p.axes}</p>}
      <div className="legend" aria-hidden="true">
        {p.series.map((s) => (
          <span key={s.id} style={{ color: s.color }}>
            <span className={`swatch${s.dashed ? ' dashed' : ''}`} />
            <span style={{ color: 'var(--text)' }}>{s.label}</span>
          </span>
        ))}
      </div>
      {showTable ? (
        <div className="table-wrap tall">
          <table>
            <caption className="sr-only">{p.title}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {p.series.map((s) => <th scope="col" key={s.id}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {p.xLabels.map((lab, i) => (
                <tr key={lab} className={i === sel ? 'selected' : undefined}>
                  <th scope="row">{p.onSelect ? <button type="button" className="link" onClick={() => p.onSelect!(i)}>{lab}</button> : lab}</th>
                  {p.series.map((s) => <td key={s.id}>{s.values[i] === null || s.values[i] === undefined ? 'Not applicable' : p.yFormat(s.values[i]!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-t ${id}-d`}
          tabIndex={p.onSelect ? 0 : undefined}
          onKeyDown={onKey}
          onClick={onClick}
          style={{ cursor: p.onSelect ? 'crosshair' : undefined }}
        >
          <desc id={`${id}-d`}>
            {p.summary} {p.onSelect ? 'Use left and right arrow keys to move the selected month.' : ''}
            {sel !== null ? ` Selected ${p.xLabels[sel]}: ${p.series.map((s) => `${s.label} ${s.values[sel] === null ? 'not applicable' : p.yFormat(s.values[sel]!)}`).join(', ')}.` : ''}
          </desc>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={M.l - 6} y={y(t) + 4} textAnchor="end">{p.yFormat(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{p.xLabels[i]}</text>
          ))}
          {p.stacked && paths.map((pa, i) => <path key={`a${i}`} d={pa.area} fill={p.series[i].color} opacity={0.35} />)}
          {paths.map((pa, i) => (
            <path key={p.series[i].id} d={pa.d} fill="none" stroke={p.series[i].color} strokeWidth={2.2} strokeDasharray={p.series[i].dashed ? '6 4' : undefined} />
          ))}
          {sel !== null && (
            <g>
              <line x1={x(sel)} x2={x(sel)} y1={M.t} y2={H - M.b} stroke="var(--text)" strokeDasharray="2 3" />
              {(p.stacked ? stackedVals : p.series.map((s) => s.values)).map((vals, i) =>
                vals[sel] !== null && vals[sel] !== undefined ? <circle key={i} cx={x(sel)} cy={y(vals[sel]!)} r={4} fill={p.series[i].color} /> : null,
              )}
            </g>
          )}
        </svg>
      )}
      {sel !== null && !showTable && (
        <p className="muted" style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
          {p.xLabels[sel]}: {p.series.map((s) => `${s.label} ${s.values[sel] === null ? 'not applicable' : p.yFormat(s.values[sel]!)}`).join(' · ')}
        </p>
      )}
    </figure>
  );
}
