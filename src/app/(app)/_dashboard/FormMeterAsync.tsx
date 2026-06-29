// Streams the FormMeter independently of the main dashboard body. It awaits
// loadWellness() (the external intervals.icu call) so that slow fetch only
// delays this one card — wrapped in its own <Suspense> in DashboardBody — while
// the rest of the dashboard (agenda, week strip, today) renders immediately.
import { FormMeter } from '@/components/dashboard-graphics';
import { loadWellness } from './data';

export default async function FormMeterAsync() {
  const { fitnessForm } = await loadWellness();
  return (
    <FormMeter
      form={fitnessForm?.form ?? null}
      fitness={fitnessForm?.fitness ?? null}
      fatigue={fitnessForm?.fatigue ?? null}
    />
  );
}
