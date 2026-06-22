// On-brand SVG course map. Server-rendered from the parsed GPX: a route
// polyline with start/finish markers and checkpoint dots positioned by their
// cumulative distance along the track. No tiles, no API key — matches the
// project's SVG-first, dependency-light styling.

import { OXBLOOD, MARINE, FERN, FOG } from '@/lib/colors';
import { buildProjection, type ParsedGpx } from '@/lib/gpx';
import type { RaceCheckpoint } from '@/data/races/types';

const W = 640;
const H = 360;

export default function RouteMap({
  parsed,
  checkpoints,
  totalKm: routeKm,
}: {
  parsed: ParsedGpx | null;
  checkpoints: RaceCheckpoint[];
  totalKm: number;
}) {
  if (!parsed) {
    return (
      <div className="flex items-center justify-center border border-dashed border-fog rounded-[14px] bg-paper h-[260px] text-center px-6">
        <p className="text-stone text-[14px]">
          Course map appears here once the GPX route is added.
        </p>
      </div>
    );
  }

  const { project, polyline } = buildProjection(parsed, W, H);

  // Find the track point closest to each checkpoint's cumulative distance.
  // Scale the checkpoint's km to the GPX's own length (they can differ).
  const gpxKm = parsed.totalKm;
  function pointAtKm(km: number) {
    const targetKm = (km / routeKm) * gpxKm;
    let best = parsed!.points[0];
    let bestD = Infinity;
    for (const p of parsed!.points) {
      const d = Math.abs(p.distKm - targetKm);
      if (d < bestD) { bestD = d; best = p; }
    }
    return project(best.lat, best.lng);
  }

  const mid = checkpoints.filter(c => c.index > 0 && c.index < checkpoints.length - 1);
  const startP = project(parsed.points[0].lat, parsed.points[0].lng);
  const endP = project(parsed.points[parsed.points.length - 1].lat, parsed.points[parsed.points.length - 1].lng);

  return (
    <div className="border border-fog rounded-[14px] bg-paper overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Course map">
        {/* route casing + line */}
        <polyline points={polyline} fill="none" stroke={FOG} strokeWidth={6}
          strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={polyline} fill="none" stroke={OXBLOOD} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* checkpoint dots */}
        {mid.map(c => {
          const [x, y] = pointAtKm(c.distanceKm);
          return (
            <g key={c.index}>
              <circle cx={x} cy={y} r={4.5} fill="#fbf8f2" stroke={MARINE} strokeWidth={2} />
              <text x={x} y={y - 8} textAnchor="middle"
                style={{ font: '600 10px var(--font-mono, monospace)', fill: '#5f5a50' }}>
                {c.index}
              </text>
            </g>
          );
        })}

        {/* start / finish */}
        <circle cx={startP[0]} cy={startP[1]} r={6} fill={FERN} stroke="#fbf8f2" strokeWidth={2} />
        <circle cx={endP[0]} cy={endP[1]} r={6} fill={OXBLOOD} stroke="#fbf8f2" strokeWidth={2} />
      </svg>
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[4px] px-[16px] py-[10px] border-t border-fog">
        <Legend color={FERN} label="Start" />
        <Legend color={MARINE} label="Checkpoint" ring />
        <Legend color={OXBLOOD} label="Finish" />
        <span className="font-mono text-[11px] text-stone ml-auto">
          {parsed.totalKm.toFixed(1)} km · {parsed.ascentM} m ascent (GPX)
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span className="flex items-center gap-[6px] font-mono text-[11px] text-stone">
      <i className="inline-block w-[9px] h-[9px] rounded-full"
        style={ring ? { border: `2px solid ${color}`, background: '#fbf8f2' } : { background: color }} />
      {label}
    </span>
  );
}
