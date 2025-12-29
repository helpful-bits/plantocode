'use client';

import Script from 'next/script';
import { useCookieConsent } from './CookieConsent';

/**
 * Google Analytics 4 - GDPR Compliant
 *
 * Loads GA4 ONLY after user consent is given.
 * GA4 uses cookies for tracking, so explicit consent is required.
 */

interface GoogleAnalyticsProps {
  measurementId: string;
  locale?: string;
}

export function GoogleAnalytics({ measurementId, locale }: GoogleAnalyticsProps) {
  const hasConsent = useCookieConsent();

  if (!measurementId || measurementId === 'your_ga_measurement_id') {
    return null;
  }

  // Only load if user has given consent
  if (!hasConsent) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              page_path: window.location.pathname,
              send_page_view: false
            });
            ${locale ? `gtag('set', {'language': '${locale}'});` : ''}
          `
        }}
      />
    </>
  );
}
