import type { Metadata } from 'next';
import { Lora, Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

// Display headings + big numerals use Lora (serif); body, labels and metrics use Inter.
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  weight: ['500', '600', '700'],
});
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
      className={`${lora.variable} ${inter.variable} h-full`}
    >
      <body className="h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
