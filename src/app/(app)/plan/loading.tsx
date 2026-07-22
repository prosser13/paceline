// Route-level fallback during navigation to Plan (also streams via <Suspense> in the
// page; this covers the RSC transition before the page component runs). Reuses the
// same skeleton so there's no visual jump.
import PlanSkeleton from './PlanSkeleton';

export default function PlanLoading() {
  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px]">
      <PlanSkeleton />
    </div>
  );
}
