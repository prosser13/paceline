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
  ownerEmails: ['bethanaprosser@gmail.com'],
  organiser: 'London Marathon Events',
  region: 'London — point-to-point, Blackheath to The Mall',
  start: { name: 'Blackheath, Greenwich', lat: 51.47309, lng: 0.01158 },
  finish: { name: 'The Mall', lat: 51.50265, lng: -0.1386 },
  distanceKm: 42.2,
  ascentM: 50, // net downhill, essentially flat (~50 m smoothed)
  startTime: '10:00', // PLACEHOLDER — confirm Beth's wave time
  date: '2027-04-24',
  targetTime: null,      // no time goal set yet
  targetPace: null,
  hideTargets: true,     // blank target/goal/pacing figures for now
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
    { heading: 'Pace to your prediction, patiently',
      body: 'No fixed goal time is set, so the header shows a predicted finish from your current fitness. The ' +
            'marathon punishes running faster than that early more than any other distance — hold the predicted ' +
            'pace (or a touch slower) through halfway and you’ll have something left for the second half.' },
    { heading: 'Respect the distance — start easy',
      body: 'The first few miles off Blackheath drop downhill through huge crowds and feel effortless. That’s ' +
            'the trap: start comfortable and well within yourself. Running the early miles too hard is the one ' +
            'mistake that costs you late in a marathon.' },
    { heading: 'Fuel and drink regularly from early on',
      body: 'Don’t wait until you’re empty. Take on fuel and fluid steadily from the start — there’s water ' +
            'every 2 miles, on-course Lucozade Sport and gels at set points, and carry your own too. See the ' +
            'nutrition plan for the details; the key is little and often, not all at once.' },
    { heading: 'Break it into chunks',
      body: 'Don’t think about the whole distance. Run aid station to aid station, or landmark to landmark — ' +
            'Cutty Sark, Tower Bridge, Canary Wharf, the Embankment. The quiet middle miles around the Isle of ' +
            'Dogs are where staying patient and relaxed pays off.' },
    { heading: 'Use the crowds',
      body: 'London’s support is enormous — Tower Bridge at halfway and the Embankment run-in are special. ' +
            'Let the noise lift you, especially when it gets tough, but keep your effort steady rather than ' +
            'getting carried away.' },
    { heading: 'Protect the knee over the long build',
      body: 'This is a comeback marathon after knee surgery — the months of consistent, healthy training ' +
            'matter more than any single session. If the knee flares, back off and reassess rather than push ' +
            'through; getting to the start line fit is the whole point.' },
    { heading: 'Enjoy it',
      body: 'It’s one of the great marathons and a huge achievement to run. Soak up the finish up Birdcage ' +
            'Walk and onto The Mall — take it all in.' },
  ],

  pacingNote:
    'Checkpoint distances, climb and descent for reference — a pacing target will be added closer to the day.',

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
