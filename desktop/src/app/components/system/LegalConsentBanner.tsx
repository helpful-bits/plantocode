"use client";

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { AlertCircle, CheckCircle2, ExternalLink, Shield, ArrowRight } from 'lucide-react';
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Card, CardContent } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { createLogger } from "@/utils/logger";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError, ErrorType } from "@/utils/error-handling";
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


  const verifyConsent = useCallback(async (retryCount = 0) => {
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
      
      // Check if it's a configuration error (includes initialization errors) and retry up to 3 times with delay
      if (errorInfo.type === ErrorType.CONFIGURATION_ERROR && retryCount < 3) {
        console.log(`Consent client not ready, retrying in ${(retryCount + 1) * 1000}ms...`);
        setTimeout(() => {
          verifyConsent(retryCount + 1);
        }, (retryCount + 1) * 1000);
        return;
      }
      
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "consent verification");
      
      setHasError(true);
      setErrorMessage(userMessage);
      await logError(error, "LegalConsentBanner.verifyConsent");
    }
  }, []);

  useEffect(() => {
    // Add a small delay on initial load to allow database initialization
    const timer = setTimeout(() => {
      void verifyConsent();
    }, 500);
    
    return () => clearTimeout(timer);
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
  const handleRegionConfirmed = useCallback(async () => {
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
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto !p-0" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <div className="p-6">
          {hasError ? (
            <div className="text-center">
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-destructive/10 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-destructive" />
                </div>
                <DialogHeader>
                  <DialogTitle className="text-center text-2xl">Connection Error</DialogTitle>
                  <DialogDescription className="text-center">
                    Unable to verify legal consent status. Please check your connection and try again.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <Button
                onClick={handleRetry}
                isLoading={isRetrying}
                disabled={isRetrying}
                variant="default"
                size="lg"
                className="w-full"
              >
                {isRetrying ? 'Retrying...' : 'Retry'}
              </Button>
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <Shield className="w-10 h-10 text-primary" />
                </div>
                <DialogHeader>
                  <DialogTitle className="text-center text-2xl">Legal Consent Required</DialogTitle>
                  <DialogDescription className="text-center">
                    You must review and accept our updated legal documents to continue using Vibe Manager.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="space-y-4 mb-8">
                {verification?.missing?.map((docType) => (
                  <Card key={docType} className="rounded-xl border border-border/60 bg-card hover:shadow-soft-md transition-all duration-300">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground">
                          {formatDocumentType(docType)}
                        </h3>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(docType)}
                          >
                            <ExternalLink className="h-4 w-4 mr-1.5" />
                            View
                          </Button>
                          <Button
                            variant={acceptedDocuments.has(docType) ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => handleAcceptDocument(docType)}
                            disabled={acceptedDocuments.has(docType)}
                            aria-pressed={acceptedDocuments.has(docType)}
                          >
                            {acceptedDocuments.has(docType) ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                Accepted
                              </>
                            ) : (
                              'Accept'
                            )}
                          </Button>
                        </div>
                      </div>
                      {acceptedDocuments.has(docType) && (
                        <Alert className="bg-success/10 border-success/20">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <AlertDescription>
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
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleAcceptAll}
                    disabled={canContinue}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Accept All
                  </Button>
                  <Button
                    variant="default"
                    size="lg"
                    onClick={handleContinue}
                    disabled={!canContinue || isAccepting}
                    isLoading={isAccepting}
                    loadingText="Processing..."
                    aria-describedby="continue-help"
                  >
                    Continue to App
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {!canContinue && (
                  <p id="continue-help" className="text-xs text-muted-foreground text-center mt-3 animate-in fade-in-0 duration-300">
                    Please accept all required documents to continue
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}