export const dynamic = 'force-dynamic';

import { listAvailability } from '@/data/availability';
import AvailabilityCalendar from './AvailabilityCalendar';

// Availability — a month calendar where you record, in advance, when you can't
// train (whole day off, a time cap, activities barred, or equipment barred). Stored
// per day; the coach will read it in a later slice to shape the plan around it.
export default async function AvailabilityPage() {
  const entries = await listAvailability();

  return (
    <div className="px-4 md:px-[26px] py-[22px] max-w-[760px]">
      <h1 className="font-display font-bold text-[26px] mb-1">Availability</h1>
      <p className="text-[13px] font-medium text-stone mb-5">
        Mark the days you can&apos;t train — a whole day off, a time limit, or specific
        activities or equipment you won&apos;t have. Keep it up to date as far ahead as
        you can so the plan can be built around it.
      </p>
      <AvailabilityCalendar initial={entries} />
    </div>
  );
}
