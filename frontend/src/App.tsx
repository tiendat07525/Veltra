'use client';

import React from 'react';
import { NavigationProvider } from '@/lib/navigation';
import HomePage from '@/app/page';

export default function App() {
  return (
    <NavigationProvider>
      <HomePage />
    </NavigationProvider>
  );
}
