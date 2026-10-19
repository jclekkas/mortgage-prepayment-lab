import { useEffect, useId, useState } from 'react';
import { TermHelp } from './TermHelp';
import type { TermId } from './terms';

export type SourceClass = 'Market assumption' | 'Behavior assumption' | 'Teaching assumption' | 'Business decision' | 'Modeling assumption' | 'Convention' | 'Contract term';

export interface NumberControlProps {
  label: string;
  /** Stored value (e.g. 0.0625 for a rate). */
  value: number;
  /** Bounds in stored units. */
  min: number;
  max: number;
  /** Step in display units. */
  step: number;
  /** Multiply stored by this to display (100 for percent). */
  scale?: number;
  unit: string;
  defaultValue: number;
  onChange: (v: number) => void;
  help: string;
  source: SourceClass;
  disabledReason?: string | null;
  digits?: number;
  testId?: string;
  /** Adds a "What is this?" button explaining the term. */
  term?: TermId;
}

/** A slider paired with a keyboard-accessible number field, units, reset and explanation. */
export function NumberControl(p: NumberControlProps) {
  const id = useId();
  const scale = p.scale ?? 1;
  const digits = p.digits ?? 2;
  const shown = (v: number) => String(Number((v * scale).toFixed(digits)));
  const [text, setText] = useState(shown(p.value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(shown(p.value));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.value]);
  const disabled = !!p.disabledReason;
  const commitText = (t: string) => {
    setText(t);
    const v = Number(t);
    if (t.trim() === '' || !Number.isFinite(v)) {
      setError('Enter a number.');
      return;
    }
    const stored = v / scale;
    if (stored < p.min - 1e-12 || stored > p.max + 1e-12) {
      setError(`Allowed range: ${shown(p.min)} to ${shown(p.max)} ${p.unit}.`);
      return;
    }
    setError(null);
    p.onChange(stored);
  };
  const isDefault = Math.abs(p.value - p.defaultValue) < 1e-12;
  return (
    <div className={`control${disabled ? ' disabled' : ''}`} data-testid={p.testId}>
      <div className="control-head">
        <span>
          <label htmlFor={`${id}-n`}>{p.label}</label>
          {p.term && <TermHelp id={p.term} />}
        </span>
        <span className="source">{p.source}</span>
      </div>
      <div className="control-inputs">
        <input
          type="range"
          aria-label={`${p.label} slider`}
          aria-describedby={`${id}-h`}
          min={p.min * scale}
          max={p.max * scale}
          step={p.step}
          value={p.value * scale}
          disabled={disabled}
          aria-valuetext={`${shown(p.value)} ${p.unit}`}
          onChange={(e) => commitText(e.target.value)}
        />
        <span className="row" style={{ gap: '0.25rem', flexWrap: 'nowrap' }}>
          <input
            id={`${id}-n`}
            type="number"
            inputMode="decimal"
            min={p.min * scale}
            max={p.max * scale}
            step={p.step}
            value={text}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={`${id}-h${error ? ` ${id}-e` : ''}`}
            onChange={(e) => commitText(e.target.value)}
          />
          <span aria-hidden="true">{p.unit}</span>
        </span>
        <button type="button" className="link" disabled={disabled || isDefault} onClick={() => p.onChange(p.defaultValue)} aria-label={`Reset ${p.label} to ${shown(p.defaultValue)} ${p.unit}`}>
          Reset
        </button>
      </div>
      {error && (
        <p className="help" id={`${id}-e`} role="alert" style={{ color: 'var(--err-ink)' }}>
          {error}
        </p>
      )}
      <p className="help" id={`${id}-h`}>
        {disabled ? <strong>Disabled: {p.disabledReason} </strong> : null}
        {p.help}
      </p>
    </div>
  );
}
