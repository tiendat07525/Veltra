import React from 'react';
import './globals.css';
// Self-hosted (bundled into /_next/static/media): builds no longer download from Google Fonts
import '@fontsource-variable/plus-jakarta-sans';
import { NavigationProvider } from '@/lib/navigation';

// Every request needs its own CSP nonce (set in middleware), so no static prerendering
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Veltra – Realtime Chat Platform',
  description: 'A modern, hyper-responsive realtime messaging and collaboration platform built for speed, security, and elegance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Veltra – Ứng dụng chat realtime</title>
        <meta name="description" content="A modern, hyper-responsive realtime messaging and collaboration platform." />
      </head>
      <body className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
        <NavigationProvider>
          {children}
        </NavigationProvider>
      </body>
    </html>
  );
}
