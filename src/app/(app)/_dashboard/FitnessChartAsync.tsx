// Streams the FitnessChart independently — see FormMeterAsync for the rationale.
// Shares loadWellness()'s cached result with FormMeterAsync, so the two cards
// cost a single intervals.icu fetch per request.
import { FitnessChart } from '@/components/dashboard-graphics';
import { loadWellness } from './data';

export default async function FitnessChartAsync() {
  const { fitnessForm, fitnessHistory } = await loadWellness();
  return (
    <FitnessChart
      history={fitnessHistory}
      form={fitnessForm?.form ?? null}
      fitness={fitnessForm?.fitness ?? null}
      fatigue={fitnessForm?.fatigue ?? null}
    />
  );
}
