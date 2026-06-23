# Dragon 50 — flexibility + upper-body additions

Layered onto the existing Dragon 50 plan (plan 4, strength-priority, race 19 Jul 2026) **without changing the lower-body strength approach**. Seeded by `scripts/gen-dragon-supplementary.mjs`.

## What was added / changed

- **Lower-body strength ("Legs & core"): untouched.** Every heavy/moderate/peak legs session is exactly as it was.
- **Upper-body days upgraded** (26 Jun, 29 Jun, 6 Jul) — the existing rehab-flavoured upper sessions now run the aesthetic template, with weights:
  - Pull-up 3×8 (bw) · Chest press 3×8 (14 kg) · Overhead press 3×8 (8 kg) · Bicep curl 3×10 (8 kg) · Bent-over row 3×10 (12 kg) · Band pull-apart 3×15 (posture)
  - Loads: OHP / row from the imported library; chest press / curl are starting recommendations. No new sessions, no added leg load.
- **Flexibility (new YOGA sessions, ember):**

| Date | Run | Added |
|------|-----|-------|
| Wed 24 Jun | MLR + ultra pace | Dynamic warm-up |
| Sat 27 Jun | Dress rehearsal (37 km) | Dynamic warm-up + Static stretches |
| Sun 28 Jun | Long run | Dynamic warm-up + Static stretches |
| Wed 1 Jul | VO₂ 4×1km | Dynamic warm-up + Static stretches |
| Sun 5 Jul | Porthcawl 10k | Dynamic warm-up + Static stretches |
| Wed 8 Jul | MLR + ultra pace | Dynamic warm-up |
| Sat 11 Jul | Long run (30 km) | Dynamic warm-up + Static stretches |
| Thu 16 Jul | Rest (taper) | Mobility & stretch |
| Sun 19 Jul | **Dragon 50** | Dynamic warm-up |

Easy shake-out runs and Z2 rides get nothing — flexibility is targeted at the longer/harder efforts.

## Ordering

Dragon is strength-*priority*, so each day still leads with strength, but a dynamic warm-up sorts **before** the run and static stretches **after** it (handled by `strengthFirstOrder` in `src/lib/session-order.ts`). Flexibility flows are the same ones used in the Malaga plan.
