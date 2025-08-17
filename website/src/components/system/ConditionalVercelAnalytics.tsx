'use client';

import React from 'react';
import { Analytics } from '@vercel/analytics/next';
import { useConsent } from '@/components/providers/ConsentProvider';

export function ConditionalVercelAnalytics() {
  const { consent } = useConsent();

  // Always render Analytics component to maintain consistent hook calls,
  // but disable tracking when user hasn't consented
  // Vercel Analytics respects the 'beforeSend' callback to filter events
  return (
    <Analytics 
      beforeSend={(event) => {
        // Only send analytics events if user has explicitly consented
        if (consent.analytics === true) {
          return event;
        }
        // Return null to prevent the event from being sent
        return null;
      }}
    />
  );
}