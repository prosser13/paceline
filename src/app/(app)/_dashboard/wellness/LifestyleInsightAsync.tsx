// Streams the weekly lifestyle-insight banner independently — renders nothing when
// there isn't a min-sample-backed correlation to show.
import { computeLifestyleInsight } from '@/data/insights';
import { getBannerDismissals } from '@/data/banner-dismissals';
import InsightBanner from './InsightBanner';

export default async function LifestyleInsightAsync() {
  const [insight, dismissals] = await Promise.all([computeLifestyleInsight(), getBannerDismissals()]);
  if (!insight) return null;
  return <InsightBanner insight={insight} initialDismissed={dismissals.insight === insight.key} />;
}
