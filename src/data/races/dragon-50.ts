// Dragon Coastal 50 Mile Ultra (Run Walk Crawl) — curated race guide. Joined to
// the live `plans` row (slug 'dragon-50') for date/target/countdown. Checkpoint
// distances, cut-offs and supplies are the 2026 organiser figures.

import type { RaceGuide } from './types';

export const DRAGON_50: RaceGuide = {
  slug: 'dragon-50',
  eventName: 'Dragon Coastal 50 Mile Ultra',
  priority: 'A',
  organiser: 'Run Walk Crawl',
  region: 'South Wales coast — Kenfig to Cardiff Bay',
  start: { name: 'Kenfig Nature Reserve', lat: 51.5031, lng: -3.7283 },
  finish: { name: 'Norwegian Church, Cardiff Bay', lat: 51.4636, lng: -3.1656 },
  distanceKm: 81.3,
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
    { index: 0, name: 'Start — Kenfig Nature Reserve', distanceKm: 0, ascentM: 0, descentM: 0, cutoff: null,
      supplies: 'Toilets. 7.2 km loop of the reserve before CP1.' },
    { index: 1, name: 'CP1 · Kenfig', distanceKm: 7.2, ascentM: 30, descentM: 55, cutoff: null,
      supplies: 'Sweets, biscuits, crisps, crackers, fruit, water, squash. Toilets.',
      fuelBetween: 'Nothing yet — settle in, sip water.',
      fuelAt: 'Run through. Top up water if needed.' },
    { index: 2, name: 'CP2 · Newton', distanceKm: 17.7, ascentM: 100, descentM: 117, cutoff: null,
      supplies: 'Fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash, High5. No toilets.',
      fuelBetween: '1 pack of Beta Fuel chews.',
      fuelAt: 'Crisps + a few sweets. Fill water.' },
    { index: 3, name: 'CP3 · Southerndown', distanceKm: 31.4, ascentM: 200, descentM: 327, cutoff: '14:00',
      supplies: 'Hot drinks, soup, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.',
      fuelBetween: '1 pack of chews. Start the Hi5 flask if it’s warm.',
      fuelAt: '½ sandwich + biscuits. Fill water.' },
    { index: 4, name: 'CP4 · Llantwit Major', distanceKm: 43.5, ascentM: 650, descentM: 603, cutoff: '17:00', dropBag: true,
      supplies: 'Hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.',
      note: 'Drop-bag access here.',
      fuelBetween: '1 pack of chews.',
      fuelAt: 'Drop bag: restock chews, refill Hi5 flask, ½ sandwich, grab your treat.' },
    { index: 5, name: 'CP5 · Aberthaw', distanceKm: 49.9, ascentM: 700, descentM: 722, cutoff: '18:30',
      supplies: 'Fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash, High5. No toilets.',
      note: 'No supporters or support crews at this checkpoint.',
      fuelBetween: '1 pack of chews.',
      fuelAt: 'Quick stop — crisps/sweets, fill water.' },
    { index: 6, name: 'CP6 · Porthkerry Park', distanceKm: 60.4, ascentM: 900, descentM: 910, cutoff: '20:00',
      supplies: 'Hot dogs, hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets nearby.',
      fuelBetween: '1 pack of chews.',
      fuelAt: 'Hot dog! Fill water.' },
    { index: 7, name: 'CP7 · Sully', distanceKm: 70.0, ascentM: 1000, descentM: 1002, cutoff: '22:00',
      supplies: 'Hot drinks, fruit, sweets, biscuits, crisps, crackers, sandwiches, water, squash. Toilets.',
      fuelBetween: '1 pack of chews.',
      fuelAt: 'Sweets/biscuits if the stomach allows. Fill water.' },
    { index: 8, name: 'Finish — Norwegian Church', distanceKm: 81.3, ascentM: 1150, descentM: 1150, cutoff: '00:00',
      supplies: 'Cardiff Bay.',
      fuelBetween: 'Last pack of chews if you need it. Push to the line.',
      fuelAt: 'Done — 2:50 pm finish.' },
  ],

  goalTiers: [
    { label: 'A', time: '7:30', note: 'Strong day — ~5:35/km moving, disciplined on the climbs.' },
    { label: 'B', time: '8:30', note: 'Solid finish with plenty held in reserve.' },
    { label: 'C', time: '10:00', note: 'A tougher day — keep eating and grind it out.' },
  ],

  seasonalWeather:
    'Mid-July on the Bristol Channel coast: typically 15–22 °C, but the clifftops are exposed and a ' +
    'sea breeze can make it feel cooler and harder than the air temperature suggests. Showers are ' +
    'common — the waterproof is compulsory for good reason. On a clear day the early dune and beach ' +
    'sections offer no shade, so plan sun cover and extra fluid if it’s warm.',

  coachNotes: [
    { heading: 'Pace the first half like it’s the warm-up',
      body: 'The course is at its most runnable in the first 30 km. The temptation is to bank time on ' +
            'the flat early kilometres; resist it. The climbs cluster after CP4 (Llantwit Major) where you ' +
            'jump from 200 m to 1000 m of cumulative ascent in 26 km. Arrive at CP4 feeling like ' +
            'you’ve been lazy.' },
    { heading: 'Walk the climbs with intent',
      body: 'Power-hike every steep pitch from a long way out and run the flats and descents. A hard ' +
            'march uphill costs little time versus running and saves the legs for the relentless ' +
            'back third.' },
    { heading: 'Use the drop bag at CP4',
      body: 'Llantwit Major (43.5 km) is your one drop bag and the gateway to the hard section. Restock ' +
            'chews, refill the drink flask, swap to fresh socks if wet, and grab any layer you want for ' +
            'the exposed back half. CP5 (Aberthaw) has no crew, so leave CP4 self-sufficient to CP6.' },
    { heading: 'The race begins at CP4',
      body: 'From Llantwit Major the climbs come thick and fast — 200 m to 1000 m of ascent in the final ' +
            'third. This is where a 2:50 pm finish is earned: steady effort on the climbs, run the ' +
            'runnable, and keep eating. No heroics in the first half.' },
    { heading: 'Mind the exposure',
      body: 'Wind off the channel is the wildcard. A headwind on the open clifftop sections saps more ' +
            'than the climbs do. Eat and drink to schedule regardless of how you feel — the cold-wind ' +
            'days are when fuelling quietly slips.' },
  ],

  pacingNote:
    'Times distributed by climb-weighted effort, not flat pace — the back half is slower for a reason.',
  fuel: {
    carbsPerHourG: [60, 70],
    fluidPerHourMl: [400, 600],
    sodiumPerHourMg: 500,
    preStart:
      'Plain bagel (~50 g carbs) 45–60 minutes before the gun — easy to digest and tops off ' +
      'glycogen. Sip water or a weak carb drink up to the start; don’t line up thirsty.',
    note:
      'The backbone is one pack of Beta Fuel chews (46 g) on each leg, topped up with real food at the ' +
      'checkpoints — about 60 g of carbs an hour. Carry the Hi5 2:1 flask for warm spells. Rehearse this ' +
      'exact combination on long runs first.',
  },

  kitNote:
    'Compulsory kit is carried or worn at all times and checked at registration before you get your number.',
  kitWear: [
    { label: 'Long-sleeve top' },
    { label: 'Adidas Adizero shorts' },
    { label: 'Danish Endurance socks' },
    { label: 'New Balance Hierro trail shoes' },
    { label: 'Cap / hat' },
    { label: 'Sunglasses' },
    { label: 'Garmin heart-rate strap' },
    { label: 'Garmin Fenix watch', detail: 'GPS route loaded, fully charged' },
    { label: 'Number belt', detail: 'For the race number — collected at registration' },
    { label: 'Nipple plasters', detail: 'On before the start' },
  ],
  kitCarry: [
    { label: 'Salomon ADV Skin 12', detail: 'The pack itself' },
    { label: 'Long-sleeve base layer', detail: 'Compulsory spare warm top' },
    { label: 'Innov8 waterproof jacket', detail: 'Taped seams — compulsory' },
    { label: 'Buff', detail: 'Head covering — compulsory' },
    { label: 'Torch and spare batteries' },
    { label: 'Whistle' },
    { label: 'Foil survival blanket' },
    { label: 'Small first aid kit', detail: 'Blister plasters, sterile dressing, bandage or tape' },
    { label: 'Mobile phone' },
    { label: 'Emergency map', detail: 'Compulsory — provided at registration (added to your list)' },
    { label: 'Collapsible cup', detail: 'Compulsory for hot drinks / soup at checkpoints (added to your list)' },
    { label: 'Water bladder, filled' },
    { label: 'Soft-shell water flask', detail: 'For carb drink / if hot' },
    { label: 'Spare Danish Endurance socks' },
    { label: 'Sun cream' },
    { label: 'Nipple plasters', detail: 'Spare pair' },
  ],
  kitDropBag: [
    { label: 'SIS Beta Fuel chews ×4', detail: 'Back-half resupply, CP4 → finish' },
    { label: 'Hi5 2:1 drink mix sachets', detail: 'Refill the soft flask' },
    { label: 'Spare dry base layer', detail: 'In case the wind picks up on the back half' },
    { label: 'Foot care + anti-chafe', detail: 'Blister kit, Vaseline / nut butter' },
    { label: 'Paracetamol' },
    { label: 'Caffeine gels or tablets', detail: 'Save for the back half' },
    { label: 'Wet wipes', detail: 'A quick freshen-up at halfway' },
    { label: 'Cap / sunglasses', detail: 'If it’s bright on the exposed coast' },
    { label: 'A treat', detail: 'Something you’ll actually fancy at 43.5 km' },
    { label: 'Nipple plasters', detail: 'Fresh pair for the back half' },
  ],
  nightBefore: [
    'Charge watch',
    'Load GPS route to watch',
    'Charge phone',
    'Lay out race kit; fill the water bladder',
    'Pack the drop bag and race pack',
    'Prep the morning bagel and breakfast',
    'Check all items against this list',
    'Set the alarm — registration & kit check is 05:15–06:00 (number collected there)',
  ],
};
