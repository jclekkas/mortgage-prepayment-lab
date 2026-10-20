import type { Portfolio } from '../domain/types';
import { generatePortfolio, type GeneratorConfig } from './generator';

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  config: Partial<GeneratorConfig>;
}

export const PRESETS: PresetInfo[] = [
  {
    id: 'mixed',
    name: 'Mixed book',
    description: 'Equal thirds of older low-rate loans, mid-life middle-rate loans and recent high-rate loans.',
    config: { cohortWeights: [1, 1, 1] },
  },
  {
    id: 'seasoned-low-rate',
    name: 'Low-rate seasoned book',
    description: 'Mostly older loans with note rates well below the synthetic offer rate.',
    config: { cohortWeights: [7, 2, 1] },
  },
  {
    id: 'recent-high-rate',
    name: 'Recently originated higher-rate book',
    description: 'Mostly young loans with note rates above the synthetic offer rate.',
    config: { cohortWeights: [1, 2, 7] },
  },
];

const cache = new Map<string, Portfolio>();

export function loadPreset(id: string): Portfolio {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  const portfolio = generatePortfolio({ ...p.config, presetId: p.id, name: p.name, description: p.description });
  cache.set(id, portfolio);
  return portfolio;
}

/**
 * Two books identical except for loan size, for the "same speed, different cost" lesson.
 * Same seed, same rates and ages; balances differ by a constant factor.
 */
export function lessonBooks(): { small: Portfolio; large: Portfolio } {
  const common: Partial<GeneratorConfig> = { loanCount: 200, cohortWeights: [1, 1, 1], balanceSigma: 0, seed: 7 };
  return {
    small: generatePortfolio({ ...common, medianOriginalBalance: 150_000, presetId: 'lesson-small', name: 'Small-loan book', description: 'Lesson fixture' }),
    large: generatePortfolio({ ...common, medianOriginalBalance: 600_000, presetId: 'lesson-large', name: 'Large-loan book', description: 'Lesson fixture' }),
  };
}
