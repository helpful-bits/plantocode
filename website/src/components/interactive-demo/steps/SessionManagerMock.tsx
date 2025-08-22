// Step 2: Session Manager Mock
'use client';

import { DesktopInput } from '../desktop-ui/DesktopInput';
import { DesktopButton } from '../desktop-ui/DesktopButton';
import { Search, RefreshCw, PlusCircle, Save, Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTimedCycle, useTypewriter } from '../hooks';
import { cn } from '@/lib/utils';

interface SessionManagerMockProps {
  isInView: boolean;
  resetKey?: number;
}

// Define phases outside component to prevent recreation on each render
const SESSION_MANAGER_PHASES = [
  { name: 'idle' as const, durationMs: 800 },   // Brief time to see existing sessions
  { name: 'new' as const, durationMs: 500 },   // Quick button press animation
  { name: 'form' as const, durationMs: 1000 }, // Time to see form appear
  { name: 'typing' as const, durationMs: 3000 }, // Realistic typing duration (reduced from 4000ms)
  { name: 'save' as const, durationMs: 400 },  // Quick save button press
  { name: 'saved' as const, durationMs: 2000 }, // Time to read success message (reduced from 2500ms)
  { name: 'wait' as const, durationMs: 800 }   // Brief pause before restart
];

export function SessionManagerMock({ isInView }: SessionManagerMockProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const newSessionName = "Feature Discovery Session";

  const { phaseName: phase } = useTimedCycle({ active: isInView, phases: SESSION_MANAGER_PHASES, loop: true, resetOnDeactivate: true });
  
  // Map phases to numeric steps for compatibility
  const step = (() => {
    switch (phase) {
      case 'idle': return 0;
      case 'new': return 1;
      case 'form': return 2;
      case 'typing': return 3;
      case 'save': return 4;
      case 'saved': case 'wait': return 5;
      default: return 0;
    }
  })();
  
  // Timing-driven button press windows
  const newButtonPressed = phase === 'new';
  const saveButtonPressed = phase === 'save';
  
  // Use typewriter for typing phase
  const { displayText: typedText } = useTypewriter({
    text: newSessionName,
    active: phase === 'typing',
    durationMs: 3000
  });
  
  // For non-typing phases, show appropriate text
  const displayText = (() => {
    if (step < 3) return "";
    if (step === 3) return typedText;
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
    <div className="w-full desktop-glass-card rounded-xl shadow-soft">
      <div className="p-3 bg-muted/80 backdrop-blur-sm border-b border-[oklch(0.90_0.04_195_/_0.3)] rounded-t-xl">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-foreground">Sessions</h3>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <DesktopInput
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={setSearchQuery}
                className="pl-7 w-full sm:w-44"
              />
            </div>
            <DesktopButton
              size="sm"
              variant="outline"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">Refresh</span>
            </DesktopButton>
            <DesktopButton
              size="sm"
              variant="outline"
              className={`transition-transform duration-200 ${newButtonPressed ? 'scale-95 bg-primary/80' : ''}`}
            >
              <PlusCircle className="h-3 w-3 mr-1" />
              New
            </DesktopButton>
          </div>
        </div>
      </div>

      {/* Collapsible New Session Form */}
      {step >= 2 && step < 5 && (
        <div className="border-b border-[oklch(0.90_0.04_195_/_0.2)]">
          <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300 p-3">
            <div className="flex items-center gap-2">
              <div className="relative grow">
                <DesktopInput
                  value={displayText}
                  placeholder="New session name..."
                  className="w-full h-8 sm:h-9 text-sm"
                />
              </div>
              <DesktopButton
                size="sm"
                className={`transition-transform duration-200 ${saveButtonPressed ? 'scale-95 bg-primary/80' : ''}`}
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
            className={cn(
              "flex items-center justify-between p-2 border-b border-[oklch(0.90_0.04_195_/_0.3)] last:border-b-0 transition-all duration-200 cursor-pointer",
              session.isActive ? "bg-accent" : "hover:bg-muted/80",
              session.id === "new" && step >= 5 ? "ring-1 ring-primary/30 animate-in fade-in-0 slide-in-from-bottom-2 duration-300" : ""
            )}
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
                compact
                size="xs"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Clone session"
              >
                <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </DesktopButton>
              <DesktopButton
                compact
                size="xs"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Rename session"
              >
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </DesktopButton>
              <DesktopButton
                compact
                size="xs"
                variant="ghost"
                className="h-6 w-6 text-destructive"
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

export default SessionManagerMock;