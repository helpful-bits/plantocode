'use client';

import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { MinusCircle, Eye, Settings, XCircle } from 'lucide-react';
import { H1, P, Subtle } from '@/ui/typography';

interface TrayExplanationStepProps {
  onContinue: () => void;
}

export function TrayExplanationStep({ onContinue }: TrayExplanationStepProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-muted px-4">
      <Card className="w-full max-w-lg p-8 bg-card/95 backdrop-blur-sm shadow-lg border-border/30 rounded-xl">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <MinusCircle className="w-10 h-10 text-primary" />
            </div>
            <H1 className="text-center text-foreground text-2xl font-semibold">
              Background Operation & System Tray
            </H1>
            <P className="text-muted-foreground text-center text-sm leading-relaxed">
              PlanToCode can run in the background to maintain connectivity with your mobile devices.
              When you close the window, the app stays running in your system tray.
            </P>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <Eye className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <P className="font-medium text-foreground">
                    Show/Hide Window
                  </P>
                  <Subtle className="text-muted-foreground">
                    Click the tray icon to show or hide the main window anytime
                  </Subtle>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Settings className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <P className="font-medium text-foreground">
                    Quick Settings Access
                  </P>
                  <Subtle className="text-muted-foreground">
                    Access Settings directly from the tray menu
                  </Subtle>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <XCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <P className="font-medium text-foreground">
                    Quit When Needed
                  </P>
                  <Subtle className="text-muted-foreground">
                    Use the tray icon to fully quit the app when you're done
                  </Subtle>
                </div>
              </div>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <Subtle className="text-primary text-xs">
                <strong>Tip:</strong> You can change this behavior anytime in Settings → Background & Tray.
              </Subtle>
            </div>
          </div>

          <Button onClick={onContinue} className="w-full h-11">
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
