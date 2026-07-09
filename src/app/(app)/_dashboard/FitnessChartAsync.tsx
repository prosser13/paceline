// Streams the FitnessChart independently so a slow intervals.icu fetch can't hold
// up the agenda. Shares loadWellness()'s cached result with the other wellness
// cards, so they cost a single intervals.icu fetch per request.
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
