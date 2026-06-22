// Dragon Coastal 50 Mile Ultra (Run Walk Crawl) — curated race guide. Joined to
// the live `plans` row (slug 'dragon-50') for date/target/countdown. Checkpoint
// distances, cut-offs and supplies are the 2026 organiser figures.

import type { RaceGuide } from './types';

export const DRAGON_50: RaceGuide = {
  slug: 'dragon-50',
  eventName: 'Dragon Coastal 50 Mile Ultra',
  organiser: 'Run Walk Crawl',
  region: 'South Wales coast — Kenfig to Cardiff Bay',
  start: { name: 'Kenfig Nature Reserve', lat: 51.5031, lng: -3.7283 },
  finish: { name: 'Norwegian Church, Cardiff Bay', lat: 51.4636, lng: -3.1656 },
  distanceMi: 50.5,
  ascentM: 1150,
  startTime: '07:30', // midnight finish cut-off at 16.5 h ⇒ 07:30 start
  // Drop the user-supplied GPX here. The map/elevation render a placeholder
  // until this file exists.
  gpxPath: '/races/dragon-50.gpx',

  summary:
    'A point-to-point coastal ultra tracing the Glamorgan Heritage Coast from the dunes of ' +
    'Kenfig to Cardiff Bay. Largely runnable coast path with repeated short, sharp climbs in and ' +
    'out of the valleys between Southerndown and Barry — the elevation is death-by-a-thousand-cuts ' +
    'rather than any single big climb. Underfoot is a mix of grass clifftop, beach, woodland trail ' +
    'and stretches of road, often exposed to wind off the Bristol Channel.',
  terrain: [
    'Coast path: grass clifftop, exposed and undulating',
    'Beach and dune sections early (Kenfig, Newton)',
    'Repeated short steep climbs between valleys (CP3–CP7)',
    'Some road and urban path on the run-in to Cardiff Bay',
    'Can be muddy/slippery underfoot — grip matters',
  ],

  checkpoints: [
    { index: 0, name: 'Start — Kenfig Nature Reserve', distanceMi: 0, ascentM: 0, cutoff: null,
      supplies: 'Toilets. 4.5-mile loop of the reserve before CP1.' },
    { index: 1, name: 'CP1 · Kenfig', distanceMi: 4.5, ascentM: 30, cutoff: null,
      supplies: 'Sweets, biscuits, crisps, crackers, fruit, water, squash. Toilets.' },
    { index: 2, name: 'CP2 · Newton', distanceMi: 11, ascentM: 100, cutoff: null,
      supplies: 'Fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash, High5. No toilets.' },
    { index: 3, name: 'CP3 · Southerndown', distanceMi: 19.5, ascentM: 200, cutoff: '14:00',
      supplies: 'Hot drinks, soup, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.' },
    { index: 4, name: 'CP4 · Llantwit Major', distanceMi: 27, ascentM: 650, cutoff: '17:00', dropBag: true,
      supplies: 'Hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.',
      note: 'Drop-bag access here.' },
    { index: 5, name: 'CP5 · Aberthaw', distanceMi: 31, ascentM: 700, cutoff: '18:30',
      supplies: 'Fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash, High5. No toilets.',
      note: 'No supporters or support crews at this checkpoint.' },
    { index: 6, name: 'CP6 · Porthkerry Park', distanceMi: 37.5, ascentM: 900, cutoff: '20:00',
      supplies: 'Hot dogs, hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets nearby.' },
    { index: 7, name: 'CP7 · Sully', distanceMi: 43.5, ascentM: 1000, cutoff: '22:00',
      supplies: 'Hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.' },
    { index: 8, name: 'Finish — Norwegian Church', distanceMi: 50.5, ascentM: 1150, cutoff: '00:00',
      supplies: 'Cardiff Bay. Midnight cut-off (16.5 h).' },
  ],

  goalTiers: [
    { label: 'A', time: '7:30', note: 'Strong day — ~5:35/km moving, disciplined on the climbs.' },
    { label: 'B', time: '8:30', note: 'Solid finish with margin in hand against every cut-off.' },
    { label: 'C', time: '10:00', note: 'See it through — stay ahead of cut-offs, keep eating.' },
  ],

  seasonalWeather:
    'Mid-July on the Bristol Channel coast: typically 15–22 °C, but the clifftops are exposed and a ' +
    'sea breeze can make it feel cooler and harder than the air temperature suggests. Showers are ' +
    'common — the waterproof is compulsory for good reason. On a clear day the early dune and beach ' +
    'sections offer no shade, so plan sun cover and extra fluid if it’s warm.',

  coachNotes: [
    { heading: 'Pace the first half like it’s the warm-up',
      body: 'The course is at its most runnable in the first 20 miles. The temptation is to bank time on ' +
            'the flat early miles; resist it. The climbs cluster after CP4 (Llantwit Major) where you ' +
            'jump from 200 m to 1000 m of cumulative ascent in 16 miles. Arrive at CP4 feeling like ' +
            'you’ve been lazy.' },
    { heading: 'Walk the climbs with intent',
      body: 'Power-hike every steep pitch from a long way out and run the flats and descents. A hard ' +
            'march uphill costs little time versus running and saves the legs for the back third where ' +
            'the cut-offs tighten.' },
    { heading: 'Use the drop bag at CP4',
      body: 'Llantwit Major (27 mi) is your one drop bag and the gateway to the hard section. Restock ' +
            'food, swap to fresh socks if wet, grab the head torch and any layers for the evening. ' +
            'CP5 (Aberthaw) has no crew, so leave CP4 self-sufficient to CP6.' },
    { heading: 'Respect the cut-offs late',
      body: 'CP6 (20:00), CP7 (22:00) and the finish (midnight) all run at ~3 mph. If the day has gone ' +
            'long, keep checkpoint stops short and keep moving — time lost standing around is the usual ' +
            'reason runners miss a late cut-off.' },
    { heading: 'Mind the exposure',
      body: 'Wind off the channel is the wildcard. A headwind on the open clifftop sections saps more ' +
            'than the climbs do. Eat and drink to schedule regardless of how you feel — the cold-wind ' +
            'days are when fuelling quietly slips.' },
  ],

  fuel: {
    carbsPerHourG: [50, 70],
    fluidPerHourMl: [400, 600],
    sodiumPerHourMg: 500,
    carry: [
      'Two 500 ml soft flasks (one water, one with hydration tabs)',
      'Gels / chews for ~60 g carbs per hour between checkpoints',
      'A couple of “real food” options (e.g. flapjack, savoury) for the long CP4–CP6 stretch',
      'Hydration tablets to refill at checkpoints',
    ],
    checkpointStrategy: [
      'Top both flasks at every checkpoint — don’t leave one empty',
      'Take in quick carbs while moving out: biscuits, crisps, fruit',
      'From CP3 onward use hot drinks/soup if it’s cold to keep eating',
      'Keep stops short past CP5 where cut-offs tighten',
    ],
    dropBag: [
      'Restock of gels/chews and real food to the finish',
      'Spare socks (clifftop and beach sections can leave feet wet)',
      'Head torch + spare batteries for the evening hours',
      'Extra layer / spare base layer for the exposed back half',
      'Anti-chafe, painkillers, any taping you might need',
    ],
  },

  kitCompulsory: [
    { label: 'Rucksack or means to carry kit' },
    { label: 'Waterproof jacket', detail: 'With taped seams' },
    { label: 'Long-sleeve base layer / thermal top', detail: 'Upper body, warm' },
    { label: 'Head covering', detail: 'Warm hat or buff' },
    { label: 'Torch and spare batteries' },
    { label: 'Whistle', detail: 'The one on your pack is fine' },
    { label: 'Trail running shoes', detail: 'Adequate grip for slippery off-road' },
    { label: 'Foil survival blanket or foil bivy bag' },
    { label: 'Small first aid kit', detail: 'Blister plasters, sterile dressing, bandage or tape' },
    { label: 'Mobile phone' },
    { label: 'Emergency map', detail: 'Provided at registration' },
    { label: 'Water bottle 500 ml min and/or cup', detail: 'For drinks at checkpoints' },
    { label: 'Food / energy products', detail: 'Appropriate for your expected finish time' },
    { label: 'GPS device with the route loaded', detail: 'Phone app, watch or handheld — enough battery to last' },
    { label: 'Solid plastic cup with handle', detail: 'Required if you want hot drinks at checkpoints' },
  ],
  kitAdvisory: [
    { label: 'Thermal / fleece top', detail: 'In addition to the compulsory base layer' },
    { label: 'Lower body base layer or trousers' },
    { label: 'Hydration tablets or similar' },
    { label: 'Money' },
    { label: 'Sunglasses' },
    { label: 'Sun cream' },
  ],
};
