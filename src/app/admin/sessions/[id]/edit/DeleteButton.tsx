'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  action: (id: string) => Promise<{ error?: string }>;
}

export default function DeleteButton({ id, action }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm('Delete this session? This will also remove it from intervals.icu.')) return;
    startTransition(async () => {
      const result = await action(id);
      if (result?.error) { alert(result.error); return; }
      router.push('/admin/sessions');
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-40"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
