import { useId, useRef, type ReactNode } from 'react';

export interface TabDef { id: string; label: string }

/** Accessible tabs: arrow keys, Home and End move between tabs; only the selected panel renders. */
export function Tabs({ tabs, selected, onSelect, label, children, testId }: { tabs: TabDef[]; selected: string; onSelect: (id: string) => void; label: string; children: ReactNode; testId?: string }) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const cur = tabs.some((t) => t.id === selected) ? selected : tabs[0].id;
  const move = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onSelect(t.id);
    list.current?.querySelector<HTMLElement>(`[data-tab="${t.id}"]`)?.focus();
  };
  return (
    <div data-testid={testId}>
      <div className="tabs" role="tablist" aria-label={label} ref={list}
        onKeyDown={(e) => {
          const i = tabs.findIndex((t) => t.id === cur);
          if (e.key === 'ArrowRight') { move(i + 1); e.preventDefault(); }
          else if (e.key === 'ArrowLeft') { move(i - 1); e.preventDefault(); }
          else if (e.key === 'Home') { move(0); e.preventDefault(); }
          else if (e.key === 'End') { move(tabs.length - 1); e.preventDefault(); }
        }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`${base}-${t.id}`} aria-selected={t.id === cur} aria-controls={`${base}-panel`}
            tabIndex={t.id === cur ? 0 : -1} data-tab={t.id} data-testid={`tab-${t.id}`} onClick={() => onSelect(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${cur}`}>
        {children}
      </div>
    </div>
  );
}
