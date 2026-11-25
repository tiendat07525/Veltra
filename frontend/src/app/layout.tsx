import React from 'react';
import type { Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
// Self-hosted (bundled into /_next/static/media): builds no longer download from Google Fonts
import '@fontsource-variable/plus-jakarta-sans';
import { NavigationProvider } from '@/lib/navigation';

// Every request needs its own CSP nonce (set in middleware), so no static prerendering
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Veltra – Ứng dụng chat realtime',
  description: 'Nhắn tin, gửi file và trò chuyện nhóm theo thời gian thực.',
};

// The only viewport tag: a hand-written <meta> in <head> was followed by Next's default one, which won.
// viewportFit 'cover' turns on the env(safe-area-inset-*) paddings; 'resizes-content' shrinks h-dvh
// when the Android keyboard opens so the composer stays visible.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

// Runs before the first paint so the saved theme shows without a light/dark flash.
// Static string (no user data); same key and default as hooks/use-theme.ts.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('veltra-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    // The head script sets class / color-scheme before React hydrates
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        {/* Browsers hide the nonce attribute after load, so the client sees nonce="" */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-dvh w-full overflow-hidden bg-app text-fg font-sans antialiased">
        <NavigationProvider>
          {children}
        </NavigationProvider>
      </body>
    </html>
  );
}
