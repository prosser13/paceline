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
