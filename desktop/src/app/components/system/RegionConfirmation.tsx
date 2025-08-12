"use client";

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MapPin, Globe, Info } from 'lucide-react';
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { Alert, AlertDescription } from "@/ui/alert";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "RegionConfirmation" });

interface RegionConfirmationProps {
  onRegionConfirmed: (region: 'eu' | 'us') => void;
  detectedRegion?: 'eu' | 'us' | null;
}

export function RegionConfirmation({ onRegionConfirmed, detectedRegion }: RegionConfirmationProps) {
  const [selectedRegion, setSelectedRegion] = useState<'eu' | 'us' | ''>('');
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (detectedRegion) {
      setSelectedRegion(detectedRegion);
    }
  }, [detectedRegion]);

  const handleConfirm = async () => {
    if (!selectedRegion) return;

    setIsConfirming(true);
    try {
      // Store the confirmed region
      await invoke('set_key_value_command', {
        key: 'user_legal_region',
        value: selectedRegion
      });
      
      logger.info('User confirmed region:', selectedRegion);
      onRegionConfirmed(selectedRegion as 'eu' | 'us');
    } catch (error) {
      logger.error('Failed to save region:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md animate-in fade-in-0 duration-300">
      <div className="w-full max-w-md mx-4">
        <Card className="!bg-background shadow-soft-md border-2 border-primary/30 dark:border-primary/40 animate-in zoom-in-96 slide-in-from-bottom-2 duration-300">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <Globe className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-2xl">Select Your Region</CardTitle>
            <CardDescription>
              Please select your region for legal compliance. This determines which privacy laws and terms apply to you.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Region selector using toggle style like ModelSelectorToggle */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground mb-3">Select your region:</div>
              <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSelectedRegion('us')}
                  className={`
                    flex-1 h-12 px-4 text-sm border-0 rounded-none transition-all duration-200 backdrop-blur-sm
                    ${selectedRegion === 'us' 
                      ? "bg-primary/10 hover:bg-primary/15 text-primary font-medium" 
                      : "hover:bg-accent/30 text-muted-foreground hover:text-accent-foreground"
                    }
                    cursor-pointer
                  `}
                >
                  <div className="flex flex-col items-center">
                    <div className="font-medium">United States</div>
                    <div className="text-xs opacity-70">US Privacy Laws</div>
                  </div>
                </button>
                
                <div className="w-[1px] h-10 bg-border/40" />
                
                <button
                  type="button"
                  onClick={() => setSelectedRegion('eu')}
                  className={`
                    flex-1 h-12 px-4 text-sm border-0 rounded-none transition-all duration-200 backdrop-blur-sm
                    ${selectedRegion === 'eu' 
                      ? "bg-primary/10 hover:bg-primary/15 text-primary font-medium" 
                      : "hover:bg-accent/30 text-muted-foreground hover:text-accent-foreground"
                    }
                    cursor-pointer
                  `}
                >
                  <div className="flex flex-col items-center">
                    <div className="font-medium">EU / EEA / UK</div>
                    <div className="text-xs opacity-70">GDPR Compliance</div>
                  </div>
                </button>
              </div>
            </div>

            {detectedRegion && (
              <Alert className="bg-info-background border-info-border">
                <MapPin className="h-4 w-4 text-info" />
                <AlertDescription className="text-info-foreground">
                  We detected you might be in the {detectedRegion === 'eu' ? 'European' : 'United States'} region based on your settings.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Your selection determines which legal documents apply to your account. You can change this later in Settings.
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleConfirm}
              disabled={!selectedRegion || isConfirming}
              isLoading={isConfirming}
              className="w-full"
              size="lg"
            >
              Confirm Region
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}