export const dynamic = 'force-dynamic';

import AppShell from '@/components/AppShell';
import StrengthClient from './StrengthClient';
import { STRENGTH_EXERCISES } from '@/data/strength-exercises';

export default function StrengthPage() {
  return (
    <AppShell>
      <div className="px-[26px] py-[22px] max-w-[760px]">
        <StrengthClient exercises={STRENGTH_EXERCISES} />
      </div>
    </AppShell>
  );
}
