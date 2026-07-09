// Minimal, dependency-free GPX parsing + map projection. GPX files are read
// server-side (from /public) so this never ships to the client. We only need
// track points (lat/lng/ele) and a cumulative distance — enough to draw an
// on-brand SVG route line and elevation profile.

export interface GpxPoint {
  lat: number;
  lng: number;
  ele: number | null;
  /** Cumulative distance from the start, km. */
  distKm: number;
}

export interface ParsedGpx {
  points: GpxPoint[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  totalKm: number;
  ascentM: number;
}

const R = 6371; // Earth radius, km

function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Pull every <trkpt> (lat/lon in either attribute order — some exporters, e.g.
// Mapometer, write lon before lat) and its optional <ele> via regex — robust
// enough for organiser-exported GPX without bringing in an XML parser.
export function parseGpx(xml: string): ParsedGpx | null {
  const ptRe = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  const latRe = /\blat="([-\d.]+)"/;
  const lonRe = /\blon="([-\d.]+)"/;
  const eleRe = /<ele>([-\d.]+)<\/ele>/;

  const raw: { lat: number; lng: number; ele: number | null }[] = [];
  let m: RegExpExecArray | null;
  while ((m = ptRe.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const latM = attrs.match(latRe);
    const lonM = attrs.match(lonRe);
    if (!latM || !lonM) continue;
    const lat = parseFloat(latM[1]);
    const lng = parseFloat(lonM[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const inner = m[2] ?? '';
    const eleM = inner.match(eleRe);
    raw.push({ lat, lng, ele: eleM ? parseFloat(eleM[1]) : null });
  }

  if (raw.length < 2) return null;

  const points: GpxPoint[] = [];
  let cum = 0;
  let ascent = 0;
  let prevEle: number | null = null;

  raw.forEach((p, i) => {
    const point: GpxPoint = { lat: p.lat, lng: p.lng, ele: p.ele, distKm: 0 };
    if (i > 0) cum += haversineKm(points[i - 1], point);
    point.distKm = cum;
    if (p.ele != null && prevEle != null && p.ele > prevEle) ascent += p.ele - prevEle;
    if (p.ele != null) prevEle = p.ele;
    points.push(point);
  });

  // Reduce, not Math.min(...arr): a dense GPX (>~65k points) spread as call
  // arguments overflows the stack.
  const bounds = points.reduce(
    (b, p) => ({
      minLat: Math.min(b.minLat, p.lat), maxLat: Math.max(b.maxLat, p.lat),
      minLng: Math.min(b.minLng, p.lng), maxLng: Math.max(b.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity },
  );

  return {
    points,
    bounds,
    totalKm: cum,
    ascentM: Math.round(ascent),
  };
}

// Project lat/lng into an SVG viewBox of width×height with padding. Uses an
// equirectangular projection corrected for latitude so the route keeps its
// aspect ratio. Returns a point→[x,y] mapper plus the polyline string.
export function buildProjection(parsed: ParsedGpx, width: number, height: number, pad = 8) {
  const { minLat, maxLat, minLng, maxLng } = parsed.bounds;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lngScale = Math.cos(midLat);

  const geoW = (maxLng - minLng) * lngScale || 1e-9;
  const geoH = (maxLat - minLat) || 1e-9;

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);

  // Centre the route within the box.
  const offsetX = pad + (innerW - geoW * scale) / 2;
  const offsetY = pad + (innerH - geoH * scale) / 2;

  function project(lat: number, lng: number): [number, number] {
    const x = offsetX + ((lng - minLng) * lngScale) * scale;
    // SVG y grows downward; flip latitude.
    const y = offsetY + (maxLat - lat) * scale;
    return [x, y];
  }

  const polyline = parsed.points
    .map(p => {
      const [x, y] = project(p.lat, p.lng);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return { project, polyline };
}
