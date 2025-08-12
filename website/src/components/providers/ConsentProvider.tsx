'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
                <button
                  onClick={() => {
                    updateConsent({ analytics: false, functional: false, marketing: false });
                    closePreferences();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Reject All
                </button>
                <button
                  onClick={() => {
                    updateConsent({ analytics: true, functional: true, marketing: true });
                    closePreferences();
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Accept All
                </button>
              </div>
              <div className="pt-2">
                <button
                  onClick={closePreferences}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Save Settings
                </button>
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