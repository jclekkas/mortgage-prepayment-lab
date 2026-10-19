import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../app/store';
import { pp, usd } from '../../domain/format';
import type { SensitivityRow } from '../../domain/sensitivity';
import type { ScenarioInput } from '../../domain/types';
import { DeltaBars, Notice, Progress } from '../../ui/misc';
import { JobCancelled } from '../../worker/client';

export function SensitivityPanel({ input }: { input: ScenarioInput }) {
  const { client, state } = useStore();
  const [rows, setRows] = useState<SensitivityRow[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<{ id: number; cancel: () => void } | null>(null);
  const key = JSON.stringify([input, state.filter]);
  useEffect(() => {
    setRows(null);
    setStatus('idle');
    return () => handle.current?.cancel();
  }, [key]);
  const go = () => {
    handle.current?.cancel();
    const h = client.request({ kind: 'sensitivity', scenario: input, filter: state.filter }, (d, t) => setProgress(t ? d / t : 0));
    handle.current = h;
    setProgress(0);
    setStatus('running');
    h.promise.then(
      ({ result }) => {
        if (handle.current?.id !== h.id) return;
        setRows(result);
        setStatus('idle');
      },
      (e: Error) => {
        if (handle.current?.id !== h.id) return;
        if (e instanceof JobCancelled) {
          setStatus('idle');
          return;
        }
        setError(e.message);
        setStatus('error');
      },
    );
  };
  return (
    <section className="card" aria-labelledby="sens-h" data-testid="sensitivity-panel">
      <h3 id="sens-h">One-factor sensitivities for {input.name}</h3>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Each row changes one assumption from this scenario and keeps everything else. The effects interact, so they are <strong>not additive</strong>: their sum is not the total change from moving several at once.
      </p>
      {!rows && status !== 'running' && (
        <button type="button" onClick={go} data-testid="sensitivity-run">
          Calculate sensitivities
        </button>
      )}
      {status === 'running' && (
        <div className="row">
          <span>Calculating sensitivities…</span>
          <Progress value={progress} label="Sensitivity progress" />
          <button type="button" onClick={() => handle.current?.cancel()} data-testid="sensitivity-cancel">Cancel</button>
        </div>
      )}
      {status === 'error' && <Notice kind="err">{error}</Notice>}
      {rows && (
        <>
          <DeltaBars
            caption="Change in illustrative servicing net present value (NPV)"
            format={(v) => usd(v, { compact: true, signed: true })}
            rows={rows.map((r) => ({ label: `${r.label} (${r.change})`, value: r.npvDelta, note: r.skippedReason ?? undefined }))}
          />
          <div className="table-wrap">
            <table>
              <caption>Details</caption>
              <thead>
                <tr><th scope="col">Change</th><th scope="col">Servicing NPV</th><th scope="col">12-month prepaid</th><th scope="col">Next-month CPR, percentage points</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}: {r.change}</th>
                    <td>{r.npvDelta === null ? r.skippedReason : usd(r.npvDelta, { compact: true, signed: true })}</td>
                    <td>{r.prepaid12Delta === null ? 'Not applicable' : usd(r.prepaid12Delta, { compact: true, signed: true })}</td>
                    <td>{pp(r.nextMonthCprDelta)}</td>
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
