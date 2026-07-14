// IRONMAN 70.3 Swansea — curated multi-discipline race guide (1.9 km swim / 90 km
// bike / 21.1 km run). The `disciplines` + `transitions` drive the per-leg guide and
// the estimated finish (from the athlete's fitness — no goal is set). Course facts
// from the organiser + public route info. Per-leg GPX are the official 2025 IMSWA
// routes (swim/bike/run); the race date is 11 July 2027. Joined to the live `plans`
// row (slug 'swansea-703').

import type { RaceGuide } from './types';

export const SWANSEA_703: RaceGuide = {
  slug: 'swansea-703',
  eventName: 'IRONMAN 70.3 Swansea',
  priority: 'A',
  ownerEmails: ['prosser13@gmail.com'],
  organiser: 'IRONMAN',
  region: 'Swansea Bay & the Gower, South Wales',
  start: { name: 'Prince of Wales Dock, Swansea', lat: 51.621, lng: -3.918 },
  finish: { name: 'Swansea city centre (Swansea Arena)', lat: 51.617, lng: -3.939 },
  distanceKm: 113,       // 1.9 + 90 + 21.1 (overall)
  ascentM: 1106,         // essentially all on the bike
  startTime: '06:30',    // rolling swim start; refine when the 2027 schedule lands
  gpxPath: '/races/swansea-703-bike.gpx',   // headline route = the bike (the story of the day)

  summary:
    'A half-distance triathlon on the South Wales coast: a sea-water swim inside the sheltered Prince of Wales Dock, ' +
    'a genuinely hilly 90 km bike loop out around the Gower peninsula, and a two-lap city half ' +
    'marathon along Swansea Bay. The bike is the story — 1,106 m of climbing over the Gower ' +
    'clifftops makes this a strength-rider’s course, not a flat-and-fast one. Success is a ' +
    'controlled swim, disciplined power on the climbs, and legs held back enough to run the two loops.',
  terrain: [
    'Swim: sheltered sea water in the enclosed Prince of Wales Dock — flat and calm, no surf; sighting the buoys still matters',
    'Bike: rolling-to-hilly Gower loop, coastal clifftops, exposed to wind',
    '1,106 m of bike climbing — relentless rather than one big col',
    'Run: two flat city-centre loops along the bay',
    'July on the Bristol Channel — mild but wind and showers are common',
  ],

  // Multi-discipline: the page renders each leg + T1/T2 and an ESTIMATED finish.
  disciplines: [
    {
      sport: 'swim', name: 'Swim', distanceKm: 1.9, ascentM: 0, gpxPath: '/races/swansea-703-swim.gpx',
      start: { name: 'Prince of Wales Dock', lat: 51.621, lng: -3.918 },
      summary: '1.9 km swim inside the enclosed Prince of Wales Dock — sea water but sheltered and flat, wetsuit-legal. Settle into rhythm, sight the buoys, and don’t redline early.',
      fuelNote: 'Nothing on the swim. A gel in T1 if the stomach’s ready.',
    },
    {
      sport: 'bike', name: 'Bike', distanceKm: 90, ascentM: 1106, gpxPath: '/races/swansea-703-bike.gpx',
      start: { name: 'T1 · dock', lat: 51.621, lng: -3.918 },
      summary: 'One 90 km loop out to the Mumbles and around the Gower’s coastal clifftops before returning along Swansea Bay. 1,106 m of climbing — ride the hills by power, not ego, and recover on the descents.',
      fuelNote: '~60–80 g carbs/h + fluids; drink to the climbs, eat on the flats. This is where the race is won or lost.',
    },
    {
      sport: 'run', name: 'Run', distanceKm: 21.1, ascentM: 60, gpxPath: '/races/swansea-703-run.gpx',
      start: { name: 'T2 · city centre', lat: 51.617, lng: -3.939 },
      summary: 'Two flat laps through the city centre and along the bay past Swansea Arena. Off a hilly bike, start conservative — the first 5 km should feel too easy.',
      fuelNote: 'Gel every ~30–40 min + water/electrolyte at aid stations; cola in the back half.',
    },
  ],
  transitions: [
    { kind: 'T1', name: 'T1 · Swim → Bike', estSeconds: 240, note: 'Wetsuit strip, helmet on, bike shoes, out.' },
    { kind: 'T2', name: 'T2 · Bike → Run', estSeconds: 120, note: 'Rack the bike, run shoes, cap, go.' },
  ],

  checkpoints: [],        // per-leg checkpoints TBC with the GPX
  goalTiers: [],          // no goal set — the guide shows an estimated finish instead

  seasonalWeather:
    'Mid-July on the Swansea Bay coast: typically 15–22 °C air, sea around 15–18 °C (wetsuit-legal). ' +
    'The Gower clifftops are exposed, so wind is the wildcard on the bike, and Channel showers are common — ' +
    'pack for wet-and-windy as readily as warm.',
  coachNotes: [
    { heading: 'The bike decides your run',
      body: 'With 1,106 m of climbing, it’s tempting to hammer the hills. Ride them at steady endurance power ' +
            '(around your 70.3 target, not threshold), soft-pedal the descents to recover, and arrive at T2 with ' +
            'legs that can still run two laps.' },
    { heading: 'Swim controlled, sight often',
      body: 'The dock swim is flat and sheltered — reward a calm, repeatable stroke over a fast start. Sight the ' +
            'buoys every few strokes, draft feet where you can, and treat the swim as the warm-up it is.' },
    { heading: 'Run the first 5 k like a diesel',
      body: 'The classic 70.3 error is running the first lap on adrenaline and walking the second. Start the run ' +
            'deliberately easy — it should feel almost too slow — then let it come to you over the two loops.' },
    { heading: 'Fuel the bike, not the run',
      body: 'You can only absorb carbs well on the bike. Take most of your fuel there (60–80 g/h), so the run is ' +
            'topping-up, not catching up. Rehearse the exact products on long rides first.' },
  ],
  pacingNote:
    'Estimated splits from your current fitness — swim from CSS, bike from FTP over the course profile, run ' +
    'from threshold pace — not a goal. Set your CSS and FTP in Settings to sharpen the estimate.',

  fuel: {
    carbsPerHourG: [60, 80],
    fluidPerHourMl: [500, 750],
    sodiumPerHourMg: 600,
    preStart: 'Bagel + banana (~80 g carbs) ~2 h before; a gel 10 min before the swim.',
    note: 'The engine room is the bike: 60–80 g carbs/h from drink-mix + gels/chews, front-loaded so the run ' +
          'is a top-up. Carry electrolyte for the warm/exposed sections. Rehearse this exact combination on long rides.',
  },
  kitNote: 'Wetsuit-legal dock swim (sheltered sea water); standard IRONMAN 70.3 kit. Check the athlete guide for the year’s specifics.',
  kitWear: [
    { label: 'Tri suit' },
    { label: 'Wetsuit', detail: 'Sea ~15–18 °C — wetsuit-legal' },
    { label: 'Goggles', detail: 'Plus a tinted spare' },
    { label: 'Swim cap', detail: 'Provided (colour = wave)' },
    { label: 'Garmin + HR strap' },
  ],
  kitCarry: [
    { label: 'Road/TT bike', detail: 'Serviced; GPS route loaded' },
    { label: 'Helmet', detail: 'Compulsory before you touch the bike' },
    { label: 'Bike shoes + run shoes' },
    { label: 'Nutrition', detail: 'Bottles pre-mixed; gels/chews taped to the top tube' },
    { label: 'Race belt + number' },
    { label: 'Cap / visor + sunglasses' },
  ],
  kitDropBag: [
    { label: 'Warm layer + waterproof', detail: 'For the exposed Gower / a wet day' },
    { label: 'Spare goggles' },
    { label: 'Anti-chafe + blister kit' },
    { label: 'Post-race dry kit + food' },
  ],
  nightBefore: [
    'Charge watch + bike computer',
    'Load the bike GPS route',
    'Pre-mix bike bottles; tape on gels/chews',
    'Lay out swim / bike / run kit and the wetsuit',
    'Pack T1 / T2 / special-needs bags per the athlete guide',
    'Prep the morning breakfast',
    'Check tyre pressures and bolts',
    'Set the alarm — transition closes early on race morning',
  ],
};
