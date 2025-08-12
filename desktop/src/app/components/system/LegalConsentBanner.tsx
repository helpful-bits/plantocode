"use client";

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { createLogger } from "@/utils/logger";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import type { ConsentVerificationResponse } from "@/types/tauri-commands";

const logger = createLogger({ namespace: "LegalConsentBanner" });

export function LegalConsentBanner() {
  const [verification, setVerification] = useState<ConsentVerificationResponse | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedDocuments, setAcceptedDocuments] = useState<Set<string>>(new Set());
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);
  const { showNotification } = useNotification();

  // Get user region from settings or default to 'us'
  const getUserRegion = async (): Promise<string> => {
    try {
      // Try to get region from key-value store or other settings
      const region = await invoke<string | null>('get_key_value_command', { key: 'user_region' });
      return region || 'us';
    } catch (error) {
      logger.warn('Failed to get user region, defaulting to US:', error);
      return 'us';
    }
  };

  const verifyConsent = useCallback(async () => {
    try {
      setHasError(false);
      setErrorMessage('');
      
      const userRegion = await getUserRegion();
      
      const result = await invoke<ConsentVerificationResponse>('verify_consent_command', {
        region: userRegion
      });

      setVerification(result);
    } catch (error) {
      const errorInfo = extractErrorInfo(error);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "consent verification");
      
      setHasError(true);
      setErrorMessage(userMessage);
      await logError(error, "LegalConsentBanner.verifyConsent");
    }
  }, []);

  useEffect(() => {
    void verifyConsent();
  }, [verifyConsent]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await verifyConsent();
    setIsRetrying(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && verification?.requiresReconsent) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    if (verification?.requiresReconsent) {
      document.addEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = 'auto';
    };
  }, [verification?.requiresReconsent]);

  const handleAcceptDocument = (documentType: string) => {
    setAcceptedDocuments(prev => new Set([...prev, documentType]));
  };

  const handleAcceptAll = () => {
    if (!verification?.missing) return;
    setAcceptedDocuments(new Set(verification.missing));
  };

  const handleViewDocument = (documentType: string) => {
    // TODO: Implement document viewing functionality
    logger.info('View document:', documentType);
  };

  const handleContinue = async () => {
    if (!verification || !canContinue) return;

    setIsAccepting(true);
    
    try {
      const userRegion = await getUserRegion();
      
      for (const docType of acceptedDocuments) {
        await invoke('accept_consent_command', {
          docType: docType as 'terms' | 'privacy',
          region: userRegion as 'eu' | 'us'
        });
      }

      await verifyConsent();

      showNotification({
        title: "Consent Updated",
        message: "Your legal consent preferences have been updated successfully.",
        type: "success"
      });
    } catch (error) {
      const errorInfo = extractErrorInfo(error);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "consent acceptance");
      
      setHasError(true);
      setErrorMessage(userMessage);
      await logError(error, "LegalConsentBanner.handleContinue");
    } finally {
      setIsAccepting(false);
    }
  };

  const canContinue = verification?.missing?.every(doc => acceptedDocuments.has(doc)) ?? false;

  const formatDocumentType = (type: string): string => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (!verification?.requiresReconsent && !hasError) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-consent-title"
      aria-describedby="legal-consent-description"
    >
      <div className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <Card className="bg-white dark:bg-gray-900 shadow-2xl border-2 border-red-200 dark:border-red-800">
          <CardContent className="p-8">
            {hasError ? (
              <div className="text-center">
                <div className="mb-6">
                  <svg 
                    className="w-16 h-16 text-red-500 mx-auto mb-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={1.5} 
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" 
                    />
                  </svg>
                  <h2 id="legal-consent-title" className="text-2xl font-bold text-red-700 dark:text-red-400">
                    Connection Error
                  </h2>
                </div>
                <p id="legal-consent-description" className="text-gray-700 dark:text-gray-300 mb-6">
                  Unable to verify legal consent status. Please check your connection and try again.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 bg-red-50 dark:bg-red-950/30 p-3 rounded">
                  {errorMessage}
                </p>
                <Button
                  onClick={handleRetry}
                  isLoading={isRetrying}
                  disabled={isRetrying}
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-3"
                >
                  {isRetrying ? 'Retrying...' : 'Retry'}
                </Button>
              </div>
            ) : (
              <div>
                <div className="text-center mb-8">
                  <svg 
                    className="w-16 h-16 text-red-500 mx-auto mb-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={1.5} 
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                    />
                  </svg>
                  <h2 id="legal-consent-title" className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Legal Consent Required
                  </h2>
                  <p id="legal-consent-description" className="text-gray-600 dark:text-gray-400">
                    You must review and accept our updated legal documents to continue using Vibe Manager.
                  </p>
                </div>

                <div className="space-y-4 mb-8">
                  {verification?.missing?.map((docType) => (
                    <div key={docType} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {formatDocumentType(docType)}
                        </h3>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(docType)}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/20"
                          >
                            View
                          </Button>
                          <Button
                            variant={acceptedDocuments.has(docType) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleAcceptDocument(docType)}
                            disabled={acceptedDocuments.has(docType)}
                            className={acceptedDocuments.has(docType) 
                              ? "bg-green-600 hover:bg-green-700 text-white" 
                              : "text-green-600 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
                            }
                            aria-pressed={acceptedDocuments.has(docType)}
                          >
                            {acceptedDocuments.has(docType) ? (
                              <>
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Accepted
                              </>
                            ) : (
                              'Accept'
                            )}
                          </Button>
                        </div>
                      </div>
                      {acceptedDocuments.has(docType) && (
                        <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                          ✓ You have accepted this document
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={handleAcceptAll}
                      variant="outline"
                      disabled={canContinue}
                      className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/20"
                    >
                      Accept All
                    </Button>
                    <Button
                      onClick={handleContinue}
                      disabled={!canContinue}
                      isLoading={isAccepting}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-8 py-3 font-semibold"
                      aria-describedby="continue-help"
                    >
                      Continue to App
                    </Button>
                  </div>
                  {!canContinue && (
                    <p id="continue-help" className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                      Please accept all required documents to continue
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}