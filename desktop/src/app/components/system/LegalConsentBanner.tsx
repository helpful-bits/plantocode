"use client";

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { AlertCircle, CheckCircle2, ExternalLink, Shield } from 'lucide-react';
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { createLogger } from "@/utils/logger";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";
import { RegionConfirmation } from "./RegionConfirmation";
import type { ConsentVerificationResponse } from "@/types/tauri-commands";

const logger = createLogger({ namespace: "LegalConsentBanner" });

export function LegalConsentBanner() {
  const [verification, setVerification] = useState<ConsentVerificationResponse | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedDocuments, setAcceptedDocuments] = useState<Set<string>>(new Set());
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [needsRegionConfirmation, setNeedsRegionConfirmation] = useState(false);
  const [detectedRegion, setDetectedRegion] = useState<'eu' | 'us' | null>(null);
  const { showNotification } = useNotification();

  // Get user region with robust detection using IP geolocation
  const getUserRegion = async (): Promise<string> => {
    try {
      // First check if user has explicitly confirmed their region
      const storedRegion = await invoke<string | null>('get_key_value_command', { key: 'user_legal_region' });
      if (storedRegion) {
        logger.info('Using confirmed legal region:', storedRegion);
        return storedRegion;
      }

      // Try to detect region via IP geolocation using Tauri command
      try {
        const geoResponse = await invoke<{ country: string; region: string }>('detect_user_region_command');
        
        if (geoResponse.country && geoResponse.country !== 'XX') {
          logger.info('Detected country via IP:', geoResponse.country);
          logger.info('Mapped to region:', geoResponse.region);
          
          setDetectedRegion(geoResponse.region as 'us' | 'eu');
          
          // Only auto-accept if high confidence
          if (!needsRegionConfirmation) {
            await invoke('set_key_value_command', {
              key: 'user_legal_region',
              value: geoResponse.region
            });
            return geoResponse.region;
          }
        } else {
          // Could not detect, need user confirmation
          logger.info('Could not detect country, will ask user');
          setNeedsRegionConfirmation(true);
        }
      } catch (geoError) {
        logger.warn('Could not detect region via Tauri command:', geoError);
        setNeedsRegionConfirmation(true);
      }

      // Fallback: Try to detect from server URL
      const serverUrl = await invoke<string | null>('get_key_value_command', { key: 'selected_server_url' });
      if (serverUrl) {
        if (serverUrl.includes('api.eu.') || serverUrl.includes('eu-')) {
          logger.info('Inferred EU region from server URL:', serverUrl);
          return 'eu';
        } else if (serverUrl.includes('api.us.') || serverUrl.includes('us-')) {
          logger.info('Inferred US region from server URL:', serverUrl);
          return 'us';
        }
      }

      // Default to EU (more restrictive for legal compliance)
      logger.warn('Could not determine region, defaulting to EU for compliance');
      return 'eu';
    } catch (error) {
      logger.error('Failed to get user region, defaulting to EU:', error);
      return 'eu';
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

  const handleViewDocument = async (documentType: string) => {
    try {
      const userRegion = await getUserRegion();
      
      // Map document type and region to the correct URL
      const baseUrl = 'https://vibemanager.app/legal';
      const regionPath = userRegion.toLowerCase(); // 'us' or 'eu'
      const docPath = documentType === 'privacy' ? 'privacy' : 'terms';
      const documentUrl = `${baseUrl}/${regionPath}/${docPath}`;
      
      // Open the document in the default browser
      await open(documentUrl);
      
      logger.info('Opened document URL:', documentUrl);
    } catch (error) {
      logger.error('Failed to open document:', error);
      showNotification({
        title: "Error",
        message: "Failed to open the document. Please try again.",
        type: "error"
      });
    }
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

  // Handle region confirmation
  const handleRegionConfirmed = useCallback(async (region: 'eu' | 'us') => {
    setNeedsRegionConfirmation(false);
    await verifyConsent();
  }, [verifyConsent]);

  // Show region confirmation first if needed
  if (needsRegionConfirmation && !verification?.requiresReconsent) {
    return (
      <RegionConfirmation 
        onRegionConfirmed={handleRegionConfirmed}
        detectedRegion={detectedRegion}
      />
    );
  }

  if (!verification?.requiresReconsent && !hasError) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in-0 duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-consent-title"
      aria-describedby="legal-consent-description"
    >
      <div className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <Card className="!bg-background shadow-soft-md border-2 border-primary/30 dark:border-primary/40 animate-in zoom-in-96 slide-in-from-bottom-2 duration-300">
          <CardContent className="modal-padding">
            {hasError ? (
              <div className="text-center">
                <div className="mb-6">
                  <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                  <h2 id="legal-consent-title" className="text-2xl font-bold text-foreground">
                    Connection Error
                  </h2>
                </div>
                <p id="legal-consent-description" className="text-muted-foreground mb-6">
                  Unable to verify legal consent status. Please check your connection and try again.
                </p>
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
                <Button
                  onClick={handleRetry}
                  isLoading={isRetrying}
                  disabled={isRetrying}
                  variant="default"
                  size="lg"
                >
                  {isRetrying ? 'Retrying...' : 'Retry'}
                </Button>
              </div>
            ) : (
              <div>
                <div className="text-center mb-8">
                  <Shield className="w-16 h-16 text-primary mx-auto mb-4" />
                  <h2 id="legal-consent-title" className="text-2xl font-bold text-foreground mb-2">
                    Legal Consent Required
                  </h2>
                  <p id="legal-consent-description" className="text-muted-foreground">
                    You must review and accept our updated legal documents to continue using Vibe Manager.
                  </p>
                </div>

                <div className="space-y-4 mb-8">
                  {verification?.missing?.map((docType) => (
                    <Card key={docType} className="bg-card/50 border border-primary/20 dark:border-primary/30 hover:border-primary/40 dark:hover:border-primary/50 transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-foreground">
                            {formatDocumentType(docType)}
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDocument(docType)}
                              className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer backdrop-blur-sm rounded-md h-8 px-3 text-sm text-muted-foreground hover:text-primary border border-transparent hover:bg-accent/30 transition-all duration-200"
                            >
                              <ExternalLink className="h-4 w-4 mr-1.5" />
                              View
                            </button>
                            <button
                              onClick={() => handleAcceptDocument(docType)}
                              disabled={acceptedDocuments.has(docType)}
                              aria-pressed={acceptedDocuments.has(docType)}
                              className={`inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer backdrop-blur-sm rounded-md h-8 px-3 text-sm transition-all duration-200 ${
                                acceptedDocuments.has(docType)
                                  ? "bg-primary/10 text-primary border border-primary/40 dark:border-primary/50"
                                  : "hover:bg-primary/10 text-muted-foreground hover:text-primary border border-dashed border-primary/30 hover:border-primary/60 dark:border-primary/40 dark:hover:border-primary/70"
                              }`}
                            >
                              {acceptedDocuments.has(docType) ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                  Accepted
                                </>
                              ) : (
                                'Accept'
                              )}
                            </button>
                          </div>
                        </div>
                        {acceptedDocuments.has(docType) && (
                          <Alert className="bg-success-background border-success-border">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                            <AlertDescription className="text-success-foreground">
                              You have accepted this document
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="border-t border-border pt-6">
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={handleAcceptAll}
                      disabled={canContinue}
                      className={`inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer backdrop-blur-sm rounded-lg h-11 px-6 text-sm transition-all duration-200 ${
                        canContinue 
                          ? "bg-muted/30 text-muted-foreground border border-border cursor-not-allowed"
                          : "bg-primary/10 hover:bg-primary/20 text-primary border border-dashed border-primary/30 hover:border-primary/50 hover:shadow-md"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Accept All
                    </button>
                    <button
                      onClick={handleContinue}
                      disabled={!canContinue || isAccepting}
                      aria-describedby="continue-help"
                      className={`inline-flex items-center justify-center whitespace-nowrap font-semibold ring-offset-background focus-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer backdrop-blur-sm rounded-lg h-11 px-8 text-sm transition-all duration-200 ${
                        canContinue 
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                          : "bg-muted/50 text-muted-foreground border border-border cursor-not-allowed"
                      }`}
                    >
                      {isAccepting ? (
                        <>
                          <svg
                            className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-current"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>
                          Continue to App
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 h-4 w-4">
                            <path d="M5 12h14"/>
                            <path d="m12 5 7 7-7 7"/>
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                  {!canContinue && (
                    <p id="continue-help" className="text-xs text-muted-foreground text-center mt-3 animate-in fade-in-0 duration-300">
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