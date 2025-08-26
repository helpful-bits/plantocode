'use client';

import { useEffect } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    twq: {
      (action: string, ...args: any[]): void;
      exe?: (...args: any[]) => void;
      queue?: any[];
      version?: string;
      loaded?: boolean;
    };
  }
}

export function XPixel() {
  const pixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;

  useEffect(() => {
    if (!pixelId) return;

    // Initialize stub function for queueing events before script loads
    window.twq = function() {
      (window.twq.queue = window.twq.queue || []).push(arguments);
    };
    window.twq.version = '1.1';
    window.twq.queue = [];
  }, [pixelId]);

  if (!pixelId) {
    return null; // Don't render anything if no pixel ID
  }

  return (
    <>
      <Script
        id="x-pixel"
        strategy="lazyOnload"
        src="/x/pixel.js" // Use our proxied endpoint instead
        onLoad={() => {
          if (window.twq) {
            try {
              window.twq('config', pixelId);
            } catch (e) {
              console.error('X pixel config error:', e);
            }
          }
        }}
        onError={() => {
          console.log('X pixel failed to load');
          window.twq = () => {}; // Replace with no-op
        }}
      />
    </>
  );
}