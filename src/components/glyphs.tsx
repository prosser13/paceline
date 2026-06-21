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

export function Dumbbell({ size = 16, strokeWidth = 2, className = 'shrink-0' }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  );
}
