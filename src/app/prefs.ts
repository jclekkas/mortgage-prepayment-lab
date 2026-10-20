import { useCallback, useState } from 'react';

/**
 * Per-device display preferences (assumption panel width, single-key shortcuts). Not part of the
 * saved workspace or any export. Storage can be unavailable (private windows, blocked site data),
 * so every read and write is guarded and the app works without it.
 */
const PREFIX = 'mpl-pref:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* preference simply not remembered */
  }
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const set = useCallback((v: T) => {
    setValue(v);
    write(key, v);
  }, [key]);
  return [value, set];
}

export const CTRL_W = { min: 260, max: 600, initial: 340 } as const;
export const clampCtrlW = (w: number) => Math.max(CTRL_W.min, Math.min(CTRL_W.max, Math.round(w)));
