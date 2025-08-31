'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface ConsentState {
  necessary: boolean;
  analytics: boolean | null;
  functional: boolean | null;
  marketing: boolean | null;
}

interface ConsentContextType {
  consent: ConsentState;
  setConsent: (consent: ConsentState) => void;
  openPreferences: () => void;
  hasConsent: boolean;
  updateConsent: (partial: Partial<Omit<ConsentState, 'necessary'>>) => void;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

const CONSENT_STORAGE_KEY = 'cookie-consent';

interface ConsentProviderProps {
  children: ReactNode;
}

export function ConsentProvider({ children }: ConsentProviderProps) {
  const [consent, setConsentState] = useState<ConsentState>({
    necessary: true,
    analytics: null,
    functional: null,
    marketing: null,
  });

  const [isHydrated, setIsHydrated] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // Hydrate from localStorage on mount and honor Global Privacy Control
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedConsent = localStorage.getItem(CONSENT_STORAGE_KEY);
        
        if (storedConsent) {
          const parsedConsent = JSON.parse(storedConsent);
          
          // Migration: Handle old format with only analytics property
          if (parsedConsent && typeof parsedConsent.analytics === 'boolean' && 
              parsedConsent.necessary === undefined) {
            // Old format detected, migrate to new format
            const migratedConsent: ConsentState = {
              necessary: true,
              analytics: parsedConsent.analytics,
              functional: parsedConsent.analytics, // Assume same choice as analytics
              marketing: parsedConsent.analytics,  // Assume same choice as analytics
            };
            setConsentState(migratedConsent);
            localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(migratedConsent));
          } else {
            // Already in new format or malformed, ensure all required fields exist
            const validatedConsent: ConsentState = {
              necessary: true, // Always true
              analytics: parsedConsent.analytics ?? null,
              functional: parsedConsent.functional ?? null,
              marketing: parsedConsent.marketing ?? null,
            };
            setConsentState(validatedConsent);
            
            // Update storage if validation changed anything
            const currentStored = JSON.stringify(parsedConsent);
            const validatedStored = JSON.stringify(validatedConsent);
            if (currentStored !== validatedStored) {
              localStorage.setItem(CONSENT_STORAGE_KEY, validatedStored);
            }
          }
        } else {
          // Check for Global Privacy Control signal
          const gpcOn = typeof navigator !== 'undefined' && (navigator as any).globalPrivacyControl === true;
          
          if (gpcOn) {
            // Honor GPC by defaulting to reject optional categories
            const rejectedConsent = {
              necessary: true,
              analytics: false,
              functional: false,
              marketing: false,
            };
            setConsentState(rejectedConsent);
            localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(rejectedConsent));
            
            // Log for transparency
            console.info('Global Privacy Control detected: optional cookie categories automatically rejected');
          }
        }
      } catch (error) {
        console.error('Error loading consent from localStorage:', error);
      }
      setIsHydrated(true);
    }
  }, []);

  const setConsent = (newConsent: ConsentState) => {
    setConsentState(newConsent);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(newConsent));
        
        // Update Google Analytics consent mode
        if ((window as any).gtag) {
          (window as any).gtag('consent', 'update', {
            'analytics_storage': newConsent.analytics ? 'granted' : 'denied',
            'ad_storage': newConsent.marketing ? 'granted' : 'denied',
            'ad_user_data': newConsent.marketing ? 'granted' : 'denied',
            'ad_personalization': newConsent.marketing ? 'granted' : 'denied',
            'functionality_storage': newConsent.functional ? 'granted' : 'denied',
            'security_storage': 'granted'
          });
        }
        
        // Fire server-side tracking event for consent choices
        const action = newConsent.analytics && newConsent.marketing ? 'accept_all' : 
                      !newConsent.analytics && !newConsent.marketing ? 'reject_all' : 
                      'custom';
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'Cookie Consent',
            props: { action }
          }),
        }).catch(() => {});
      } catch (error) {
        console.error('Error saving consent to localStorage:', error);
      }
    }
  };

  const openPreferences = () => {
    setShowPreferences(true);
  };

  const closePreferences = () => {
    setShowPreferences(false);
  };

  const hasConsent = consent.analytics !== null && consent.functional !== null && consent.marketing !== null;

  const updateConsent = (partial: Partial<Omit<ConsentState, 'necessary'>>) => {
    setConsent({
      necessary: true, // Always true
      analytics: partial.analytics ?? consent.analytics,
      functional: partial.functional ?? consent.functional,
      marketing: partial.marketing ?? consent.marketing,
    });
  };

  // Don't render children until hydrated to avoid SSR mismatches
  if (!isHydrated) {
    return null;
  }

  const contextValue: ConsentContextType = {
    consent,
    setConsent,
    openPreferences,
    hasConsent,
    updateConsent,
  };

  return (
    <ConsentContext.Provider value={contextValue}>
      {children}
      {showPreferences && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-lg mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Cookie Preferences</h3>
            <div className="space-y-6">
              <div className="space-y-4">
                {/* Necessary Cookies */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Necessary</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Essential for site operation (always enabled)
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="w-10 h-5 bg-blue-600 rounded-full relative">
                      <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                    </div>
                  </div>
                </div>
                
                {/* Analytics Cookies */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Analytics</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Help us understand how you use our service
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => updateConsent({ analytics: !consent.analytics })}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        consent.analytics
                          ? 'bg-blue-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                          consent.analytics ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                
                {/* Functional Cookies */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Functional</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Remember your preferences and settings
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => updateConsent({ functional: !consent.functional })}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        consent.functional
                          ? 'bg-blue-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                          consent.functional ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                
                {/* Marketing Cookies */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Marketing</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Show relevant ads and measure campaigns
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => updateConsent({ marketing: !consent.marketing })}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        consent.marketing
                          ? 'bg-blue-600'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                          consent.marketing ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  onClick={() => {
                    updateConsent({ analytics: false, functional: false, marketing: false });
                    closePreferences();
                  }}
                  variant="outline"
                  size="default"
                  className="flex-1"
                >
                  Reject All
                </Button>
                <Button
                  onClick={() => {
                    updateConsent({ analytics: true, functional: true, marketing: true });
                    closePreferences();
                  }}
                  variant="default"
                  size="default"
                  className="flex-1"
                >
                  Accept All
                </Button>
              </div>
              <div className="pt-2">
                <Button
                  onClick={closePreferences}
                  variant="ghost"
                  size="default"
                  className="w-full"
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextType {
  const context = useContext(ConsentContext);
  if (context === undefined) {
    throw new Error('useConsent must be used within a ConsentProvider');
  }
  return context;
}