// Route-level fallback shown during navigation to Settings while the page's ~30
// config reads resolve. Mirrors the tabs + card stack so the swap-in doesn't shift.
export default function SettingsLoading() {
  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[760px] animate-pulse" aria-hidden>
      <div className="h-[28px] w-[140px] rounded bg-fog/50 mb-5" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[32px] w-[84px] rounded-[10px] bg-fog/40" />
        ))}
      </div>
      <div className="flex flex-col gap-[14px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[120px] rounded-[16px] border border-fog bg-fog/20" />
        ))}
      </div>
    </div>
  );
}
