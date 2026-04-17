'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` only after the component mounts on the client.
 * Use this to suppress SSR/client hydration mismatches in components
 * that depend on browser-only state (wallet, localStorage, window).
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
