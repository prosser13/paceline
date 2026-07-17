// Server wrapper: computes the calorie-calibration finding and hands it to the
// dismissible client banner. Renders nothing when there's no qualifying finding
// (no weight, no recent close-to-plan session, or everything within tolerance).
import { computeCalorieCheck } from '@/data/calorie-check';
import { getBannerDismissals } from '@/data/banner-dismissals';
import { todayISO } from '@/lib/dates';
import CalorieCheckBanner from './CalorieCheckBanner';

export default async function CalorieCheckAsync() {
  const [check, dismissals] = await Promise.all([computeCalorieCheck(todayISO()), getBannerDismissals()]);
  if (!check) return null;
  return <CalorieCheckBanner check={check} initialDismissed={dismissals['calorie_check'] === check.key} />;
}
