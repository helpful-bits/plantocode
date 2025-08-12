'use client';

import React from 'react';
import { useConsent } from '@/components/providers/ConsentProvider';
import { Button } from '@/components/ui/button';
import { useUserRegion } from '@/hooks/useUserRegion';

export function CookieConsentBanner() {
  const { consent, setConsent, openPreferences } = useConsent();
  const { region } = useUserRegion();

  // Only show when any consent choice hasn't been made yet
  if (consent.analytics !== null && consent.functional !== null && consent.marketing !== null) {
    return null;
  }

  const handleAcceptAll = () => {
    setConsent({ 
      necessary: true, 
      analytics: true, 
      functional: true, 
      marketing: true 
    });
  };

  const handleRejectAll = () => {
    setConsent({ 
      necessary: true, 
      analytics: false, 
      functional: false, 
      marketing: false 
    });
  };

  const handleOpenPreferences = () => {
    openPreferences();
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg"
      role="banner"
      aria-label="Cookie consent banner"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We use cookies to enhance your experience. These include necessary cookies for site functionality, and optional cookies for analytics, personalization, and marketing. You can learn more in our{' '}
              <a
                href={region ? `/legal/${region}/privacy#cookies` : '/legal/us/privacy#cookies'}
                className="link-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 rounded"
              >
                privacy policy
              </a>
              .
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <Button
              onClick={handleRejectAll}
              variant="outline"
              size="sm"
              type="button"
            >
              Reject All
            </Button>
            <Button
              onClick={handleOpenPreferences}
              variant="outline"
              size="sm"
              type="button"
            >
              Preferences
            </Button>
            <Button
              onClick={handleAcceptAll}
              variant="default"
              size="sm"
              type="button"
            >
              Accept All
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}