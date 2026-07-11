export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;

const MESSAGES: Record<string, string> = {
  invalid_client: 'The application making this request is not recognised.',
  not_signed_in: 'You need to be signed in to a paceline owner account to authorize access.',
};

export default async function AuthorizeErrorPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const reason = (Array.isArray(sp.reason) ? sp.reason[0] : sp.reason) ?? '';
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[16px] border border-fog bg-paper p-7 text-center">
        <h1 className="font-display font-bold text-[22px] text-ink">paceline</h1>
        <p className="text-[14px] text-stone mt-3">{MESSAGES[reason] ?? 'This authorization request could not be completed.'}</p>
      </div>
    </div>
  );
}
