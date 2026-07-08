# Threshold auto-suggestion — design

Threshold pace is currently a static, user-entered figure (`app_config.threshold_pace_per_km`).
It's load-bearing: TSS for every completed session derives from it (`recomputeAllCompletedTss`),
the marathon prediction leans on it, and — because pace zones are maintained alongside it — the
prescribed pace windows for every future structured run flow from the zone table it anchors.

The goal: **the system notices when the evidence says your threshold has moved, and proposes a
small, well-argued update** — so fitness gains get banked through the block, but a single good
race or hot week never yanks every pace in the plan.

Guiding principle: **suggest freely, apply conservatively, never silently.**

---

## 1. The estimator — what does the evidence say threshold is now?

Reuse the prediction engine's machinery (`src/lib/prediction.ts`). Daniels' VDOT is invertible:
from a blended VDOT, the pace sustainable for a ~60-minute effort *is* threshold pace.

Evidence, strongest first (same recency weighting as the marathon prediction — half-life 42 days):

| Signal | Weight | Source |
|---|---|---|
| Race results (≤ 12 months) | 1.0 | `completed_workouts` × `session_type='RACE'` → VDOT each |
| Quality-segment execution | 0.6 | Completed threshold/Z4 segments: actual pace vs prescribed window, HR-sane |
| Current threshold (anchor) | 0.5 | The configured value — inertia term so one signal can't swing the estimate |

- **Races** are the gold standard: a 10K/HM implies a VDOT; invert to a 60-min pace.
- **Quality segments** (P2): when threshold-labelled reps consistently come in faster than the
  prescribed window at reasonable HR, that's evidence between races. Uses `segment_actuals` +
  `segment_hr` already stored per completion. Excluded in P1 to keep the estimator auditable.
- **The anchor term** stops the estimate from over-reacting: the current setting participates in
  the blend, so the estimate moves toward the evidence rather than jumping to it.

Output: `estimatedThresholdMinKm` + the signal list (for display — every suggestion shows its
working).

Worked example with today's data: threshold 3:40, 10K 34:02 (21 Jun) → VDOT 63.6 → 60-min pace
≈ 3:34/km. Blend with the anchor → estimate ≈ 3:36–3:37/km. Gap ≈ 3–4 s/km → suggestion fires.

## 2. Guardrails — progress without over-adjusting

This is the heart of the request. All five apply, and all are constants in one place:

| Guardrail | Value (v1) | Why |
|---|---|---|
| **Minimum gap** | ≥ 3 s/km between estimate and current | Below that it's noise; don't churn |
| **Step cap** | ≤ 3 s/km per suggestion | Even if the estimate says 8 s faster, ratchet: 3:40 → 3:37, not 3:40 → 3:32. The next suggestion (post-cooldown) takes the next step if the evidence holds |
| **Cooldown** | ≥ 21 days since the last threshold change (any source: suggestion or manual) | Each change rewrites TSS + re-anchors zones; let the block settle and generate fresh evidence before moving again |
| **Fresh-evidence requirement** | ≥ 1 race within 42 days (P1); or ≥ 2 corroborating quality sessions (P2) | A suggestion must be earned by something recent, not by a stale race decaying slowly |
| **Taper freeze** | No suggestions within 14 days of the A-race | Race-week pace stability; nobody re-bases zones in the taper |

**Directional asymmetry:** during a training block the expected direction is faster. A *slower*
suggestion (detraining/illness) needs a higher bar — gap ≥ 5 s/km sustained across 3 consecutive
weekly checks — so one rough patch never slows the plan down. (The morning/evening coach already
handles acute fatigue day-to-day; threshold is the long-term setting.)

Net effect: the fastest possible progression is 3 s/km every 3 weeks ≈ 1 s/km per week — brisk
enough to bank a real fitness ramp across an 18-week block (≈ 18 s/km end to end), slow enough
that no single result ever moves the plan more than one small notch.

## 3. When it runs + where it lives

- **Computed weekly**, piggybacking the existing benchmark-snapshot write in the wellness sync
  (same cadence, no new cron). **Every check is recorded** — not just the ones that produce a
  suggestion — in a `threshold_checks` table:
  `(id, checked_at, week_start, current_min_km, estimate_min_km, gap_s, outcome, commentary text,
  evidence jsonb, suggested_min_km, status pending|accepted|dismissed|none, resolved_at)`.
  One open (pending) suggestion at a time; `outcome` is one of
  `suggested | within_noise | capped_wait | cooldown | no_fresh_evidence | taper_freeze |
  slower_pending_confirmation`.

### The commentary — visible reasoning, refreshed every check

Each weekly check writes a **plain-English `commentary`** the athlete can read, built from a
deterministic template (not an LLM — the reasoning must be exact, auditable, and cheap). It always
states: the evidence and what each piece implies, the blended estimate, the gap, and **what the
system decided and why** — including when the decision is "do nothing". Examples:

> **Checked Mon 8 Jul.** Evidence: 10K 34:02 (21 Jun) implies 3:34/km; current setting 3:40
> anchors the blend. Estimate **3:36/km** — 4 s faster than your setting. → **Suggested 3:37**
> (step capped at 3 s/km; the estimate says more, but one notch at a time).

> **Checked Mon 15 Jul.** Estimate 3:36/km, gap 3 s — but the threshold changed 6 days ago,
> so this check is inside the 21-day cooldown (next eligible 26 Jul). **No suggestion.**

> **Checked Mon 22 Jul.** Estimate 3:39/km, gap 1 s — within the 3 s noise band. Your setting
> matches the evidence. **No change needed.**

> **Checked Mon 29 Jul.** Estimate 3:44/km — *slower* than your setting. Slower suggestions need
> a ≥5 s gap sustained for 3 weekly checks (this is week 1 of 3); a rough patch shouldn't slow
> the plan. **Watching, not suggesting.**

The **latest commentary is always visible** on the Benchmarks threshold card (and mirrored in
Settings), timestamped, with an expandable **history of past checks** beneath it — so the athlete
can watch the estimate converge week by week and see exactly why the system did or didn't act.
Accepting/dismissing a suggestion appends its own entry ("Applied 3:37 on 9 Jul — zones shifted
−3 s; TSS recomputed" / "Dismissed on 9 Jul — won't re-suggest 3:37 until evidence strengthens").
- **Surfaced in three places**, all read-only except the accept button:
  1. **Benchmarks → Threshold pace card** (primary): the latest check's commentary, always
     shown and timestamped; when a suggestion is pending, an action strip — "Evidence suggests
     **3:37/km** · 10K 34:02 implies 3:34 · [Apply] [Dismiss]" — plus the expandable check history.
  2. **Evening coach**: `suggested_threshold` joins the plan-context briefing, so the coach can
     mention it in prose ("your 10K says threshold is quicker than the setting — there's a
     suggestion waiting on Benchmarks"). The coach *narrates*; it never applies.
  3. **Settings → Zones**: the same strip above the threshold field.
- **Dismissal** parks that suggestion; the same value isn't re-suggested for 3 weeks unless the
  evidence strengthens (estimate moves ≥ 2 s/km further).

**Never auto-applied.** Autonomy stays with the athlete regardless of the coach-autonomy setting —
this is a re-basing of the whole plan's intensity, not a session tweak.

## 4. What Apply actually does (blast-radius control)

One action, three explicit effects, one log entry:

1. **Threshold** → `setThresholdPace(new)` — already triggers `recomputeAllCompletedTss()`
   (the single TSS write path; unchanged).
2. **Pace zones shift with it** — zones are anchored to threshold in practice, so Apply shifts
   every zone boundary by the same delta (3:40 → 3:37 = −3 s on each min/max). This is what
   actually re-paces future structured runs, and it's shown in the confirm step:
   "Z2 5:05–5:35 → 5:02–5:32", etc. (Checkbox to skip the zone shift for edge cases, default on.)
3. **HR zones untouched** — HR doesn't move because pace fitness did.
4. **Change-log entry** (existing adjustment-log pattern): before/after threshold + zones,
   the evidence, and a **Revert** that restores both and re-runs the TSS recompute.

Stored `target_pace` strings on individual planned sessions are *not* rewritten — prescriptions
are the plan agent's job, and structured sessions already resolve their windows live from the
zone table, so they update visually the moment zones shift.

## 5. Phasing

| Phase | Scope |
|---|---|
| **P1** | Race-evidence estimator (+ anchor term) · weekly check + `threshold_checks` **with per-check commentary + visible history** · Benchmarks + Settings strips · Apply (threshold + zone shift + TSS recompute + log) · Dismiss · taper freeze, step cap, cooldown, min gap |
| **P2** | Quality-segment evidence (threshold reps vs window, HR-sane) · revert from the change log · slower-direction suggestions (3-week sustained rule) · coach-context mention |
| **P3** | HR-drift corroboration (pace@threshold-HR from streams) · auto-tuning the anchor weight |

P1 is fully useful on its own — with the current data it would already produce the 3:40 → 3:37
suggestion, correctly capped and evidenced.

## Decisions — RESOLVED (review, 8 Jul 2026)

1. **Zone shift**: flat delta — every boundary moves by the same seconds as threshold.
2. **Cooldown**: 21 days.
3. **Apply lives**: Benchmarks + Settings, both.
4. **Coach mention**: evening review only; mornings stay about today.
