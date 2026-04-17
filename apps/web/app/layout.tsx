import { IntentMatchBanner } from '@/components/IntentMatchBanner';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Bargo — AI-powered P2P Negotiation',
  description: 'Your bot negotiates with theirs. Price, meetup conditions, everything.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#F59E0B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
              <div className="mx-auto flex h-14 max-w-screen-md items-center justify-between px-4">
                <a href="/" className="flex items-center gap-2 font-bold text-lg">
                  <span className="text-primary">B</span>argo
                </a>
                <nav className="flex items-center gap-2">
                  <a
                    href="/listings"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Listings
                  </a>
                  <a
                    href="/listings/new"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                  >
                    Create
                  </a>
                  <a
                    href="/intents"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                  >
                    Intents
                  </a>
                  <IntentMatchBanner />
                </nav>
              </div>
            </header>

            <main className="flex-1 mx-auto w-full max-w-screen-md px-4 py-6">{children}</main>

            <footer className="border-t py-4 text-center text-xs text-muted-foreground">
              Bargo — TEE × Status Network × NEAR AI
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
