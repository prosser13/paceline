// Registry of curated race guides, keyed by plan slug. Add new races here.

import type { RaceGuide } from './types';
import { DRAGON_50 } from './dragon-50';
import { MALAGA_MARATHON } from './malaga-marathon';
import { PORTHCAWL_10K } from './porthcawl-10km';
import { THH_5K_ON_THE_BAY } from './thh-5k-on-the-bay';

const GUIDES: Record<string, RaceGuide> = {
  [DRAGON_50.slug]: DRAGON_50,
  [MALAGA_MARATHON.slug]: MALAGA_MARATHON,
  [PORTHCAWL_10K.slug]: PORTHCAWL_10K,
  [THH_5K_ON_THE_BAY.slug]: THH_5K_ON_THE_BAY,
};

export function getRaceGuide(slug: string): RaceGuide | null {
  return GUIDES[slug] ?? null;
}

export function listRaceGuides(): RaceGuide[] {
  return Object.values(GUIDES);
}

export type { RaceGuide } from './types';
