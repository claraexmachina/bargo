import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Haggle — AI 중고거래 협상',
  description: '내 봇이 상대방 봇이랑 협상. 가격도, 만남 조건도, 다.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#F59E0B',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
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
                  <span className="text-primary">H</span>aggle
                </a>
                <nav className="flex items-center gap-2">
                  <a
                    href="/listings"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    매물 목록
                  </a>
                  <a
                    href="/listings/new"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                  >
                    등록
                  </a>
                </nav>
              </div>
            </header>

            <main className="flex-1 mx-auto w-full max-w-screen-md px-4 py-6">{children}</main>

            <footer className="border-t py-4 text-center text-xs text-muted-foreground">
              Haggle — TEE × Status Network × NEAR AI
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
