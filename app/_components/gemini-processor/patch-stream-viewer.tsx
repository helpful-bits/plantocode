import { useState, useEffect, useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { clearSessionPatchPathAction } from '@/actions/session-actions'; // Import the new action
import { AlertTriangle } from 'lucide-react'; // Icon for warning
interface PatchStreamViewerProps {
  patchFilePath: string | null;
  isStreaming: boolean;
  sessionId: string | null;
}

export function PatchStreamViewer({ patchFilePath, isStreaming, sessionId }: PatchStreamViewerProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [showFileNotFoundWarning, setShowFileNotFoundWarning] = useState(false); // State for specific warning

  // Polling interval depends on streaming status
  const pollingInterval = isStreaming ? 1000 : null; // Poll every second when streaming

  // Function to fetch patch content - memoized to prevent recreation on each render
  const fetchPatchContent = useCallback(async () => {
    if (!patchFilePath || !sessionId) return;
    if (showFileNotFoundWarning) return; // Don't fetch if we know it's not found

    try {
      // Only set loading if content is empty (to avoid flicker on updates)
      if (!content) setIsLoading(true);
      setError(null);
      // Don't reset the warning here, let it persist

      const response = await fetch(`/api/patch-content?path=${encodeURIComponent(patchFilePath)}&sessionId=${sessionId}`);
      if (!response.ok && response.status !== 404) { // Handle non-404 errors first
        setIsLoading(false); // Stop loading indicator on error
      }
      
      console.log(`Response status: ${response.status}, ${response.statusText}`);

      if (!response.ok) {
        let errorData = { error: 'Unknown error' };
        
        try {
          // Attempt to parse JSON response, but handle failures gracefully
          const text = await response.text();
          if (text) {
            try {
              errorData = JSON.parse(text);
            } catch (parseErr) {
              console.warn('Failed to parse error response as JSON:', parseErr);
              errorData = { error: text || `HTTP error ${response.status}: ${response.statusText}` };
            }
          } else {
            errorData = { error: `HTTP error ${response.status}: ${response.statusText}` };
          }
        } catch (readErr) {
          console.warn('Failed to read error response:', readErr);
          errorData = { error: `HTTP error ${response.status}: ${response.statusText}` };
        }
        
        console.error('Error response:', errorData);
        
        if (response.status === 404) {
          console.warn(`Patch file not found: ${patchFilePath} for session ${sessionId}`);
          setShowFileNotFoundWarning(true); // Set the specific warning flag
          // Call the server action to clear the patch path in the database
          try {
            await clearSessionPatchPathAction(sessionId);
          } catch (actionError) {
            console.error("Failed to clear session patch path:", actionError);
            // Optionally set a general error state here if clearing fails critically
          }
          setContent(''); // Clear any existing content
          return; // Stop fetching for this session instance
        }

        throw new Error(errorData.error || `HTTP error ${response.status}: ${response.statusText}`);
      }

      // Check the content type header to determine how to parse the response
      const contentType = response.headers.get('Content-Type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Handle as plain text
        const textContent = await response.text();
        data = { content: textContent };
      }
      
      // Only update if content actually changed to prevent unnecessary re-renders
      if (data.content !== content) {
        setContent(data.content);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patch content');
      console.error("Error fetching patch content:", err);
    } finally {
      setIsLoading(false);
    }
  }, [patchFilePath, sessionId, content, showFileNotFoundWarning]); // Add showFileNotFoundWarning to dependencies

  // Poll for patch content when streaming
  useInterval(fetchPatchContent, pollingInterval);

  // Initial fetch when patch file path changes or when streaming starts/stops
  // Reset warning when path changes
  useEffect(() => {
    if (patchFilePath) {
      fetchPatchContent(); // Fetch immediately on path change
    } else {
      setContent(''); // Clear content if path becomes null
    }
  }, [patchFilePath, fetchPatchContent]);
  
  // Reset warning if patchFilePath changes
  useEffect(() => {
    setShowFileNotFoundWarning(false);
  }, [patchFilePath]);
  if (!patchFilePath && !showFileNotFoundWarning) {
    return null; // Nothing to display if no path and no warning
  }
  return (
    <div>
      <div className="p-2 bg-muted flex items-center justify-between text-sm border-b">
        <div>
          Patch Content
          {lastUpdated && (
            <span className="ml-2 text-muted-foreground text-xs">
              (Updated: {new Date(lastUpdated).toLocaleTimeString()})
            </span>
          )}
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1 text-blue-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Live</span>
          </div>
        )}
      </div>
      <div className="h-[300px] rounded-b-lg p-4 bg-background/80 font-mono text-sm overflow-auto border border-t-0">
        {showFileNotFoundWarning ? (
             <div className="text-muted-foreground text-xs flex flex-col items-center justify-center h-full gap-2">
               <AlertTriangle className="h-5 w-5 text-amber-500" />
               Patch file not found or deleted.
             </div>
         ) : isLoading && !content ? (
             <div className="flex justify-center items-center h-full">
               <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
             </div>
         ) : error ? (
             <div className="text-destructive p-2">{error}</div>
         ) : content ? (
             <pre className="whitespace-pre-wrap">{content}</pre>
         ) : (
             <div className="text-muted-foreground flex items-center justify-center h-full">
               Awaiting patch content...
             </div>
         )}
      </div>
    </div>
  );
}
