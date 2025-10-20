'use client';

import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

/**
 * GDPR-Compliant Cookie Consent Banner
 *
 * Manages user consent for non-essential cookies (X/Twitter Pixel).
 * Styled to match the PlanToCode design system (OKLCH colors, glass effects).
 *
 * Cookie: plantocode_cookie_consent
 * Values: 'accepted' | 'rejected' | undefined
 * Expiry: 365 days
 */

const COOKIE_NAME = 'plantocode_cookie_consent';
const COOKIE_EXPIRY_DAYS = 365;

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = Cookies.get(COOKIE_NAME);

    if (!consent) {
      // Delay showing banner slightly for better UX
      setTimeout(() => {
        setShowBanner(true);
        // Trigger slide-up animation
        setTimeout(() => setIsVisible(true), 100);
      }, 1000);
    } else if (consent === 'accepted') {
      // Emit event that consent was already given
      window.dispatchEvent(new CustomEvent('cookie-consent-accepted'));
    }
  }, []);

  const handleAccept = () => {
    Cookies.set(COOKIE_NAME, 'accepted', { expires: COOKIE_EXPIRY_DAYS });
    setIsVisible(false);
    setTimeout(() => {
      setShowBanner(false);
      // Emit event so X Pixel can load
      window.dispatchEvent(new CustomEvent('cookie-consent-accepted'));
    }, 300);
  };

  const handleReject = () => {
    Cookies.set(COOKIE_NAME, 'rejected', { expires: COOKIE_EXPIRY_DAYS });
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  if (!showBanner) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-300 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Glass backdrop */}
      <div className="glass border-t border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Content */}
            <div className="flex-1 space-y-2">
              <h3 className="text-sm sm:text-base font-semibold text-foreground">
                🍪 We use cookies
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                We use cookies for advertising and analytics. By clicking "Accept", you consent to the use of cookies for X (Twitter) ad conversion tracking.{' '}
                <a
                  href="/privacy"
                  className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn more
                </a>
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleReject}
                className="flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium
                         bg-secondary text-secondary-foreground
                         hover:bg-secondary/80
                         transition-all duration-200
                         border border-border/50
                         focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Reject
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 rounded-lg text-sm font-medium
                         bg-primary text-primary-foreground
                         hover:bg-primary/90
                         transition-all duration-200
                         shadow-lg shadow-primary/25
                         focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check if cookie consent has been given
 */
export function useCookieConsent(): boolean {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // Check initial consent
    const consent = Cookies.get(COOKIE_NAME);
    setHasConsent(consent === 'accepted');

    // Listen for consent events
    const handleConsent = () => setHasConsent(true);
    window.addEventListener('cookie-consent-accepted', handleConsent);

    return () => {
      window.removeEventListener('cookie-consent-accepted', handleConsent);
    };
  }, []);

  return hasConsent;
}