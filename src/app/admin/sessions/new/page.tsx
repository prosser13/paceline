export const dynamic = 'force-dynamic';

import SessionForm from '@/components/SessionForm';
import { createSessionAction } from '../actions';

export default function NewSessionPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-white mb-6">Add session</h1>
      <SessionForm action={createSessionAction} submitLabel="Add session" />
    </div>
  );
}
