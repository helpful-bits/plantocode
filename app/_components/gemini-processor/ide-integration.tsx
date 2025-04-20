"use client";
import { normalizePath } from '@/lib/path-utils';
import { Button } from '@/components/ui/button';
import { ExternalLink, Code, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface IdeIntegrationProps {
  filePath: string;
  tooltip?: string;
  onError?: (message: string) => void; // Callback for errors
}

export function IdeIntegration({ filePath, tooltip = "Open in editor", onError }: IdeIntegrationProps) {
  const [error, setError] = useState<string | null>(null); // Add error state

  const handleOpenInIde = async () => {
    setError(null); // Clear previous errors

    if (!filePath) { // Guard against empty file path
        setError("File path is missing");
        if (onError) onError("File path is missing");
        return;
    }

    try {
      // Call an API endpoint to open the file in the system's default IDE
      const response = await fetch('/api/open-in-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass the raw path, let the server resolve and normalize it for security
        body: JSON.stringify({ filePath: filePath }),
      });

      if (!response.ok) {
          // Use the specific error message from API if available
          const errorData = await response.json(); // Await JSON response
          const errorMsg = errorData.error || `Failed to open in IDE (Status: ${response.status})`;          setError(errorMsg); // Set error state
          if (onError) onError(errorMsg); // Call error callback
          throw new Error(errorMsg);
      }
      // Success - no error to display
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMsg);
      if (onError) onError(errorMsg); // Ensure callback is called even for fetch errors
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 p-1.5 rounded border border-destructive/20 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1 text-xs"
        onClick={handleOpenInIde}
        title={`${tooltip}: ${filePath}`} // Show full path in title
        disabled={!!error && error.includes('File not found')} // Disable if file not found
      >
        <Code className="h-3 w-3" />
        <span>Open in IDE</span>
        <ExternalLink className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}
