// London Marathon — curated race guide (Beth's A-race). The classic point-to-point
// London course: a net-downhill, essentially flat 42.2 km from Blackheath/Greenwich
// in the south-east, out around the Isle of Dogs and back along the Thames to finish
// on The Mall. Course stats from a 2026 competitor's GPX
// (/public/races/london-marathon.gpx): 42.25 km, ~50 m of (smoothed) climb, start
// (51.473, 0.012) ≠ finish (51.503, -0.139).
//
// Aid provision (per the organiser): water every 2 miles; Lucozade Sport (cups,
// ~150 ml ≈ 9.6 g carbs at 32 g/500 ml) at miles 9, 15, 21, 23; Lucozade gels (30 g)
// at miles 19 and 22. See the fuel plan for how to build on that.
//
// startTime is a PLACEHOLDER (10:00) — London runs in waves and the 2027 times
// aren't published; update once Beth's wave is known.

import type { RaceGuide } from './types';

export const LONDON_MARATHON: RaceGuide = {
  slug: 'london-marathon',
  eventName: 'London Marathon',
  priority: 'A',
  organiser: 'London Marathon Events',
  region: 'London — point-to-point, Blackheath to The Mall',
  start: { name: 'Blackheath, Greenwich', lat: 51.47309, lng: 0.01158 },
  finish: { name: 'The Mall', lat: 51.50265, lng: -0.1386 },
  distanceKm: 42.2,
  ascentM: 50, // net downhill, essentially flat (~50 m smoothed)
  startTime: '10:00', // PLACEHOLDER — confirm Beth's wave time
  date: '2027-04-24',
  targetTime: '5:00:00',
  targetPace: '7:07', // ~7:07/km for a sub-5:00 finish
  gpxPath: '/races/london-marathon.gpx',

  summary:
    'The classic London Marathon: a big, loud, point-to-point 42.2 km that starts on Blackheath in ' +
    'south-east London, drops down past the Cutty Sark in Greenwich, crosses the Thames at the roaring ' +
    'Tower Bridge around halfway, loops out through the Isle of Dogs and Canary Wharf in the late teens ' +
    'of miles, then runs back along the Embankment past Big Ben and up Birdcage Walk to finish on The ' +
    'Mall. It is flat and net-downhill — a fast course where the challenge is the distance and the crowds, ' +
    'not the hills. The one trap is the downhill opening miles, which make it far too easy to start quick.',
  terrain: [
    'Closed London roads — flat and net-downhill',
    'Fast, crowded opening miles off Blackheath',
    'Tower Bridge crossing around halfway (~13 miles)',
    'The quieter, working stretch through the Isle of Dogs (miles ~15–22)',
    'Embankment run-in past Big Ben to the finish on The Mall',
  ],

  checkpoints: [
    { index: 0, name: 'Start · Blackheath', distanceKm: 0, ascentM: 0, descentM: 0,
      supplies: 'Wave start on Blackheath (10:00 placeholder — confirm your wave).' },
    { index: 1, name: 'Mile 9 · past Cutty Sark', distanceKm: 14.5, ascentM: 10, descentM: 20,
      supplies: 'Lucozade Sport (cup ~150 ml ≈ 9.6 g carbs).',
      fuelBetween: 'Downhill opening miles — hold 7:07/km, don’t bank time in the crowds. Water every 2 miles from the early miles; sip steadily and take your first own gel by ~45 min.',
      fuelAt: 'Lucozade Sport (~150 ml)' },
    { index: 2, name: 'Halfway · Tower Bridge', distanceKm: 21.1, ascentM: 18, descentM: 30,
      fuelBetween: 'The Tower Bridge roar — soak it up but keep the pace honest. Keep taking water at the 2-mile stations.',
      fuelAt: 'Water' },
    { index: 3, name: 'Mile 15 · Isle of Dogs', distanceKm: 24.1, ascentM: 24, descentM: 36,
      supplies: 'Lucozade Sport (cup ~150 ml).',
      fuelBetween: 'Into the quieter working half — settle in and keep fuelling before you feel you need to.',
      fuelAt: 'Lucozade Sport (~150 ml)' },
    { index: 4, name: 'Mile 19 · Canary Wharf', distanceKm: 30.6, ascentM: 32, descentM: 44,
      supplies: 'Lucozade energy gel (30 g).',
      fuelBetween: 'Where the marathon gets real. Take the on-course gel and, if you can, one of your own — carbs now protect the last 10 km.',
      fuelAt: 'Lucozade gel (30 g)' },
    { index: 5, name: 'Mile 22 · Embankment approach', distanceKm: 35.4, ascentM: 42, descentM: 52,
      supplies: 'Lucozade energy gel (30 g). Lucozade Sport back at mile 21.',
      fuelBetween: 'Drink at mile 21 (Lucozade Sport) on the way here, then the second gel. Break the run-in into 2 km chunks.',
      fuelAt: 'Lucozade gel (30 g)' },
    { index: 6, name: 'Finish · The Mall', distanceKm: 42.2, ascentM: 50, descentM: 62,
      supplies: 'Last Lucozade Sport at mile 23.',
      fuelBetween: 'Along the Embankment, past Big Ben, up Birdcage Walk and right onto The Mall — empty the tank to the line.',
      fuelAt: '—' },
  ],

  goalTiers: [
    { label: 'A', time: '5:00:00', note: 'Sub-5:00 — ~7:07/km, even effort start to finish.' },
    { label: 'B', time: '5:15:00', note: '~7:28/km — a strong first marathon on a tough day.' },
    { label: 'C', time: '5:30:00', note: 'Finish strong and enjoy it — banked whatever the day throws up.' },
  ],

  seasonalWeather:
    'Late April in London: usually mild, around 8–15 °C, but hugely variable — it can be a cold, grey ' +
    'morning or an unseasonably warm day, and a warm London Marathon is the classic hazard for a longer ' +
    'finish time. Watch the forecast in the fortnight before and be ready to raise fluid and dial back ' +
    'pace if it’s warm.',

  coachNotes: [
    { heading: 'Bank effort, not pace, on the downhill start',
      body: 'The first few miles off Blackheath drop downhill through big crowds, and 6:40s will feel ' +
            'effortless. Clamp it to 7:07/km. Every second banked early is repaid with interest after 20 miles — ' +
            'start controlled and you’ll pass hundreds of people in the last 10 km.' },
    { heading: 'Fuel early and to a schedule',
      body: 'Don’t wait for the wall. Start carbs by ~45 min and keep a steady drip — aim for 30–60 g of carbs ' +
            'an hour. The on-course Lucozade helps but is light and front-loaded, so carry your own gels and take ' +
            'them on a clock (e.g. every 30–40 min), not by feel.' },
    { heading: 'Respect the Isle of Dogs',
      body: 'Miles 15–22 around Canary Wharf are the quiet, twisting, mentally hard stretch where the crowds ' +
            'thin. This is where the race is won or lost — hold form, keep the cadence up, and break it into ' +
            'small chunks between fuel points.' },
    { heading: 'Take the Tower Bridge lift, then let it go',
      body: 'Crossing Tower Bridge at halfway is the loudest moment of the day — enjoy it, but don’t let the ' +
            'adrenaline pull a fast half-marathon split out of you. Check your watch, reset to 7:07, carry on.' },
    { heading: 'Save something for The Mall',
      body: 'From the Embankment it’s flat and lined the whole way. From mile 23 it should hurt — commit to the ' +
            'effort, use the crowd, and drive past Big Ben and up Birdcage Walk to the finish on The Mall.' },
  ],

  pacingNote:
    'Even splits for 5:00:00 (7:07/km) on a flat, net-downhill course. The discipline is holding back on the ' +
    'fast opening miles — negative-split it if anything, and let the crowds carry the finish.',

  fuel: {
    carbsPerHourG: [30, 60],
    fluidPerHourMl: [400, 600],
    sodiumPerHourMg: null,
    preStart:
      'A familiar, carb-rich breakfast ~3 hours before (porridge/toast, banana), then sip water and maybe a ' +
      'gel ~15 min before the gun. Nothing new on race day.',
    note:
      'On-course fuel is Lucozade Sport (≈150 ml cups, ~9.6 g carbs each) at miles 9, 15, 21 and 23, plus ' +
      'Lucozade gels (30 g) at miles 19 and 22 — about ~98 g of carbs total, and front-light. Over a ~5-hour ' +
      'race that’s only ~20 g/h, below the 30–60 g/h a marathon wants, so carry 3–4 of your own gels to top ' +
      'up and take water at the 2-mile stations throughout. Practise taking Lucozade Sport (and your gels) on ' +
      'long runs so race-day carbs sit well.',
  },

  kitNote:
    'No mandatory kit. Your number + timing chip come in the post; bring warm throwaway layers for the long ' +
    'wait on Blackheath and use the baggage lorries at the start (kit bag to collect at the finish). ' +
    '(Kit below is a sensible default — tune it to your own gear.)',
  kitWear: [
    { label: 'Running vest or short-sleeve top', detail: 'Pin your race number the night before' },
    { label: 'Running shorts or capris' },
    { label: 'Running socks' },
    { label: 'Cushioned road marathon shoes', detail: 'Well broken-in — nothing new' },
    { label: 'Cap or visor' },
    { label: 'GPS watch', detail: 'Race-pace/7:07 screen set, fully charged' },
    { label: 'Throwaway layer', detail: 'Old jumper/bin-bag for the cold start wait' },
  ],
  kitCarry: [
    { label: 'Own gels ×3–4', detail: 'To top up on-course fuel to 30–60 g/h — taken on a clock' },
    { label: 'Race number + timing chip', detail: 'Posted to you — number pinned the night before' },
    { label: 'Small cash / phone', detail: 'Optional, for after' },
  ],
  kitDropBag: [
    { label: 'Warm dry layers for the finish' },
    { label: 'Recovery snack + drink' },
    { label: 'Blister plasters / basics' },
  ],
  nightBefore: [
    'Charge watch',
    'Charge phone',
    'Pin race number to the vest, attach timing chip',
    'Lay out race kit + throwaway layer',
    'Pack the start baggage bag (finish layers)',
    'Pocket your own gels (×3–4)',
    'Check the morning forecast + travel to the start',
    'Prep breakfast for ~3 hours before the start',
    'Set the alarm — allow time for travel and the wave start',
  ],
};
