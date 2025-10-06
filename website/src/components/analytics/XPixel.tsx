'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useCookieConsent } from './CookieConsent';

/**
 * X (Twitter) Pixel Client-Side Tracking - GDPR Compliant
 *
 * This loads the X pixel ONLY after user consent is given.
 * Blocks until user accepts cookies via the consent banner.
 *
 * Privacy: X Pixel uses cookies (personalization_id) for ad attribution.
 * This implementation is GDPR-compliant by requiring explicit consent.
 */

interface XPixelProps {
  pixelId: string;
}

// Declare global twq function
declare global {
  interface Window {
    twq?: {
      (command: 'config' | 'event' | 'track', ...args: any[]): void;
      version?: string;
      queue?: any[];
      exe?: (...args: any[]) => void;
    };
  }
}

export function XPixel({ pixelId }: XPixelProps) {
  const hasConsent = useCookieConsent();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only load if consent given and not already initialized
    if (hasConsent && !isInitialized && typeof window !== 'undefined' && window.twq && pixelId) {
      window.twq('config', pixelId);
      setIsInitialized(true);
      console.log('X Pixel initialized after consent');
    }
  }, [hasConsent, pixelId, isInitialized]);

  if (!pixelId || pixelId === 'your_pixel_id_here') {
    console.debug('X Pixel not configured - skipping');
    return null;
  }

  // Only load script if user has given consent
  if (!hasConsent) {
    return null;
  }

  return (
    <>
      {/* X Pixel Base Code - Loaded ONLY after consent */}
      <Script
        id="x-pixel-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
          `.trim(),
        }}
      />
    </>
  );
}

/**
 * Track custom X Pixel events from client-side
 *
 * @param eventId - Event ID from X Ads Manager (e.g., 'tw-pixelid-eventid')
 * @param params - Optional event parameters
 */
export function trackXEvent(
  eventId: string,
  params?: {
    value?: number;
    currency?: string;
    conversion_id?: string;
    email?: string;
    phone_number?: string;
    [key: string]: any;
  }
) {
  if (typeof window !== 'undefined' && window.twq) {
    try {
      if (params) {
        window.twq('event', eventId, params);
      } else {
        window.twq('event', eventId);
      }
    } catch (error) {
      console.error('X Pixel tracking error:', error);
    }
  } else {
    console.debug('X Pixel not loaded yet');
  }
}