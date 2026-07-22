// Route-level fallback shown during navigation to Benchmarks while the loader's
// prediction/threshold reads resolve.
export default function BenchmarksLoading() {
  return (
    <div className="px-4 py-4 sm:px-[26px] sm:py-[22px] max-w-[1040px] animate-pulse" aria-hidden>
      <div className="h-[28px] w-[180px] rounded bg-fog/50 mb-5" />
      <div className="h-[160px] rounded-[16px] border border-fog bg-fog/30 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-[16px] border border-fog bg-fog/20" />
        ))}
      </div>
    </div>
  );
}
