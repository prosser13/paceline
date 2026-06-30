// Elevation profile SVG following the ProfileChart viewBox/scaled-coords idiom.
// Draws the GPX elevation against cumulative distance with checkpoint markers.
// Falls back to a checkpoint-stepped profile from the curated cumulative ascent
// figures when no GPX is present.

import { OXBLOOD, MARINE, FOG } from '@/lib/colors';
import { CardTitle } from '@/components/dashboard-graphics';
import type { ParsedGpx } from '@/lib/gpx';
import type { RaceCheckpoint } from '@/data/races/types';

const W = 640;
const H = 150;
const PAD_L = 34;
const PAD_B = 22;
const PAD_T = 10;

export default function ElevationProfile({
  parsed,
  checkpoints,
  totalKm: routeKm,
  title,
  ascentM,
}: {
  parsed: ParsedGpx | null;
  checkpoints: RaceCheckpoint[];
  totalKm: number;
  title?: string;
  ascentM?: number | null;
}) {
  // Build (km, ele) samples either from the GPX or the checkpoint table.
  let samples: { km: number; ele: number }[];
  let usingGpx = false;
  const withEle = parsed?.points.filter(p => p.ele != null) ?? [];

  if (parsed && withEle.length > 1) {
    usingGpx = true;
    const gpxKm = parsed.totalKm;
    samples = withEle.map(p => ({ km: (p.distKm / gpxKm) * routeKm, ele: p.ele as number }));
  } else {
    // Proxy "profile" from cumulative ascent at each checkpoint (monotonic — a
    // rough silhouette, clearly a fallback).
    samples = checkpoints.map(c => ({ km: c.distanceKm, ele: c.ascentM ?? 0 }));
  }

  const minE = Math.min(...samples.map(s => s.ele));
  const maxE = Math.max(...samples.map(s => s.ele), minE + 1);
  const spanE = maxE - minE || 1;

  const sx = (km: number) => PAD_L + (km / routeKm) * (W - PAD_L - 8);
  const sy = (ele: number) => PAD_T + (1 - (ele - minE) / spanE) * (H - PAD_T - PAD_B);

  const line = samples.map(s => `${sx(s.km).toFixed(1)},${sy(s.ele).toFixed(1)}`).join(' ');
  const area = `${PAD_L},${(H - PAD_B).toFixed(1)} ${line} ${(W - 8).toFixed(1)},${(H - PAD_B).toFixed(1)}`;

  const mid = checkpoints.filter(c => c.index > 0 && c.index < checkpoints.length - 1);

  return (
    <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
      {title && (
        <div className="px-[16px] pt-[14px]">
          <CardTitle right={ascentM ? `${ascentM} m ↑` : undefined}>{title}</CardTitle>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Elevation profile">
        {/* baseline */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - 8} y2={H - PAD_B} stroke={FOG} strokeWidth={1} />

        <polygon points={area} fill={OXBLOOD} opacity={0.1} />
        <polyline points={line} fill="none" stroke={OXBLOOD} strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* checkpoint markers */}
        {mid.map(c => {
          const x = sx(c.distanceKm);
          return (
            <g key={c.index}>
              <line x1={x} y1={PAD_T} x2={x} y2={H - PAD_B} stroke={MARINE} strokeWidth={0.75} opacity={0.4} strokeDasharray="2 3" />
              <circle cx={x} cy={H - PAD_B} r={2.5} fill={MARINE} />
              <text x={x} y={H - 8} textAnchor="middle"
                style={{ font: '600 9px var(--font-mono, monospace)', fill: '#5f5a50' }}>
                {c.index}
              </text>
            </g>
          );
        })}

        {/* y labels */}
        <text x={4} y={sy(maxE) + 3} style={{ font: '500 9px var(--font-mono, monospace)', fill: '#5f5a50' }}>{Math.round(maxE)}m</text>
        <text x={4} y={sy(minE)} style={{ font: '500 9px var(--font-mono, monospace)', fill: '#5f5a50' }}>{Math.round(minE)}m</text>
      </svg>
      {!usingGpx && (
        <p className="px-[16px] py-[8px] border-t border-fog font-mono text-[10px] text-stone">
          Approximate — from checkpoint ascent figures. Add the GPX for the true profile.
        </p>
      )}
    </div>
  );
}
