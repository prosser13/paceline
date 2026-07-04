// Tri Hard Harriers 5k on the Bay — curated race guide. A B-race tune-up inside
// the recovery block between the Dragon 50 and Málaga, with no dedicated training
// plan of its own, so the date/target live on the guide rather than a `plans` row.
// A flat, fast, chip-timed evening out-and-back on the Swansea Bay promenade.

import type { RaceGuide } from './types';

export const THH_5K_ON_THE_BAY: RaceGuide = {
  slug: 'thh-5k-on-the-bay',
  eventName: 'Tri Hard Harriers 5k on the Bay',
  priority: 'B',
  organiser: 'Tri Hard Harriers',
  region: 'Swansea Bay — Blackpill seafront',
  start: { name: 'Blackpill Lido, Swansea Bay', lat: 51.59832, lng: -3.99340 },
  finish: { name: 'Blackpill Lido, Swansea Bay', lat: 51.59832, lng: -3.99340 },
  distanceKm: 5,
  ascentM: 4, // pancake flat at sea level; GPS noise reads higher — ignore it
  startTime: '19:00',
  date: '2026-08-13',
  targetTime: '0:15:45', // H:MM:SS so the sub-hour time parses unambiguously
  targetPace: '3:09',
  gpxPath: '/races/thh-5k-on-the-bay.gpx',

  summary:
    'A flat, fast, chip-timed 5k on the Swansea Bay promenade — a straight out-and-back from Blackpill ' +
    'Lido along the seafront cycleway, turning at 2.5 km and retracing the same path to the line. There ' +
    'is no climbing to speak of (about 4 m the whole way) and no aid on course — it is a pure pace ' +
    'time-trial. The one real variable is the wind off the bay: an out-and-back means whatever helps you ' +
    'one way works against you the other, so the split that matters is effort, not the clock. A sharp ' +
    'B-race in the middle of the recovery block to blow the cobwebs off after the Dragon 50.',
  terrain: [
    'Smooth tarmac promenade / seafront cycleway throughout',
    'Pancake flat at sea level — ~4 m of elevation across the whole 5 km',
    'Single out-and-back: turnaround at 2.5 km, same path back',
    'Open and exposed to the bay — wind is the only real obstacle',
    'Shared path: hold a line and watch for other users near the turn',
  ],

  checkpoints: [
    { index: 0, name: 'Start · Blackpill Lido', distanceKm: 0, ascentM: 0, descentM: 0,
      supplies: '19:00 gun. Chip-timed off the line.' },
    { index: 1, name: '1 km', distanceKm: 1, ascentM: 1, descentM: 0,
      fuelBetween: 'Settle fast — the gun pace will feel too easy. Clamp it to 3:09/km, bank nothing.', fuelAt: '—' },
    { index: 2, name: '2 km', distanceKm: 2, ascentM: 2, descentM: 1,
      fuelBetween: 'Locked on and relaxed. Read the wind — if it is at your back now, it is a headwind home.', fuelAt: '—' },
    { index: 3, name: 'Turnaround · 2.5 km', distanceKm: 2.5, ascentM: 2, descentM: 1,
      supplies: 'Cone / marshal turn — take it tight, do not overrun it.',
      fuelBetween: 'Through halfway ~7:53. Drive out of the turn and re-find rhythm within 10 strides.', fuelAt: '—' },
    { index: 4, name: '4 km', distanceKm: 4, ascentM: 3, descentM: 3,
      fuelBetween: 'The hurt box. Hold form, quick feet, eyes on the next runner ahead — reel them in.', fuelAt: '—' },
    { index: 5, name: 'Finish · Blackpill Lido', distanceKm: 5, ascentM: 4, descentM: 4,
      fuelBetween: 'Empty the tank from 4.5 km — flat and fast to the line.', fuelAt: 'Done — target 15:45.' },
  ],

  goalTiers: [
    { label: 'A', time: '0:15:45', note: '3:09/km, even and disciplined — right in the mix at the front.' },
    { label: 'B', time: '0:16:15', note: '3:15/km — a strong run on a breezy night.' },
    { label: 'C', time: '0:16:45', note: '3:21/km — banked on a tougher day or a stiff headwind.' },
  ],

  seasonalWeather:
    'Mid-August on Swansea Bay, racing at 7 pm: usually mild and pleasant, around 16–21 °C with the worst ' +
    'of the day’s heat gone. The seafront is fully exposed, so the deciding factor is the wind off the ' +
    'bay — an onshore breeze can turn one leg of the out-and-back into hard work and gift the other back. ' +
    'Evening light is no issue at this time of year, but it can be brighter and lower on the homeward leg.',

  coachNotes: [
    { heading: 'Even is fastest on the flat',
      body: 'There is no hill to hide a surge and no descent to bail you out — a 5k this flat rewards a ' +
            'metronome. Hit 1 km bang on 3:09 even though it feels pedestrian; the back half of a 5k is ' +
            'always where it is won. Go out 5 sec/km hot here and the last kilometre falls apart.' },
    { heading: 'Pace the wind by effort, not pace',
      body: 'An out-and-back means you take the wind on the chin for one leg and ride it the other. Do not ' +
            'panic at a slow split into a headwind — hold the same hard effort, let the pace sag a touch, ' +
            'and bank the difference when you turn into the tailwind. Average it across the 5 km, not km by km.' },
    { heading: 'Own the turnaround',
      body: 'The 2.5 km cone is the one place free time leaks away. Run the tangent into it, take it tight, ' +
            'and drive hard out the other side — most people drift wide and freewheel for 50 m. Re-find race ' +
            'rhythm inside ten strides.' },
    { heading: 'Race the bodies, not just the clock',
      body: 'Most years this is a small, sharp field — a lone sub-15 off the front and a clutch in the high ' +
            '15s and low 16s. Your 15:45 A drops you right into that group fighting for the podium (you took ' +
            '2nd here before). Pick the runner ahead and reel them in; competition is worth seconds a clock ' +
            'never gives you.' },
    { heading: 'It’s a sharpener, not the goal',
      body: 'This is a B-race in the recovery block — race it hard for the time and the placing, but it is ' +
            'there to wake the legs up between the Dragon 50 and the Málaga build. Easy days either side so ' +
            'it sharpens rather than digs a hole, and you roll into the Málaga block fresh.' },
  ],

  pacingNote:
    'Even splits for 15:45 (3:09/km). The course is flat, so pace tracks effort — bar the wind on the ' +
    'out-and-back, where you hold effort and let the clock even out by the finish.',

  fuel: {
    carbsPerHourG: [0, 0],
    fluidPerHourMl: [0, 0],
    sodiumPerHourMg: null,
    preStart:
      'Nothing is needed during a 15-minute race — the work is done beforehand. For a 7 pm gun, eat a ' +
      'normal lunch and a light carb-based snack about 2–3 hours out (e.g. a bagel or some toast), then ' +
      'nothing heavy after ~5 pm. Sip water through the afternoon so you line up hydrated but not sloshing.',
    note:
      'No gels, no bottle — just race. If you like a lift, a single gel or a coffee 30–40 minutes before ' +
      'the gun is plenty. The only on-the-day fuelling job is timing the afternoon meals around the ' +
      'evening start so you are neither full nor empty on the line.',
  },

  kitNote:
    'No mandatory kit — just race essentials. The race is chip-timed and registration is on the night ' +
    'from ~17:30 to 18:30 at Blackpill Lido, where you collect your number, so leave time to park, sign ' +
    'on, and warm up before the 19:00 gun.',
  kitWear: [
    { label: 'Soar singlet' },
    { label: 'Adidas Adizero shorts' },
    { label: 'Danish Endurance socks' },
    { label: 'Asics Metaspeed Tokyo shoes' },
    { label: 'Sunglasses', detail: 'Low evening sun on the homeward leg' },
    { label: 'Garmin heart-rate strap' },
    { label: 'Garmin Fenix watch', detail: 'Race-pace screen set, fully charged' },
  ],
  kitCarry: [
    { label: 'Race number + pins', detail: 'Collected on the night — pin it before warming up' },
  ],
  kitDropBag: [],
  nightBefore: [
    'Charge watch and heart-rate strap',
    'Lay out race kit and racing shoes',
    'Plan race-day eating: normal lunch, light carb snack ~2–3 h before, nothing heavy after 5 pm',
    'Pack safety pins and entry payment (card/cash) for on-the-night registration',
    'Plan travel and parking for Blackpill Lido — arrive for registration 17:30–18:30',
    'Build in a proper warm-up: 10–15 min easy jog, drills, and 3–4 strides at race pace before the gun',
  ],
};
