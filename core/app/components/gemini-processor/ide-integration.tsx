"use client";
import { normalizePath } from '@core/lib/path-utils';
import { Button } from '@core/components/ui/button';
import { ExternalLink, Code, AlertTriangle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { safeFetch } from '@core/lib/utils';

interface IdeIntegrationProps {
  filePath: string;
  tooltip?: string;
  onError?: (message: string) => void; // Callback for errors
}

export function IdeIntegration({ filePath, tooltip = "Open in editor", onError }: IdeIntegrationProps) {
  const [error, setError] = useState<string | null>(null); // Add error state
  const [isOpening, setIsOpening] = useState(false);

  const openInIDE = useCallback(async (filePath: string, line?: number, column?: number) => {
    try {
      setIsOpening(true);
      
      const response = await safeFetch('/api/open-in-ide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filePath,
          line,
          column
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to open file in IDE (${response.status})`);
      }
      
      const result = await response.json();
      console.log('Opened file in IDE:', result);
    } catch (error) {
      console.error('Error opening file in IDE:', error);
      setError(error instanceof Error ? error.message : 'Failed to open file in IDE');
    } finally {
      setIsOpening(false);
    }
  }, []);

  const handleOpenInIde = async () => {
    setError(null); // Clear previous errors

    if (!filePath) { // Guard against empty file path
        setError("File path is missing");
        if (onError) onError("File path is missing");
        return;
    }

    try {
      // Call an API endpoint to open the file in the system's default IDE
      await openInIDE(filePath);
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
        title={`Open ${filePath} in your default editor`} // Show full path in title with improved message
        disabled={!!error && error.includes('File not found')} // Disable if file not found
      >
        <Code className="h-3 w-3" />
        <span>Open in Editor</span>
        <ExternalLink className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}
