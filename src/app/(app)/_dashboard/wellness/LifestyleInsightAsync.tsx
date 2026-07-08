// Streams the weekly lifestyle-insight banner independently — renders nothing when
// there isn't a min-sample-backed correlation to show.
import { computeLifestyleInsight } from '@/data/insights';
import InsightBanner from './InsightBanner';

export default async function LifestyleInsightAsync() {
  const insight = await computeLifestyleInsight();
  if (!insight) return null;
  return <InsightBanner insight={insight} />;
}
