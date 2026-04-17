import { IntentMatchBanner } from '@/components/IntentMatchBanner';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Bargo — Pixel-cats barter while you nap',
  description: 'Two pixel-cat agents barter inside a TEE. You just show up at the meetup.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#B9CFF1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b-4 border-bargo-ink bg-bargo-bg">
              <div className="mx-auto flex h-16 max-w-screen-lg items-center justify-between px-4 md:px-6">
                <Link href="/" className="flex items-center gap-3">
                  <span className="logo-icon" aria-hidden="true" />
                  <span className="font-mono text-2xl font-black uppercase tracking-tight">
                    Bargo
                  </span>
                </Link>
                <nav className="flex items-center gap-1 sm:gap-2">
                  <Link
                    href="/listings"
                    className="pixel-pill hover:bg-bargo-accent transition-colors hidden sm:inline-flex"
                  >
                    Listings
                  </Link>
                  <Link
                    href="/listings/new"
                    className="pixel-pill hover:bg-bargo-accent transition-colors hidden sm:inline-flex"
                  >
                    Post
                  </Link>
                  <Link
                    href="/intents"
                    className="pixel-pill hover:bg-bargo-accent transition-colors hidden sm:inline-flex"
                  >
                    Intents
                  </Link>
                  <IntentMatchBanner />
                </nav>
              </div>
            </header>

            <main className="flex-1 mx-auto w-full max-w-screen-lg px-4 md:px-6 py-6">
              {children}
            </main>

            <footer className="tech-strip mt-10">
              <span className="opacity-60 uppercase font-black">Powered by</span>
              <div className="flex flex-wrap gap-6">
                {['NEAR AI TEE', 'Status Network', 'Karma'].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-bargo-accent" aria-hidden="true" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <span className="ml-auto opacity-50 text-[10px]">© 2026 BARGO</span>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
