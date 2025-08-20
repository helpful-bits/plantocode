// Step 2: Session Manager Mock
'use client';

import { DesktopInput } from '../desktop-ui/DesktopInput';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { Search, RefreshCw, PlusCircle, Save, Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface SessionManagerMockProps {
  isInView: boolean;
  progress: number;
}

export function SessionManagerMock({ isInView, progress }: SessionManagerMockProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const newSessionName = "Feature Discovery Session";

  // Progress-driven state calculation
  const step = (() => {
    if (!isInView) return 0;
    if (progress < 0.1) return 0; // initial
    if (progress < 0.15) return 1; // new clicked
    if (progress < 0.25) return 2; // form shown
    if (progress < 0.6) return 3; // typing
    if (progress < 0.7) return 4; // save clicked
    return 5; // session saved
  })();
  
  // Progress-driven button press windows
  const newButtonPressed = step === 1;
  const saveButtonPressed = step === 4;
  
  // Progress-driven typing for deterministic output
  const typedText = (() => {
    if (step < 3) return "";
    if (step === 3) {
      // During typing phase, calculate how much to show based on local progress within the phase
      const typingPhaseStart = 0.25;
      const typingPhaseEnd = 0.6;
      const localProgress = Math.max(0, (progress - typingPhaseStart) / (typingPhaseEnd - typingPhaseStart));
      const targetLength = Math.floor(localProgress * newSessionName.length);
      return newSessionName.slice(0, targetLength);
    }
    return newSessionName; // Complete text for steps 4 and 5
  })();

  const existingSessions = [
    { 
      id: "1", 
      name: "Bug Investigation", 
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      isActive: false 
    },
    { 
      id: "2", 
      name: "UI Component Review", 
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      isActive: false 
    },
  ];

  // Show new session in list after it's saved
  const allSessions = step >= 5 ? [
    {
      id: "new",
      name: newSessionName,
      updatedAt: new Date().toISOString(),
      isActive: true
    },
    ...existingSessions.map(s => ({ ...s, isActive: false })) // Make others inactive
  ] : existingSessions;

  return (
    <div className="w-full border border-border rounded-xl shadow-soft bg-card/95 backdrop-blur-sm">
      <div className="p-3 bg-muted/80 backdrop-blur-sm border-b border-border rounded-t-xl">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-foreground">Sessions</h3>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <DesktopInput
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={setSearchQuery}
                className="pl-7 h-7 w-full sm:w-32 text-xs"
              />
            </div>
            <DesktopButton
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2 text-foreground"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Refresh</span>
            </DesktopButton>
            <DesktopButton
              size="sm"
              variant="outline"
              className={`text-xs h-7 px-2 text-foreground transition-transform duration-200 ${newButtonPressed ? 'scale-95 bg-primary/80' : ''}`}
            >
              <PlusCircle className="h-3 w-3 mr-1" />
              New
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Collapsible New Session Form */}
      {step >= 2 && step < 5 && (
        <div className="border-b border-border">
          <div className="p-3">
            <div className="flex items-center gap-2">
              <div className="relative grow">
                <DesktopInput
                  value={typedText}
                  placeholder="New session name..."
                  className="w-full h-8 sm:h-9 text-sm"
                />
              </div>
              <DesktopButton
                className={`h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm transition-transform duration-200 ${saveButtonPressed ? 'scale-95 bg-primary/80' : ''}`}
                disabled={step < 4}
              >
                <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                Save
              </DesktopButton>
            </div>
          </div>
        </div>
      )}

      {/* Session List */}
      <div className="max-h-[200px] overflow-y-auto">
        {allSessions.map((session) => (
          <div
            key={session.id}
            className={`flex items-center justify-between p-2 border-b border-border/60 last:border-b-0 transition-all duration-200 cursor-pointer ${
              session.isActive ? "bg-accent" : "hover:bg-muted/80"
            }`}
          >
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center">
                <span className="text-xs sm:text-sm font-medium truncate max-w-[150px] sm:max-w-[250px] text-foreground">
                  {session.name || "Untitled Session"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(session.updatedAt).toLocaleDateString()}
              </span>
            </div>
            
            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              <DesktopButton
                size="sm"
                variant="ghost"
                className="h-6 w-6 sm:h-7 sm:w-7"
                aria-label="Clone session"
              >
                <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </DesktopButton>
              <DesktopButton
                size="sm"
                variant="ghost"
                className="h-6 w-6 sm:h-7 sm:w-7"
                aria-label="Rename session"
              >
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </DesktopButton>
              <DesktopButton
                size="sm"
                variant="ghost"
                className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                aria-label="Delete session"
              >
                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive" />
              </DesktopButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}