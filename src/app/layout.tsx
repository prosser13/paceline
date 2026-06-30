import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

// Body, labels and metrics use Inter (self-hosted via next/font). The display
// serif (Lora) is self-hosted under the UNIQUE family name "PacelineSerif" via a
// hand-written @font-face in globals.css — see the note there. (next/font names
// Lora "lora", which CSS-case-insensitively collides with a system "Lora" that
// has a broken ~0.6em space glyph on some machines.)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: { default: 'Paceline', template: '%s — Paceline' },
  description: 'The plan that runs with you',
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://paceline.co'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
    >
      <body className="h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
