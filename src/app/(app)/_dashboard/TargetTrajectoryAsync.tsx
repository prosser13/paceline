// Streams the target-trajectory card independently (it fans out several DB reads
// + the prediction blend), so it can't hold up the agenda. Renders nothing when
// there's no target or nothing to predict from yet.
import { loadTrajectory } from '@/data/benchmarks';
import TargetTrajectoryCard from './TargetTrajectoryCard';

export default async function TargetTrajectoryAsync() {
  const t = await loadTrajectory(new Date().toISOString().slice(0, 10));
  return <TargetTrajectoryCard t={t} />;
}
