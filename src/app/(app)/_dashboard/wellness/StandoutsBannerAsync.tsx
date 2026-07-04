// Server wrapper: computes the positive standouts and hands them to the client
// banner. Renders nothing when there's no wellness data or nothing positive.
import { loadWellnessDays } from '../data';
import { standouts } from '@/lib/wellness-stats';
import StandoutsBanner, { type BannerStandout } from './StandoutsBanner';

const LABEL: Record<string, string> = {
  sleep: 'Sleep', rhr: 'Resting HR', hrv: 'HRV', vo2: 'VO₂max', longsleep: 'Longest sleep',
};

export default async function StandoutsBannerAsync() {
  const { recent } = await loadWellnessDays();
  if (!recent.length) return null;

  const positives = standouts(recent).filter(s => s.tone === 'good');
  if (!positives.length) return null;

  const items: BannerStandout[] = positives.map(s => ({ key: s.key, label: LABEL[s.key] ?? s.key, value: s.value }));
  const sig = items.map(i => `${i.key}:${i.value}`).join('|');
  return <StandoutsBanner items={items} sig={sig} />;
}
