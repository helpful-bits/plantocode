"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button'; // Keep Button import
import { PatchStreamViewer } from './patch-stream-viewer'; // Import PatchStreamViewer
import { Loader2, Save, XOctagon, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'; // Keep imports, add RefreshCw
import { sendPromptToGeminiAction, cancelGeminiProcessingAction } from '@/actions/gemini-actions';
import { useDatabase } from '@/lib/contexts/database-context';
import { Session } from '@/types';
import { IdeIntegration } from './ide-integration';

// Keep GeminiProcessorProps interface
interface GeminiProcessorProps {
    prompt: string; 
    activeSessionId: string | null;
}

export function GeminiProcessor({ prompt, activeSessionId }: GeminiProcessorProps) {
    const [isLoading, setIsLoading] = useState(false); // Tracks if the *component* is performing an action (send/cancel)
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [sessionData, setSessionData] = useState<Session | null>(null);
    const [statusDisplay, setStatusDisplay] = useState<string>(""); // State for status/timer display
    const [sessionName, setSessionName] = useState<string>("");
    const [streamStats, setStreamStats] = useState({ tokensReceived: 0, charsReceived: 0 });
    const { repository, isInitialized } = useDatabase(); // Keep repository and isInitialized
    // Add a ref to track component mounted state
    const isMountedRef = useRef(true);

    // --- Status/Timer Logic ---
    const updateStatusDisplay = useCallback((session: Session | null) => {
        if (!session) {
            setStatusDisplay("");
            return;
        }

        const { geminiStatus, geminiStartTime, geminiEndTime } = session;

        if (geminiStatus === 'running' && geminiStartTime) {
             const diffSeconds = Math.max(0, Math.floor((Date.now() - geminiStartTime) / 1000));
             const minutes = Math.floor(diffSeconds / 60);
             const seconds = diffSeconds % 60;
             setStatusDisplay(`Running (${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s)`);
        } else if (geminiStatus === 'completed' || geminiStatus === 'failed' || geminiStatus === 'canceled') {
             const diffSeconds = geminiStartTime && geminiEndTime ? Math.max(0, Math.floor((geminiEndTime - geminiStartTime) / 1000)) : 0;
             const minutes = Math.floor(diffSeconds / 60);
             const seconds = diffSeconds % 60;
             setStatusDisplay(`Finished in ${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`);
        } else {
            setStatusDisplay(""); // Idle or unknown state
        }
    }, []);

    // --- Session Data Fetching --- // Keep Session Data Fetching comment
    // Fetches the latest session data from the database
    const fetchSessionData = useCallback(async () => {
        if (activeSessionId && repository && isInitialized) {
            try {
                if (!isMountedRef.current) return; // Check mount status early
                console.log(`[Gemini UI] Fetching session data for ${activeSessionId}...`);
                // Clear relevant cache before fetching to get latest status
                repository.clearCacheForSession(activeSessionId);
                const session = await repository.getSession(activeSessionId);
                if (!isMountedRef.current) return; // Check if component is still mounted

                setSessionData(session); // Update local state with fetched data

                if (session) { // Check if session data was successfully fetched
                    setSessionName(session.name); // Update session name display if needed
                    updateStatusDisplay(session); // Update status display
                    // Set error message based on status and message from session
                    if (session.geminiStatus !== 'failed' && session.geminiStatus !== 'canceled' && session.geminiStatus !== 'idle') {
                        setErrorMessage("");
                    } else if (session.geminiStatus === 'failed' || session.geminiStatus === 'canceled') {
                        // Show session's status message, or a default based on status
                        setErrorMessage(
                            session.geminiStatusMessage ||
                            (session.geminiStatus === 'failed' ? "Processing failed." : "Processing canceled.")
                        );
                    }
                    
                    // Update stream stats if available
                    if (session.geminiTokensReceived || session.geminiCharsReceived) {
                        setStreamStats({
                            tokensReceived: session.geminiTokensReceived || 0,
                            charsReceived: session.geminiCharsReceived || 0
                        });
                    }
                } else {
                    // Handle case where session is not found (maybe deleted)
                    setSessionName("");
                    setErrorMessage("Active session not found.");
                }
                console.log(`[Gemini UI] Fetch complete for ${activeSessionId}. Status: ${session?.geminiStatus}`);
            } catch (error) {
                setSessionName("");
                setErrorMessage("Failed to load session details.");
                console.error("[Gemini UI] Error fetching session details:", error);
                setStatusDisplay(""); // Clear status display on error
            } finally {
                if (isMountedRef.current) setIsLoading(false); // Reset loading state if still mounted
            }
        } else {
            // No active session, repository, or not initialized: clear state
            setSessionData(null);
            setSessionName("");
            setErrorMessage(""); // Clear errors when no session active or not initialized
            setStatusDisplay("");
            setStreamStats({ tokensReceived: 0, charsReceived: 0 });
        }
    }, [activeSessionId, repository, isInitialized, updateStatusDisplay]);

    // Fetch session data initially and whenever the active session ID or repository changes
    useEffect(() => {
        // Set mounted ref to true on mount
        isMountedRef.current = true;
        
        // Fetch data only if dependencies are ready
        if (activeSessionId && repository && isInitialized) {
            fetchSessionData();
        }

        // Cleanup on unmount or dependency change
        return () => {
            // Mark component as unmounted
            isMountedRef.current = false;
        };
    }, [activeSessionId, repository, isInitialized, fetchSessionData]); // Keep dependencies

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        if (sessionData?.geminiStatus === 'running') {
            intervalId = setInterval(() => {
                if (isMountedRef.current) updateStatusDisplay(sessionData);
            }, 1000); // Update timer every second
        }
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [sessionData, updateStatusDisplay]);
    
    // --- Action Handlers --- // Keep Action Handlers comment
    const handleSendToGemini = useCallback(async () => {
        if (!prompt || !activeSessionId || !repository) { // Add repository check
            setErrorMessage("Cannot send: Missing prompt or active session.");
            return;
        }

        if (isMountedRef.current) setIsLoading(true); // Set loading indicator only if mounted
        setErrorMessage(""); // Clear previous errors
        setStatusDisplay(""); // Reset status display
        
        try {
            // Call the action. It will update the DB status to 'running'.
            const result = await sendPromptToGeminiAction(prompt, activeSessionId);
            // Immediately fetch the updated session data to reflect the *initial* state change ('running')
            await fetchSessionData();
            // The action now runs in the background. Polling will update the final state.
            if (!result.isSuccess) {
                setErrorMessage(result.message || "Failed to start Gemini processing.");
                await fetchSessionData(); // Fetch data again immediately on failure to start
            }
         } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "An unexpected error occurred.");
            // Refetch session data even on unexpected error to show 'failed' status
            await fetchSessionData(); // Ensure UI reflects the final state
        } finally { // Reset component loading state (for the button action)
            setIsLoading(false); // Reset component loading state (for the button action)
        }
    }, [prompt, activeSessionId, repository, fetchSessionData]);

    const handleCancelProcessing = useCallback(async () => {
        if (!activeSessionId || !repository || sessionData?.geminiStatus !== 'running') { // Check status directly
            console.log(`[Gemini UI] Cancellation prevented: Session ${activeSessionId}, Status ${sessionData?.geminiStatus}`);
            return;
        }

        if (isMountedRef.current) setIsLoading(true);
        setErrorMessage(""); // Clear previous errors
        
        try {
            // Call the cancellation action
            const result = await cancelGeminiProcessingAction(activeSessionId);

            if (result.isSuccess) {
                // Successfully requested cancellation. Fetch data to show the 'canceled' state.
                console.log(`[Gemini UI] Cancellation request successful for ${activeSessionId}.`);
                await fetchSessionData();
            } else {
                // Failed to request cancellation (e.g., DB error, or already stopped)
                setErrorMessage(result.message || "Failed to request cancellation.");
                await fetchSessionData(); // Refetch anyway to show the current (likely still 'running') status
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "An error occurred during cancellation.");
            // Refetch session data on unexpected error to ensure status is correct
            await fetchSessionData(); // Ensure status is correct
        } finally { // Ensure isLoading is reset
            if (isMountedRef.current) setIsLoading(false); // Reset component loading indicator
        }
    }, [activeSessionId, repository, sessionData?.geminiStatus, fetchSessionData]);


    // --- UI State Determination --- // Keep UI State Determination comment
    // Determine button states based on session data
    const geminiStatus = sessionData?.geminiStatus ?? 'idle';
    const isProcessing = geminiStatus === 'running';
    const isCompleted = geminiStatus === 'completed';
    const isFailed = geminiStatus === 'failed';
    const isCanceled = geminiStatus === 'canceled';

    // Disable send if already running, component is loading, missing prompt, or no active session
    const isSendDisabled = isLoading || isProcessing || !prompt || !activeSessionId;
    // Disable cancel if not running OR if the component is currently performing an action (like trying to cancel)
    const isCancelDisabled = isLoading || !isProcessing; 
    const savedFilePath = sessionData?.geminiPatchPath || null; // Get path from sessionData

    return (
        <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card shadow-sm">
            {/* Send Button */}
            <Button
                onClick={handleSendToGemini} 
                disabled={isSendDisabled} 
                className="px-6 py-3 text-base"
                title={
                    !prompt ? "Generate a prompt first" : 
                    !activeSessionId ? "Load or create a session first" : 
                    isProcessing ? "Processing is already in progress" :
                    isLoading ? "Action in progress..." :
                    ""
                }
            >
                {isLoading && !isProcessing ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Save className="mr-2 h-5 w-5" />}
                {isLoading && !isProcessing ? "Starting..." : (isProcessing ? "Processing..." : "Send to Gemini & Save Patch")}
            </Button>

            {/* Status Display Section */}
            <div className="text-sm text-center min-h-[40px] w-full flex flex-col items-center justify-center px-2"> {/* Changed layout to column */}
                {(isProcessing || isCompleted || isFailed || isCanceled) && ( // Show status section if not idle
                    <div className="flex items-center justify-center gap-2">
                        {/* Icon based on status */}
                        {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                        {isCompleted && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {isFailed && <AlertCircle className="h-4 w-4 text-red-600" />}
                        {isCanceled && <XOctagon className="h-4 w-4 text-orange-600" />}

                        {/* Status Text */}
                        <span className={`${isFailed ? 'text-red-600' : isCanceled ? 'text-orange-600' : isCompleted ? 'text-green-600' : 'text-blue-600'} break-words max-w-full`}>
                            {isProcessing ? `Processing... (${statusDisplay})` : sessionData?.geminiStatusMessage || geminiStatus}
                        </span>

                        {/* Cancel Button (only when running) */}
                        {isProcessing && <Button
                            type="button"
                            variant="destructive"
                            size="sm" 
                            onClick={handleCancelProcessing}
                            disabled={isLoading || isCancelDisabled} // Also disable if component is loading (e.g., during cancel action)
                            className="ml-2 h-7 px-2 text-xs"
                            title={isCancelDisabled ? "Cancellation in progress or not currently running" : "Cancel Gemini processing"}
                        >
                            <XOctagon className="h-3 w-3 mr-1" />
                                Cancel
                        </Button>}

                        {/* Refresh Button (always show if not idle, disable while loading) */}
                        {(isProcessing || isCompleted || isFailed || isCanceled) && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={fetchSessionData}
                                disabled={isLoading}
                                className="ml-2 h-7 w-7"
                                title="Refresh Status"
                            >
                                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                            </Button>
                        )}
                    </div>
                )}
                {/* Show general component-level errors when not processing */}
                {errorMessage && !isProcessing && geminiStatus !== 'failed' && geminiStatus !== 'canceled' && (
                    <p className="text-red-600 flex items-center justify-center gap-1 break-words max-w-full">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {errorMessage}
                    </p>
                )}
            </div>
            
            {/* Stream stats display */}
            {(isProcessing || isCompleted) && streamStats.tokensReceived > 0 && ( // Show stats even after completion
                <div className="text-xs text-muted-foreground flex gap-3 justify-center">
                    <span>Tokens: {streamStats.tokensReceived}</span>
                    <span>Characters: {streamStats.charsReceived}</span>
                </div>
            )}
            
            {/* File path display with IDE integration */}
            {savedFilePath && (
                <div className="w-full flex flex-col items-center gap-2">
                    <p className="text-sm text-center">
                        Patch file: <span className="font-mono text-xs bg-muted p-1 rounded break-all inline-block max-w-full">{savedFilePath}</span>
                    </p>
                    <IdeIntegration filePath={savedFilePath} />
                </div>
            )}
            
            {/* Live Patch Content Viewer */}
            {(isProcessing || isCompleted) && savedFilePath && (
                <PatchStreamViewer 
                    patchFilePath={savedFilePath}
                    isStreaming={isProcessing}
                    sessionId={activeSessionId}
                />
            )}
        </div>
    );
}
