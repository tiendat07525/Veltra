import React from 'react';
import './globals.css';
import { NavigationProvider } from '@/lib/navigation';
import { Plus_Jakarta_Sans } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

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
      <body className={`h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased ${plusJakartaSans.className}`}>
        <NavigationProvider>
          {children}
        </NavigationProvider>
      </body>
    </html>
  );
}
