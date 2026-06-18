export const dynamic = 'force-dynamic';

import { supabaseAdmin } from '@/lib/supabase-admin';
import SessionForm from '@/components/SessionForm';
import { updateSessionAction, deleteSessionAction } from '../../actions';
import { notFound } from 'next/navigation';
import DeleteButton from './DeleteButton';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSessionPage({ params }: Props) {
  const { id } = await params;

  const { data: session, error } = await supabaseAdmin
    .from('plan_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !session) notFound();

  const boundAction = updateSessionAction.bind(null, id);

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Edit session</h1>
        <DeleteButton id={id} action={deleteSessionAction} />
      </div>
      <SessionForm session={session} action={boundAction} submitLabel="Save changes" />
    </div>
  );
}
