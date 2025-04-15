import { useState, useEffect, useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

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

  // Polling interval depends on streaming status
  const pollingInterval = isStreaming ? 1000 : null; // Poll every second when streaming

  // Function to fetch patch content - memoized to prevent recreation on each render
  const fetchPatchContent = useCallback(async () => {
    if (!patchFilePath || !sessionId) return;

    try {
      // Only set loading if content is empty (to avoid flicker on updates)
      if (!content) setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/patch-content?path=${encodeURIComponent(patchFilePath)}&sessionId=${sessionId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch patch content');
      }

      const data = await response.json();
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
  }, [patchFilePath, sessionId, content]); // Add content to dependencies

  // Poll for patch content when streaming
  useInterval(fetchPatchContent, pollingInterval);

  // Initial fetch when patch file path changes or when streaming starts/stops
  useEffect(() => {
    if (patchFilePath) {
      fetchPatchContent(); // Fetch immediately on path change
    } else {
      setContent(''); // Clear content if path becomes null
    }
  }, [patchFilePath, fetchPatchContent]);

  if (!patchFilePath) {
    return null; // Nothing to display
  }

  return (
    <Card className="mt-4 border shadow-sm w-full">
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
      <div className="h-[300px] rounded-sm p-4 bg-slate-50 font-mono text-sm overflow-auto">
        {isLoading && !content ? <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
         : error ? <div className="text-red-500 p-2">{error}</div>
         : content ? <pre className="whitespace-pre-wrap">{content}</pre>
         : <div className="text-muted-foreground flex items-center justify-center h-full">Awaiting patch content...</div>}
      </div>
    </Card>
  );
}
