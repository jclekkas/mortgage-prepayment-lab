import type { InputChange } from '../../domain/diff';

/** "Rate shock: 0 basis points → −100 basis points; …", or a fallback when the edit is not a listed input. */
export function pendingText(pending: InputChange[]): string {
  return pending.length ? pending.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ') : 'inputs changed';
}
