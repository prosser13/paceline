export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 mb-4">Authentication failed. Please try again.</p>
        <a href="/auth/login" className="text-sky-400 hover:underline text-sm">
          Back to sign in
        </a>
      </div>
    </div>
  );
}
