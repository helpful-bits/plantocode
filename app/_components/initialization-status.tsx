"use client";

import React from "react";
import { useInitialization } from "@/lib/contexts/initialization-context";
import { Loader2, AlertCircle, FolderOpen, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InitializationStatus() {
  const { 
    stage, 
    error, 
    isLoading, 
    retryInitialization,
    clearError,
    projectDirectory
  } = useInitialization();
  
  if (stage === 'ready' && !error) {
    return null;
  }
  
  let statusMessage = "";
  let icon = <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />;
  
  switch (stage) {
    case 'database_init':
      statusMessage = "Initializing database...";
      break;
    case 'project_loading':
      if (!projectDirectory) {
        statusMessage = "Waiting for project directory selection";
        icon = <FolderOpen className="h-6 w-6 text-primary mr-2" />;
      } else {
        statusMessage = `Loading project: ${projectDirectory}`;
      }
      break;
    case 'session_loading':
      statusMessage = "Loading session data...";
      icon = <LogIn className="h-6 w-6 text-primary mr-2" />;
      break;
    default:
      statusMessage = "Preparing application...";
  }
  
  if (error) {
    icon = <AlertCircle className="h-6 w-6 text-destructive mr-2" />;
    statusMessage = `Error: ${error}`;
  }
  
  return (
    <div className="w-full max-w-md mx-auto mt-8 p-4 bg-card rounded-lg shadow-md border">
      <div className="flex items-center mb-4">
        {icon}
        <h3 className="text-lg font-medium">{error ? "Initialization Error" : "Application Startup"}</h3>
      </div>
      
      <p className="text-muted-foreground mb-4">{statusMessage}</p>
      
      {error && (
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={clearError}
            disabled={isLoading}
          >
            Dismiss
          </Button>
          <Button 
            variant="default" 
            onClick={retryInitialization}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Retrying...
              </>
            ) : "Retry"}
          </Button>
        </div>
      )}
    </div>
  );
} 