# Design system

The visual vocabulary: theme tokens + the reusable components to build with (and not
re-invent). Tokens are Tailwind v4 `@theme` custom properties in
`src/app/globals.css` — use the token utilities (`bg-paper`, `text-ink`), never raw hex, so a
future theme swap is one file. This is a warm-grey light theme; there is no dark mode and no
app-shell zoom.

## Colour tokens (`globals.css`)

| Token | Hex | Use |
|---|---|---|
| `bone` | `#e6e4df` | page background (warm grey) |
| `paper` | `#faf8f1` | card surface |
| `ink` | `#17150f` | primary text |
| `stone` | `#5b5852` | secondary / muted text |
| `fog` | `#d8d3c9` | hairline borders + dividers |
| `hero` / `onhero` | `#1b1a16` / `#f3f1ea` | near-black focal tile + its text (e.g. Today readiness) |
| `race` | `#b3271e` | races / A-race accents |
| `ride` / `marine` | `#2f6f9e` | cycling / links |
| `strength` | `#b07d12` | strength + build/fuel accents |
| `fern` | `#3f8f6a` | "ready" / good state |

Each accent has a `-soft` tint (e.g. `race-soft`, `marine-soft`) for backgrounds, and
marine has `-dark` for hover. Phase colours live in `lib/colors.ts` (`PHASE_COLOR`/
`PHASE_HEX`); sport glyphs in `components/glyphs.tsx`. Corners are generous
(`rounded-[14px]`/`[16px]`); cards use `border border-fog bg-paper`.

## Typography

| Var | Font | Use |
|---|---|---|
| `font-display` | **PacelineSerif** (Lora, self-hosted) | headlines, big numbers |
| `font-sans` | Inter | body |
| `font-mono` | Inter | labels/metadata (styled small + uppercase + tracked) |

**PacelineSerif rule (do not break):** the display serif is self-hosted under the *unique*
family name `PacelineSerif` (`/fonts/Lora-latin.woff2`). Never use `next/font`'s Lora or an
`@font-face` named "Lora"/"lora" — next/font re-subsets a broken ~0.6em space glyph, and any
family named "Lora" gets shadowed by a system font of the same name (CSS family names are
case-insensitive). The unique name is the fix.

## Reusable components

Build with these before writing new UI — a change here updates every surface.

| Component | File | What it is |
|---|---|---|
| `SessionRow` | `components/SessionRow.tsx` | shared plan/dashboard session row dispatcher (→ Run/Cycling/Strength/Yoga rows) |
| `SessionHero` | `_dashboard/SessionHero.tsx` | the big session card (today + recently-completed + race result); `isRace`, `collapseSplits`, `defaultOpen` props |
| `HeroAccordion` | `components/session-ui.tsx` | `<details>`-based collapsible (title/meta/chevron) — used for Session breakdown, Splits, Adjust |
| `CompareTable` | `components/session-ui.tsx` | plan-vs-actual metric table (`buildRunCompare` builds rows) |
| `WorkoutDetail` | `components/session-ui.tsx` | per-km / per-segment splits list |
| `TrendCard` / `CardTitle` | `components/dashboard-graphics.tsx` | standard trend card frame + title; `CardSkeleton` for Suspense |
| `WeeklyBars` | `components/dashboard-graphics.tsx` | weekly volume bar chart |
| `ReadinessRing` | `components/*` | the 0–100 readiness dial |
| `LoadSplitBar` / `AcwrTile` / `WeeklyLoadCard` / `FuelRehearsalCard` | `_dashboard/*` | dashboard trend tiles (copy their frame for a new tile) |
| `PixelFlag` / glyphs | `components/glyphs.tsx`, `lib/colors.ts` | sport glyphs + brand colours |

Form inputs: single-source the class string (see `RaceResults.tsx` `inputBase`/`inputCls`) —
keep width utilities separate from the base so narrow fields can override (two width classes
on one element resolve by stylesheet order, not class order).

Session rows and `SessionHero` are **shared** between dashboard and plan/race pages — verify a
change on all three surfaces. Accessibility target is WCAG AA (4.5:1 for text < 18px).
