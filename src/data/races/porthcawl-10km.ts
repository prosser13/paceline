// Brecon Carreg Porthcawl 10K (Run 4 Wales) — curated race guide. A B-race
// tune-up two weeks before the Dragon 50, with no dedicated training plan of
// its own, so the date/target live on the guide rather than a `plans` row.

import type { RaceGuide } from './types';

export const PORTHCAWL_10K: RaceGuide = {
  slug: 'porthcawl-10km',
  eventName: 'Brecon Carreg Porthcawl 10K',
  organiser: 'Run 4 Wales',
  region: 'Porthcawl, South Wales — closed-road coastal loop',
  start: { name: 'Porthcawl Pavilion, Promenade', lat: 51.47847, lng: -3.69867 },
  finish: { name: 'Porthcawl Pavilion, Promenade', lat: 51.47539, lng: -3.70400 },
  distanceKm: 10,
  ascentM: 50, // flat coastal, with a short rise toward the lighthouse ~6–8 km
  startTime: '10:00',
  date: '2026-07-05',
  targetTime: '0:33:59', // H:MM:SS so the sub-hour time parses unambiguously
  targetPace: '3:24',
  gpxPath: '/races/porthcawl-10km.gpx',

  summary:
    'A fast, fully closed-road coastal 10K designed by double Olympic marathoner Steve Brace. From the ' +
    'Porthcawl Pavilion it runs the seafront past Newton, Trecco and Sandy Bay, through Trecco Bay ' +
    'Holiday Park and Coney Beach, then back through the John Street shopping district. The one real ' +
    'lump is a short rise toward Rest Bay and the lighthouse around 6–8 km before a fast sprint finish ' +
    'along the Promenade. A PB-friendly course on a B-race day — two weeks out from the Dragon 50.',
  terrain: [
    'Closed tarmac roads and seafront promenade',
    'Flat for most of the loop',
    'One short rise toward the lighthouse / Rest Bay (~6–8 km)',
    'Fast, flat sprint finish on the Promenade',
  ],

  checkpoints: [
    { index: 0, name: 'Start · Porthcawl Pavilion', distanceKm: 0, ascentM: 0,
      supplies: '10:00 start on the Promenade.' },
    { index: 1, name: '2 km', distanceKm: 2, ascentM: 7,
      fuelBetween: 'Controlled start — settle to 3:24/km, bank nothing in the adrenaline.', fuelAt: 'Run through.' },
    { index: 2, name: '4 km', distanceKm: 4, ascentM: 17,
      fuelBetween: 'Relaxed and locked onto pace — the quiet, hard middle.', fuelAt: 'Run through.' },
    { index: 3, name: '6 km', distanceKm: 6, ascentM: 21, supplies: 'Water station (~halfway).',
      fuelBetween: 'Second Hi5 gel + grab water at the ~5 km station.', fuelAt: 'Water on the move.' },
    { index: 4, name: '8 km', distanceKm: 8, ascentM: 39,
      fuelBetween: 'The lighthouse rise — hold effort, let the pace dip, press over the top.', fuelAt: 'Run through.' },
    { index: 5, name: 'Finish · Promenade', distanceKm: 10, ascentM: 50,
      fuelBetween: 'Down off the rise — empty the tank and sprint the Promenade.', fuelAt: 'Done — target 33:59.' },
  ],

  goalTiers: [
    { label: 'A', time: '0:33:59', note: '~3:24/km — a strong, even effort start to finish.' },
    { label: 'B', time: '0:34:30', note: 'A new PB — ~3:27/km.' },
    { label: 'C', time: '0:34:59', note: 'Sub-35 — banked on a tougher day.' },
  ],

  seasonalWeather:
    'Early July on the South Wales coast: usually mild, 14–19 °C, with a fair chance of a sea breeze off ' +
    'the bay and either bright sun or passing showers. A 10:00 start keeps it cool enough for fast ' +
    'running — the main variable is the wind on the exposed seafront stretches.',

  coachNotes: [
    { heading: 'Start controlled, not heroic',
      body: 'The start-line buzz and a flat opening make 3:10s feel easy — clamp it to 3:24/km. A 10k is ' +
            'won in the last 3 km, never the first. Go out a few seconds slow rather than fast.' },
    { heading: 'Own the middle',
      body: '4–7 km is the lonely, hard patch where the pace stops feeling free. Lock onto effort, relax ' +
            'the shoulders, and keep the cadence ticking. This is where the PB is protected.' },
    { heading: 'Respect the lighthouse rise',
      body: 'The one real climb comes around 6–8 km toward Rest Bay. Hold effort rather than pace over it ' +
            '— a couple of seconds slower is fine — then use the descent back to the Promenade to wind it ' +
            'back up. Don’t panic if a km split blips here.' },
    { heading: 'Empty it on the Promenade',
      body: 'Off the rise it’s flat and fast to the line. From 8 km it should hurt — commit to the effort, ' +
            'pick a target ahead, and drive the sprint finish past the Pavilion.' },
    { heading: 'It’s a sharpener, not the goal',
      body: 'This is a B-race two weeks before the Dragon 50, so race it hard for the PB — but treat the ' +
            'days after as proper recovery (easy/short), so it sharpens the legs for the ultra rather than ' +
            'digging a hole.' },
  ],

  pacingNote:
    'Even splits for 33:59 (3:24/km). Flat but for the short lighthouse rise at 6–8 km — hold effort ' +
    'there and make it back on the fast Promenade finish.',

  fuel: {
    carbsPerHourG: [40, 50],
    fluidPerHourMl: [300, 500],
    sodiumPerHourMg: null,
    preStart:
      'Bagel a couple of hours before, then a Hi5 gel on the start line just before the gun.',
    note:
      'A fast 10k needs almost nothing — the start-line gel plus one more Hi5 around 5 km, with water ' +
      'grabbed on the move at the station. Race light.',
  },

  kitNote:
    'No mandatory kit. Your number is posted to you about a week before, so pin it the night before. ' +
    'Same race kit as Málaga.',
  kitWear: [
    { label: 'Soar singlet' },
    { label: 'Adidas Adizero shorts' },
    { label: 'Danish Endurance socks' },
    { label: 'Asics Metaspeed Tokyo shoes' },
    { label: 'Cap' },
    { label: 'Sunglasses' },
    { label: 'Garmin heart-rate strap' },
    { label: 'Garmin Fenix watch', detail: 'Race-pace screen set, fully charged' },
  ],
  kitCarry: [
    { label: 'Hi5 gels ×2', detail: 'One on the line, one at ~5 km' },
    { label: 'Race number', detail: 'Posted to you — pinned the night before' },
  ],
  kitDropBag: [],
  nightBefore: [
    'Charge watch',
    'Charge phone',
    'Pin race number to the singlet',
    'Lay out race kit',
    'Pocket the Hi5 gels (×2)',
    'Prep the morning bagel and breakfast',
    'Set the alarm — 10:00 start',
  ],
};
