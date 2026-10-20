/**
 * Synthetic presets must be identical in every JavaScript engine, or files exported in one
 * browser fail to import in another. These fingerprints were computed in Node 22 (V8),
 * Chromium 141 (V8) and Bun 1.4 (JavaScriptCore, Safari's engine) and agreed. The end-to-end
 * suite checks the same fingerprint in WebKit through an exported file.
 */
import { describe, expect, it } from 'vitest';
import { PRESETS, loadPreset } from '../../src/data/presets';

export const PRESET_FINGERPRINTS: Record<string, string> = {
  mixed: '4cbb1778461547d31453250d174554dee9f29790fdbdedcd8e87cd7bf9f469c5',
  'seasoned-low-rate': 'ea75abec73c032426f05204b3e37030f7f843570838ce541c1f1803b26b65727',
  'recent-high-rate': '863ce64ae82597e300ca1cc4125669ecfdcb94d31616dd8b4125388cacbee42d',
};

describe('synthetic generator determinism', () => {
  it('every preset matches its pinned cross-engine fingerprint', () => {
    for (const p of PRESETS) expect(loadPreset(p.id).meta.hash, p.id).toBe(PRESET_FINGERPRINTS[p.id]);
  });
  it('generated amounts are whole cents', () => {
    for (const p of PRESETS) {
      for (const l of loadPreset(p.id).loans) {
        expect(Math.round(l.currentBalance * 100) / 100).toBe(l.currentBalance);
        expect(Math.round(l.contractualPayment * 100) / 100).toBe(l.contractualPayment);
      }
    }
  });
});
