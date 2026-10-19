import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { newScenarioId, useStore } from '../../app/store';
import { pct, usd } from '../../domain/format';
import type { GridAxis, GridResult } from '../../domain/sensitivity';
import { Notice, Progress } from '../../ui/misc';
import { JobCancelled } from '../../worker/client';

const axisFmt = (a: GridAxis, v: number) => (a.format === 'pct' ? pct(v) : a.format === 'psa' ? `${v}% PSA` : `${v.toFixed(2)}×`);

export function GridPanel() {
  const { client, state, active, dispatch } = useStore();
  const input = active.run.outputInput;
  const [grid, setGrid] = useState<GridResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const handle = useRef<{ id: number; cancel: () => void } | null>(null);
  const key = JSON.stringify([input, state.filter]);
  useEffect(() => {
    setGrid(null);
    setProgress(null);
    return () => handle.current?.cancel();
  }, [key]);
  if (!input) return null;
  const cancelGrid = () => {
    const h = handle.current;
    handle.current = null; // detach first so late progress from this job is ignored
    h?.cancel();
    setProgress(null);
  };
  const go = () => {
    handle.current?.cancel();
    let id = -1;
    // Progress can still arrive after Cancel; only the live job may update the bar.
    const h = client.request({ kind: 'grid', scenario: input, filter: state.filter }, (d, t) => { if (handle.current?.id === id) setProgress(d / t); });
    id = h.id;
    handle.current = h;
    setProgress(0);
    setError(null);
    h.promise.then(
      ({ result }) => { if (handle.current?.id === h.id) { setGrid(result); setProgress(null); } },
      (e: Error) => {
        if (handle.current?.id !== h.id) return;
        setProgress(null);
        if (!(e instanceof JobCancelled)) setError(e.message);
      },
    );
  };
  const values = grid?.cells.map((c) => c.servicingNpv).filter((v): v is number => v !== null) ?? [];
  const lo = Math.min(...values), hi = Math.max(...values);
  const shade = (v: number | null) => (v === null || hi === lo ? 0.15 : 0.12 + 0.6 * ((v - lo) / (hi - lo)));
  const pick = (r: number, c: number) => {
    const cell = grid!.cells.find((x) => x.row === r && x.col === c)!;
    if (state.slots.length >= 4) { setMsg('You already have four scenarios. Delete one in the scenario lab to add a grid cell.'); return; }
    const id = newScenarioId();
    const name = `Grid: ${grid!.rowAxis.label.split(' (')[0]} ${axisFmt(grid!.rowAxis, grid!.rowAxis.values[r])}, ${grid!.colAxis.label.toLowerCase()} ${axisFmt(grid!.colAxis, grid!.colAxis.values[c])}`.slice(0, 120);
    dispatch({ type: 'addScenario', scenario: { ...cell.scenario, scenarioId: id, name, baselineId: state.baselineId } });
    // The store re-runs every scenario when the scenario list changes, so the new cell runs automatically.
    navigate('lab');
  };
  return (
    <section className="card" aria-labelledby="grid-h" data-testid="grid-panel">
      <h2 id="grid-h">Two-way sensitivity grid: {input.name}</h2>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        {input.mode === 'behavioral' ? 'Mortgage offer rate versus refinance response.' : input.mode === 'fixedCpr' ? 'Fixed CPR versus discount rate.' : 'PSA multiplier versus discount rate.'} Each cell is a full recalculation of illustrative servicing NPV. Select a cell to open it as a scenario you can inspect.
      </p>
      {!grid && progress === null && <button type="button" onClick={go} data-testid="grid-run">Calculate grid (25 scenarios)</button>}
      {progress !== null && (
        <div className="row">
          <span>Calculating grid…</span>
          <Progress value={progress} label="Grid progress" />
          <button type="button" onClick={cancelGrid} data-testid="grid-cancel">Cancel</button>
        </div>
      )}
      {error && <Notice kind="err">{error}</Notice>}
      {msg && <Notice kind="warn">{msg}</Notice>}
      {grid && (
        <>
          <p className="muted" style={{ fontSize: '0.85rem' }}>{grid.note} Darker cells have higher NPV; every cell also prints its value.</p>
          <div className="table-wrap">
            <table className="heat">
              <caption>Illustrative servicing NPV. Rows: {grid.rowAxis.label}. Columns: {grid.colAxis.label}.</caption>
              <thead>
                <tr>
                  <th scope="col">{grid.rowAxis.label.split(' (')[0]} \ {grid.colAxis.label}</th>
                  {grid.colAxis.values.map((v) => <th scope="col" key={v}>{axisFmt(grid.colAxis, v)}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.rowAxis.values.map((rv, r) => (
                  <tr key={rv}>
                    <th scope="row">{axisFmt(grid.rowAxis, rv)}</th>
                    {grid.colAxis.values.map((cv, c) => {
                      const cell = grid.cells.find((x) => x.row === r && x.col === c)!;
                      return (
                        <td key={cv} style={{ padding: 2 }}>
                          <button type="button" onClick={() => pick(r, c)} style={{ background: `color-mix(in srgb, var(--s1) ${Math.round(shade(cell.servicingNpv) * 100)}%, var(--surface))` }}
                            aria-label={`${axisFmt(grid.rowAxis, rv)}, ${axisFmt(grid.colAxis, cv)}: NPV ${usd(cell.servicingNpv, { compact: true })}. Open as scenario.`}>
                            {cell.error ? 'Error' : usd(cell.servicingNpv, { compact: true })}
                            <span className="sr-only">{cell.servicingValueBps?.toFixed(1)} bps</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
