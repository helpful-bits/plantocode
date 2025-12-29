'use client';

import Script from 'next/script';
import { useCookieConsent } from './CookieConsent';

/**
 * Datafast Analytics - GDPR Compliant
 *
 * Loads Datafast ONLY after user consent is given.
 * While Datafast is cookieless, we gate it for consistent GDPR compliance.
 */

interface DatafastAnalyticsProps {
  websiteId: string;
  domain?: string;
}

export function DatafastAnalytics({ websiteId, domain = 'www.plantocode.com' }: DatafastAnalyticsProps) {
  const hasConsent = useCookieConsent();

  if (!websiteId || websiteId === 'your_datafast_website_id') {
    return null;
  }

  // Only load if user has given consent
  if (!hasConsent) {
    return null;
  }

  return (
    <Script
      defer
      src="https://datafa.st/js/script.js"
      data-website-id={websiteId}
      data-domain={domain}
      strategy="afterInteractive"
    />
  );
}
