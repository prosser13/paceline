// Swansea Bay 10K — curated race guide (Beth's A-race). A flat, fast seafront
// out-and-back along Swansea Bay: start and finish at the same point on the
// promenade, an even run out to a ~5 km turn (where the sole water station sits)
// and back. Course stats derived from a 2025 competitor's GPX
// (/public/races/swansea-bay-10km.gpx): 10.05 km, ~35 m of (smoothed) climb —
// essentially flat, exposed to the sea breeze off the bay.
//
// Editorial detail (fuel, kit, coach notes) is sensible-default and meant to be
// tuned — Beth can refine kit/fuel once she's dialled in her own setup.

import type { RaceGuide } from './types';

export const SWANSEA_BAY_10K: RaceGuide = {
  slug: 'swansea-bay-10km',
  eventName: 'Swansea Bay 10K',
  priority: 'A',
  ownerEmails: ['bethanaprosser@gmail.com'],
  organiser: 'Swansea Council',
  region: 'Swansea Bay, South Wales — flat seafront out-and-back',
  start: { name: 'Swansea Bay promenade', lat: 51.61112, lng: -3.96879 },
  finish: { name: 'Swansea Bay promenade', lat: 51.61120, lng: -3.96870 },
  distanceKm: 10,
  ascentM: 35, // essentially flat seafront; ~35 m smoothed (GPS noise aside)
  startTime: '11:00',
  date: '2026-09-20',
  targetTime: null,      // no time goal set yet
  targetPace: null,
  hideTargets: true,     // blank target/goal/pacing figures for now
  gpxPath: '/races/swansea-bay-10km.gpx',

  summary:
    'A flat, fast 10K along the Swansea Bay seafront. From the promenade it heads out along the bay to a ' +
    'turn around the halfway point — where the single water station sits — and returns the same way to ' +
    'finish where it started. There are no real hills: it is one of the flattest 10Ks in South Wales, so ' +
    'the effort is all about holding an even pace. The main variable is the wind coming off the bay, which ' +
    'can be a headwind one way and a push the other on the exposed seafront stretches.',
  terrain: [
    'Flat tarmac promenade and seafront path',
    'Out-and-back — a turn at roughly halfway (~5 km)',
    'No significant climbs (~35 m total)',
    'Exposed to the sea breeze along the bay',
  ],

  checkpoints: [
    { index: 0, name: 'Start · Swansea Bay promenade', distanceKm: 0, ascentM: 0, descentM: 0,
      supplies: '11:00 mass start on the promenade.' },
    { index: 1, name: '2 km', distanceKm: 2, ascentM: 7, descentM: 7,
      fuelBetween: 'Controlled start — settle straight onto 5:30/km; don’t chase the fast starters.', fuelAt: '—' },
    { index: 2, name: '4 km', distanceKm: 4, ascentM: 15, descentM: 15,
      fuelBetween: 'Locked onto pace and relaxed — the quiet middle before the turn.', fuelAt: '—' },
    { index: 3, name: '5 km turn · water', distanceKm: 5, ascentM: 18, descentM: 18,
      supplies: 'Water station at the turnaround (~5 km) — the only one on course.',
      fuelBetween: 'Grab water on the move at the turn; note if the wind flips to a headwind or a helper for the way back.',
      fuelAt: 'Water station (~5 km)' },
    { index: 4, name: '8 km', distanceKm: 8, ascentM: 28, descentM: 28,
      fuelBetween: 'The working stretch home — hold form, keep the cadence ticking, reel people in.', fuelAt: '—' },
    { index: 5, name: 'Finish · promenade', distanceKm: 10, ascentM: 35, descentM: 35,
      fuelBetween: 'Flat run-in — from 8 km it should hurt; empty the tank to the line.', fuelAt: '—' },
  ],

  goalTiers: [
    { label: 'A', time: '0:55:00', note: '~5:30/km — an even effort start to finish.' },
    { label: 'B', time: '0:57:30', note: '~5:45/km — a strong day on a tougher wind.' },
    { label: 'C', time: '0:59:59', note: 'Sub-60 — banked whatever the conditions.' },
  ],

  seasonalWeather:
    'Late September on the Swansea coast: usually mild, around 12–17 °C, with a fair chance of wind or a ' +
    'passing shower off the bay. An 11:00 start means it should be comfortable for running — the biggest ' +
    'factor is the breeze on the exposed seafront, which on an out-and-back you take in both directions.',

  coachNotes: [
    { heading: 'Settle in early',
      body: 'After the start, find a comfortable, sustainable rhythm and relax — don’t let the early ' +
            'excitement or faster runners around you pull you along. Let the effort come to you.' },
    { heading: 'Read the wind at the turn',
      body: 'It’s an out-and-back, so whatever the wind does on the way out, it reverses on the way back. ' +
            'Run by feel and effort rather than fighting it — a tough leg into the breeze is repaid on the ' +
            'way home.' },
    { heading: 'Break it into the turn and the way home',
      body: 'On a flat, straight seafront course it helps to run to the 5 km turn, then treat the return as ' +
            'its own effort. Keep the cadence ticking and pick people off one at a time.' },
    { heading: 'Enjoy the finish',
      body: 'Save a little for the last stretch back along the promenade, lift the effort into the line, and ' +
            'enjoy the run in along the bay.' },
  ],

  pacingNote:
    'Checkpoint distances and climb for reference — a pacing target will be added closer to the day.',

  fuel: {
    carbsPerHourG: [30, 40],
    fluidPerHourMl: [300, 500],
    sodiumPerHourMg: null,
    preStart:
      'A light, familiar breakfast 2–3 hours before (e.g. porridge or toast) and sip water up to ~30 min before.',
    note:
      'Under an hour of running needs very little — you can race it on breakfast alone, with water grabbed ' +
      'at the 5 km station. If you like a lift, a single gel around 30–35 min works well. Nothing new on race day.',
  },

  kitNote:
    'No mandatory kit. Pick up or pin your race number the night before, and check the forecast the evening ' +
    'before for a wind/layer call. (These are sensible defaults — tune to your own kit.)',
  kitWear: [
    { label: 'Running vest or short-sleeve top' },
    { label: 'Running shorts or capris' },
    { label: 'Running socks' },
    { label: 'Road racing shoes' },
    { label: 'Cap or visor', detail: 'Optional — handy in sun or light rain off the bay' },
    { label: 'GPS watch', detail: 'Race-pace/5:30 screen set, fully charged' },
  ],
  kitCarry: [
    { label: 'Gel ×1', detail: 'Optional — around 30–35 min' },
    { label: 'Race number', detail: 'Pinned the night before' },
  ],
  kitDropBag: [],
  nightBefore: [
    'Charge watch',
    'Charge phone',
    'Pin race number to the vest',
    'Lay out race kit',
    'Check the morning forecast (wind off the bay)',
    'Prep breakfast for 2–3 hours before the 11:00 start',
    'Set the alarm — 11:00 start',
  ],
};
