// Registry of curated race guides, keyed by plan slug. Add new races here.

import type { RaceGuide } from './types';
import { DRAGON_50 } from './dragon-50';

const GUIDES: Record<string, RaceGuide> = {
  [DRAGON_50.slug]: DRAGON_50,
};

export function getRaceGuide(slug: string): RaceGuide | null {
  return GUIDES[slug] ?? null;
}

export function listRaceGuides(): RaceGuide[] {
  return Object.values(GUIDES);
}

export type { RaceGuide } from './types';
