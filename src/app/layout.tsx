import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-poppins',
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
      className={`${poppins.variable} h-full`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
