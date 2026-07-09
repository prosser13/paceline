// Shared checkpoint cell for the pacing + fuel tables. Checkpoint names come as
// "CP1 · Kenfig"; stack the number above the name (and the drop-bag badge below it)
// so the column stays narrow on mobile instead of forcing a wide, cut-off cell.
// Start/Finish rows (no " · ") render as a single label.
export function CheckpointLabel({
  name, dropBag = false, dropLabel = 'drop bag',
}: {
  name: string; dropBag?: boolean; dropLabel?: string;
}) {
  const sep = name.indexOf(' · ');
  const num = sep >= 0 ? name.slice(0, sep) : null;
  const rest = sep >= 0 ? name.slice(sep + 3) : name;

  return (
    <div className="leading-tight">
      {num && <div className="font-mono text-[10px] uppercase tracking-[.04em] text-stone leading-none mb-[2px]">{num}</div>}
      <div className="text-ink font-semibold">{rest}</div>
      {dropBag && (
        <div style={{ marginTop: '3px' }}>
          <span className="font-mono text-[9px] uppercase tracking-[.06em] text-marine border border-marine/40 rounded-[3px]" style={{ padding: '1px 4px' }}>
            {dropLabel}
          </span>
        </div>
      )}
    </div>
  );
}
