// Generali Maratón Málaga — curated race guide. Joined to the live plan row
// (slug 'malaga-marathon') for date/target/countdown. A flat, fast PB course;
// the "checkpoints" are 5 km splits / aid stations rather than ultra control
// points, and there's no mandatory kit or mid-race drop bag.

import type { RaceGuide } from './types';

export const MALAGA_MARATHON: RaceGuide = {
  slug: 'malaga-marathon',
  eventName: 'Generali Maratón Málaga',
  priority: 'A',
  organiser: 'Generali / Maratón Málaga',
  region: 'Málaga, Spain — flat city loop',
  start: { name: 'Paseo del Parque, Málaga', lat: 36.71953, lng: -4.41597 },
  finish: { name: 'Paseo del Parque, Málaga', lat: 36.71954, lng: -4.41597 },
  distanceKm: 42.2,
  ascentM: 140, // officially flat (~107–181 m gross); GPS elevation is noisy
  startTime: '08:30',
  gpxPath: '/races/malaga-marathon.gpx',

  summary:
    'A flat, fast PB course and a sightseeing tour of Málaga in one. Starting and finishing on the ' +
    'palm-lined Paseo del Parque by the City Hall, the loop takes in the Malagueta bullring, Plaza de ' +
    'la Merced, the Alcazaba and Roman Theatre, the Cathedral and the Muelle Uno harbourfront. Net ' +
    'elevation is essentially zero — just gentle rises over the odd flyover or junction — so this is a ' +
    'metronome day: hold the pace and let the course give back the time.',
  terrain: [
    'Smooth tarmac city roads throughout',
    'Net flat — only brief, gentle rises over flyovers / junctions',
    'Open, exposed sections along the harbourfront (sun later in the morning)',
    'A few tight turns through the old town — run the tangents',
  ],

  checkpoints: [
    { index: 0, name: 'Start · Paseo del Parque', distanceKm: 0, ascentM: 0, descentM: 0,
      supplies: 'Box 2 (red), 08:30 start.' },
    { index: 1, name: '5 km', distanceKm: 5, ascentM: 18, descentM: 20, supplies: 'Water station.',
      fuelBetween: 'Settle into goal pace — no rush, hold 3:47.', fuelAt: 'Water.' },
    { index: 2, name: '10 km', distanceKm: 10, ascentM: 35, descentM: 28, supplies: 'Water station.',
      fuelBetween: 'First fuel by ~8 km: 1 pack Beta Fuel chews (46 g).', fuelAt: 'Water.' },
    { index: 3, name: '15 km', distanceKm: 15, ascentM: 55, descentM: 45, supplies: 'Water + isotonic.',
      fuelBetween: 'Hi5 gel (23 g).', fuelAt: 'Water / isotonic.' },
    { index: 4, name: '20 km', distanceKm: 20, ascentM: 78, descentM: 64, supplies: 'Water station.',
      fuelBetween: 'Beta Fuel chews (46 g). Halfway ~1:20 — check you’re on pace.', fuelAt: 'Water.' },
    { index: 5, name: '25 km', distanceKm: 25, ascentM: 98, descentM: 86, supplies: 'Water + isotonic.',
      fuelBetween: 'Hi5 gel (23 g).', fuelAt: 'Water.' },
    { index: 6, name: '30 km', distanceKm: 30, ascentM: 112, descentM: 102, supplies: '226ers gel station (55 g). Water.',
      fuelBetween: 'Run in light — the big top-up is here.', fuelAt: '226ers gel — grab 2, take one now (55 g).' },
    { index: 7, name: '35 km', distanceKm: 35, ascentM: 124, descentM: 117, supplies: 'Water + isotonic.',
      fuelBetween: '226ers #2 (55 g) around 36 km.', fuelAt: 'Water.' },
    { index: 8, name: '40 km', distanceKm: 40, ascentM: 134, descentM: 132, supplies: 'Water station.',
      fuelBetween: 'Spare Hi5 (23 g) only if you want a final lift.', fuelAt: 'Water — then empty the tank.' },
    { index: 9, name: 'Finish · Paseo del Parque', distanceKm: 42.2, ascentM: 140, descentM: 140, supplies: 'Finish on the Paseo del Parque.',
      fuelBetween: 'Hammer the last 2 km home.', fuelAt: 'Done — target 2:39:40.' },
  ],

  goalTiers: [
    { label: 'A', time: '2:39:40', note: '3:47/km, even and disciplined — the dream day.' },
    { label: 'B', time: '2:44:59', note: 'Sub-2:45 — ~3:54/km, still a strong run.' },
    { label: 'C', time: '2:49:41', note: 'A new PB — bank this before chasing more.' },
  ],

  seasonalWeather:
    'Early November in Málaga is mild and usually dry — typically 13–21 °C with plenty of sun and ' +
    'little wind: close to ideal marathon weather. The catch is the late-morning sun on the exposed ' +
    'harbourfront sections, which can feel warm in the closing miles, so the cap and sunglasses earn ' +
    'their place and it’s worth taking water at every station.',

  coachNotes: [
    { heading: 'Don’t get dragged out',
      body: 'Box 2 (red) puts you among quick runners and the adrenaline is real. The first couple of ' +
            'kilometres always feel easy — clamp it to 3:47/km and bank nothing. A 5–10 sec/km overcook ' +
            'early is the single biggest threat to a 2:39.' },
    { heading: 'Let the flat course do the work',
      body: 'This is a metronome day, not a tactical one. Even effort = even pace on ground this flat. If ' +
            'anything, aim to run the second half a touch quicker than the first — pass people from 30 km, ' +
            'don’t get passed.' },
    { heading: 'Fuel early, not late',
      body: 'Take the first gel by ~8 km and keep the drip going every ~5 km — don’t wait until you feel ' +
            'you need it. The 226ers station at 30 km is your big top-up for the closing 12 km. Practise ' +
            'the 226ers in training first so race day holds no surprises.' },
    { heading: 'Manage the sun',
      body: 'The harbourfront and Muelle Uno stretches are open and can be bright by late morning. Cap and ' +
            'shades on from the gun, and take water at every station even when you don’t feel thirsty — ' +
            'small, regular sips beat big gulps.' },
    { heading: 'The race is 32–42 km',
      body: 'If you’ve paced it right, the last 10 km is where you make time, not lose it. Lock onto the ' +
            'effort, shorten nothing, and ride the run-in past Muelle Uno back to the Paseo del Parque.' },
  ],

  pacingNote:
    'Even splits for your 2:39:40 target (3:47/km). The course is flat — let the pace do the work and, ' +
    'if anything, run a touch quicker from halfway.',

  fuel: {
    // Raised from 70–80 (9 Jul): the block's gut-training progression peaks at 90,
    // so race day fuels at what was rehearsed.
    carbsPerHourG: [80, 90],
    fluidPerHourMl: [400, 600],
    sodiumPerHourMg: 400,
    preStart:
      'Plain bagel (~50 g carbs) a couple of hours before, then sips of water or a weak carb drink up ' +
      'to the start so you line up topped off.',
    note:
      'Carry 2 packs of Beta Fuel chews (46 g) + 4 Hi5 gels (23 g) — three to use and one spare. Take ' +
      'the first by ~6 km, then roughly one every 4–5 km, and grab 2× 226ers (55 g) at the 30 km gel ' +
      'station. That lands you around 80–90 g of carbs an hour — the rate the block’s long runs ' +
      'rehearsed. Practise the exact line-up — especially the 226ers — on a long run first.',
  },

  kitNote:
    'No mandatory kit — just race essentials. You collect your number before race day, so pin it the ' +
    'night before. Bag drop for street clothes is at Centre Pompidou, 07:20–08:20.',
  kitWear: [
    { label: 'Soar singlet' },
    { label: 'Adidas Adizero shorts' },
    { label: 'Danish Endurance socks' },
    { label: 'Asics Metaspeed Tokyo shoes' },
    { label: 'Cap' },
    { label: 'Sunglasses' },
    { label: 'Garmin heart-rate strap' },
    { label: 'Garmin Fenix watch', detail: 'Race-pace screen set, fully charged' },
    { label: 'Nipple plasters', detail: 'On before the start' },
  ],
  kitCarry: [
    { label: 'SIS Beta Fuel chews ×2', detail: '46 g carbs each — first half' },
    { label: 'Hi5 gels ×4', detail: '23 g each — 3 to use, 1 spare' },
    { label: 'Race number', detail: 'Pinned to the singlet the night before' },
  ],
  kitDropBag: [],
  nightBefore: [
    'Charge watch',
    'Charge phone',
    'Pin race number to the singlet',
    'Lay out race kit',
    'Count out and pocket the gels — 2 Beta Fuel + 3 Hi5',
    'Prep the morning bagel and breakfast',
    'Pack a bag-drop bag for street clothes (Centre Pompidou, 07:20–08:20)',
    'Set the alarm — 08:30 start, box 2 (red)',
  ],
};
