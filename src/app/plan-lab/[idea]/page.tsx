import { LabShell } from '../_shared';
import Idea1 from '../Idea1';
import Idea2 from '../Idea2';
import Idea3 from '../Idea3';

export const dynamic = 'force-dynamic';

export default async function PlanLabIdea({ params }: { params: Promise<{ idea: string }> }) {
  const { idea } = await params;
  const n = Number(idea);
  return (
    <LabShell idea={n}>
      {n === 1 ? <Idea1 /> : n === 2 ? <Idea2 /> : n === 3 ? <Idea3 /> : <div className="text-stone">Unknown idea.</div>}
    </LabShell>
  );
}
