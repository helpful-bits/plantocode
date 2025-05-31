"use client";


interface LoadingScreenProps {
  message?: string;
  loadingType?: "login" | "configuration" | "initializing" | "data";
  variant?: "minimal" | "full";
}

/**
 * Loading screen that appears during application initialization or major state changes
 *
 * Variants:
 * - 'minimal': Simple loading spinner with a message
 * - 'full': Enhanced loading screen with logo, progress bar, and contextual messages
 */
export function LoadingScreen({
  message,
  loadingType = "initializing",
  variant = "minimal",
}: LoadingScreenProps) {
  // Map 'data' type to 'initializing' for message generation
  const mappedLoadingType =
    loadingType === "data" ? "initializing" : loadingType;

  // Default message based on loading type
  const defaultMessage = {
    login: "Authenticating...",
    configuration: "Loading Configuration...",
    initializing: "Initializing Vibe Manager...",
  }[mappedLoadingType];

  const displayMessage = message || defaultMessage;

  // Customize subtext based on loading type (for full variant)
  const getSubtext = () => {
    switch (loadingType) {
      case "configuration":
        return "Fetching user preferences and runtime settings...";
      case "login":
        return "Verifying credentials and setting up session...";
      case "data":
        return "Loading application data...";
      case "initializing":
      default:
        return "Preparing workspace and checking system requirements...";
    }
  };

  // Render minimal loading screen variant
  if (variant === "minimal") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-xl border-4 border-muted border-t-primary animate-spin mb-4 shadow-soft"></div>
        <p className="text-foreground/70 text-lg">{displayMessage}</p>
      </div>
    );
  }

  // Render full loading screen variant
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background z-20">
      <div className="text-center max-w-md px-6">
        {/* Logo placeholder (could be replaced with actual logo) */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center shadow-soft backdrop-blur-sm">
          <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-lg bg-primary"></div>
          </div>
        </div>

        {/* Main loading spinner */}
        <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-xl animate-spin mx-auto mb-4 shadow-soft"></div>

        {/* Primary message */}
        <h3 className="text-xl font-medium mb-2 text-foreground">{displayMessage}</h3>

        {/* Secondary message based on loading type */}
        <p className="text-muted-foreground mb-4">{getSubtext()}</p>

        {/* Loading progress bar */}
        <div className="w-full h-1.5 bg-muted overflow-hidden rounded-xl shadow-soft backdrop-blur-sm">
          <div className="h-full bg-primary animate-progress-indeterminate"></div>
        </div>
      </div>
    </div>
  );
}
