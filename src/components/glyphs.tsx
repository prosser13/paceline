// Shared inline SVG glyphs. Colour comes from `currentColor` (set a text-* class
// on the glyph or a parent, or wrap in a span with `style={{ color }}`); size and
// stroke weight are props. Previously these paths were hand-copied into ~5 files.

interface GlyphProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function RunGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="13" cy="4" r="1" />
      <path d="M4 17l5 1l.75 -1.5" />
      <path d="M15 21l0 -4l-4 -3l1 -6" />
      <path d="M7 12l0 -3l5 -1l3 3l3 1" />
    </svg>
  );
}

export function BikeGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M5 17l3.5 -8h5.5l-3 8" />
      <path d="M14 9l2 -3h2" />
      <path d="M8.5 9h6" />
    </svg>
  );
}

export function Dumbbell({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  );
}

// Front-crawl swimmer over a waterline — swimming.
export function SwimGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="17" cy="7" r="1.4" />
      <path d="M5 12l3.5 -2.5l3.5 2l3 -1.5l3 2" />
      <path d="M3 17.5q2 -1.5 3.5 0t3.5 0t3.5 0t3.5 0t3.5 0" />
      <path d="M3 20.5q2 -1.5 3.5 0t3.5 0t3.5 0t3.5 0t3.5 0" />
    </svg>
  );
}

// Seated meditation figure — yoga / mobility / stretching.
export function YogaGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 7v4.5" />
      <path d="M4.5 19c0 -3.6 3.4 -5.5 7.5 -5.5s7.5 1.9 7.5 5.5z" />
      <path d="M7 12.5l5 2.5l5 -2.5" />
    </svg>
  );
}

// Fuel — a gel sachet, for "food/carbs logged".
export function FuelGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 3h8l-1 3v13a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2v-13z" />
      <path d="M8 6h8" />
      <path d="M10 10h4" />
    </svg>
  );
}

// Droplet — for sweat (fluid lost).
export function DropletGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3.5c3 3.8 5.5 6.9 5.5 9.8a5.5 5.5 0 0 1 -11 0c0 -2.9 2.5 -6 5.5 -9.8z" />
    </svg>
  );
}

// Bottle — for fluid drunk (intake).
export function BottleGlyph({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 2h4" />
      <path d="M10.5 4.5c0 1.2 -.7 1.8 -1.6 2.7c-.9 .9 -1.4 1.7 -1.4 3v9a1.8 1.8 0 0 0 1.8 1.8h5.4a1.8 1.8 0 0 0 1.8 -1.8v-9c0 -1.3 -.5 -2.1 -1.4 -3c-.9 -.9 -1.6 -1.5 -1.6 -2.7v-2h-3z" />
      <path d="M7.5 12.5h9" />
    </svg>
  );
}
