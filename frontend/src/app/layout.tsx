import React from 'react';
import './globals.css';
import { NavigationProvider } from '@/lib/navigation';

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
        <title>Veltra – Realtime Chat Platform</title>
        <meta name="description" content="A modern, hyper-responsive realtime messaging and collaboration platform." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
        <NavigationProvider>
          {children}
        </NavigationProvider>
      </body>
    </html>
  );
}
