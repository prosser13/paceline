// Server wrapper: computes the positive standouts and hands them to the client
// banner. Renders nothing when there's no wellness data or nothing positive.
import { loadStandouts } from '../data';
import { getBannerDismissals } from '@/data/banner-dismissals';
import StandoutsBanner, { type BannerStandout } from './StandoutsBanner';

const LABEL: Record<string, string> = {
  sleep: 'Sleep', sleepstreak: 'Sleep streak', rhr: 'Resting HR', hrv: 'HRV',
  vo2: 'VO₂max', steps: 'Steps', weekvol: 'Weekly volume', race: 'Race',
};

export default async function StandoutsBannerAsync() {
  const [standouts, dismissals] = await Promise.all([loadStandouts(), getBannerDismissals()]);
  const positives = standouts.filter(s => s.tone === 'good');
  if (!positives.length) return null;

  const items: BannerStandout[] = positives.map(s => ({ key: s.key, label: LABEL[s.key] ?? s.key, value: s.value }));
  const sig = items.map(i => `${i.key}:${i.value}`).join('|');
  return <StandoutsBanner items={items} sig={sig} initialDismissed={dismissals.standouts === sig} />;
}
