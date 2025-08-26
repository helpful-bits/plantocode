'use client';

import React from 'react';
import Script from 'next/script';
import { useConsent } from '@/components/providers/ConsentProvider';

export function ConditionalAnalytics() {
  const { consent } = useConsent();

  // Check for Google Analytics measurement ID
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // Only inject GA if BOTH conditions are true:
  // 1. GA measurement ID exists in env
  // 2. consent.analytics === true (user explicitly consented to analytics)
  const shouldLoadAnalytics = gaMeasurementId && consent.analytics === true;

  if (!shouldLoadAnalytics) {
    return null;
  }

  return (
    <>
      {/* Google Analytics - Using proxied endpoint */}
      <Script
        src={`/ga/gtag.js?id=${gaMeasurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaMeasurementId}', {
            page_title: document.title,
            page_location: window.location.href,
          });
        `}
      </Script>
    </>
  );
}