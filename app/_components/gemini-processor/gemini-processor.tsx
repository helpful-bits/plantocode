"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save, XOctagon, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'; // Keep imports, add RefreshCw
import { sendPromptToGeminiAction, cancelGeminiProcessingAction } from '@/actions/gemini-actions'; // Keep gemini-actions import
import { resetSessionStateAction, clearSessionPatchPathAction } from '@/actions/session-actions'; // Import session-actions
import { useDatabase } from '@/lib/contexts/database-context'; // Keep database-context import
import { Session } from '@/types';
import { IdeIntegration } from './ide-integration';
interface GeminiProcessorProps {
    prompt: string; 
    activeSessionId: string | null;
}

export function GeminiProcessor({ prompt, activeSessionId }: GeminiProcessorProps) {
    const [isLoading, setIsLoading] = useState(false); // Tracks if the *component* is performing an action (send/cancel)
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [sessionData, setSessionData] = useState<Session | null>(null);
    const [statusDisplay, setStatusDisplay] = useState<string>(""); // State for status/timer display
    const [sessionName, setSessionName] = useState<string>(""); // Keep sessionName state
    const [streamStats, setStreamStats] = useState({ tokensReceived: 0, charsReceived: 0 }); // Keep streamStats state
    const { repository, isInitialized } = useDatabase(); // Keep repository and isInitialized
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
    // --- Session Data Fetching ---
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

    useEffect(() => { // Keep timer update effect
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
    
    // Function to reset the current session state when retrying
    const resetSessionState = useCallback(async () => {
        if (!activeSessionId) return;
        try {
            console.log(`[Gemini UI] Resetting session state for ${activeSessionId}`);
            // Use the server action to reset the session state
            const result = await resetSessionStateAction(activeSessionId);
            if (!result.isSuccess) {
                console.error(`[Gemini UI] Failed to reset session state: ${result.message}`);
            }
            await fetchSessionData(); // Refresh the UI
        } catch (error) {
            console.error('[Gemini UI] Error resetting session state:', error);
        }
    }, [activeSessionId, fetchSessionData]);

    // --- Action Handlers ---
    const handleSendToGemini = useCallback(async () => {
        if (!prompt || !activeSessionId || !repository) { // Add repository check
            setErrorMessage("Cannot send: Missing prompt or active session.");
            console.error("[Gemini UI] Cannot send: Missing prompt, active session, or repository.");
            return;
        }

        // Check if we're already loading
        if (isLoading) {
            console.log("[Gemini UI] Send request ignored - already loading");
            return;
        }

        // Check if the session is in canceled state and auto-reset it
        if (sessionData?.geminiStatus === 'canceled' || sessionData?.geminiStatus === 'failed') {
            console.log(`[Gemini UI] Auto-resetting session from ${sessionData.geminiStatus} state before processing`);
            await resetSessionState();
        }

        console.log(`[Gemini UI] Starting new request for session ${activeSessionId} with status ${sessionData?.geminiStatus}`);
        
        if (isMountedRef.current) setIsLoading(true); // Set loading indicator only if mounted
        setErrorMessage(""); // Clear previous errors
        setStatusDisplay(""); // Reset status display
        
        try {
            // Call the action. It will update the DB status to 'running'.
            console.log(`[Gemini UI] Sending prompt to Gemini for session ${activeSessionId}`);
            const result = await sendPromptToGeminiAction(prompt, activeSessionId);
            console.log(`[Gemini UI] Send action completed with result:`, result);
            
            // Immediately fetch the updated session data to reflect the *initial* state change ('running')
            await fetchSessionData();
            
            // The action now runs in the background. Polling will update the final state.
            if (!result.isSuccess) {
                console.error(`[Gemini UI] Failed to start Gemini processing: ${result.message}`);
                setErrorMessage(result.message || "Failed to start Gemini processing.");
                await fetchSessionData(); // Fetch data again immediately on failure to start
            }
         } catch (error) {
            console.error("[Gemini UI] Error during send:", error);
            setErrorMessage(error instanceof Error ? error.message : "An unexpected error occurred.");
            // Refetch session data even on unexpected error to show 'failed' status
            await fetchSessionData(); // Ensure UI reflects the final state
        } finally { // Reset component loading state (for the button action)
            console.log("[Gemini UI] Finished send request processing");
            setIsLoading(false); // Reset component loading state (for the button action)
        }
    }, [prompt, activeSessionId, repository, fetchSessionData, sessionData?.geminiStatus, isLoading, resetSessionState]);

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

    // Handler for when IDE integration fails to open the file
    const handleIdeIntegrationError = useCallback(async (errorMsg: string) => {
        if (errorMsg.includes('File not found')) {
            setErrorMessage("Patch file not found. It may have been deleted.");
            if (activeSessionId) {
                // Call action to clear the path from the database
                await clearSessionPatchPathAction(activeSessionId);
                await fetchSessionData(); // Refresh UI to remove file path display
            }
        } else {
            setErrorMessage(`Error opening file: ${errorMsg}`);
        }
    }, [activeSessionId, fetchSessionData]);

    // --- UI State Determination ---
    // Determine button states based on session data
    const geminiStatus = sessionData?.geminiStatus ?? 'idle';
    const isProcessing = geminiStatus === 'running';
    const isCompleted = geminiStatus === 'completed';
    const isFailed = geminiStatus === 'failed';
    const isCanceled = geminiStatus === 'canceled';

    // Allow restart of processing even if previously canceled/failed
    const isSendDisabled = isLoading || isProcessing; // Only disable when actively processing or loading
    
    // Disable cancel if not running OR if the component is currently performing an action (like trying to cancel)
    const isCancelDisabled = isLoading || !isProcessing;
    const savedFilePath = sessionData?.geminiPatchPath || null; // Get path from sessionData

    return (
        <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card shadow-sm w-full">
            {/* Send Button - Updated with static text */}
            <Button
                onClick={handleSendToGemini} 
                disabled={isSendDisabled || !prompt?.trim()} // Also disable if prompt is empty
                className="px-6 py-3 text-base"
                title={!prompt?.trim() ? "Generate a prompt first" : isSendDisabled ? "Processing..." : "Send to Gemini"}
            >
                {isLoading && !isProcessing ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Save className="mr-2 h-5 w-5" />}
                Send to Gemini
            </Button>

            {/* Processing Request List */}
            {(isProcessing || isCompleted || isFailed || isCanceled) && ( 
                <div className="w-full border rounded-md overflow-hidden">
                    <div className="bg-muted px-3 py-2 font-medium text-sm border-b">
                        Processing Requests
                    </div>
                    <div className="p-3">
                        <div className="flex items-start gap-3">
                            {/* Status Icon */}
                            <div className="mt-1">
                                {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                                {isCompleted && <CheckCircle className="h-4 w-4 text-green-600" />}
                                {isFailed && <AlertCircle className="h-4 w-4 text-red-600" />}
                                {isCanceled && <XOctagon className="h-4 w-4 text-orange-600" />}
                            </div>
                            
                            {/* Request Details */}
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className={`font-medium ${isFailed ? 'text-red-600' : isCanceled ? 'text-orange-600' : isCompleted ? 'text-green-600' : 'text-blue-600'}`}>
                                        {isProcessing ? 'Processing' : isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Canceled'}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{statusDisplay}</span>
                                </div>
                                
                                {/* Session Details */}
                                {sessionName && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Session: {sessionName}
                                    </p>
                                )}
                                
                                {/* Error Message */}
                                {errorMessage && (geminiStatus === 'failed' || geminiStatus === 'canceled') && (
                                    <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
                                )}
                                
                                {/* Stream Stats */}
                                {(isProcessing || isCompleted) && streamStats.tokensReceived > 0 && (
                                    <div className="text-xs text-muted-foreground mt-2 flex gap-3">
                                        <span>Tokens: {streamStats.tokensReceived}</span>
                                        <span>Characters: {streamStats.charsReceived}</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                {/* Cancel Button (only when running) */}
                                {isProcessing && (
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm" 
                                        onClick={handleCancelProcessing}
                                        disabled={isLoading || isCancelDisabled}
                                        title={isCancelDisabled ? "Cancellation in progress" : "Cancel processing"}
                                    >
                                        <XOctagon className="h-3 w-3 mr-1" />
                                        Cancel
                                    </Button>
                                )}

                                {/* Reset Button (for failed/canceled states) */}
                                {(isFailed || isCanceled) && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={resetSessionState}
                                        disabled={isLoading}
                                        title="Reset Session State"
                                    >
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        Reset
                                    </Button>
                                )}

                                {/* Refresh Button */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchSessionData}
                                    disabled={isLoading}
                                    title="Refresh Status"
                                >
                                    <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Show general component-level errors when not processing */}
            {errorMessage && !isProcessing && geminiStatus !== 'failed' && geminiStatus !== 'canceled' && (
                <p className="text-red-600 flex items-center justify-center gap-1 break-words max-w-full">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {errorMessage}
                </p>
            )}

            {/* File path display with IDE integration */}
            {savedFilePath && (
                <div className="w-full flex flex-col items-center gap-2">
                    <p className="text-sm text-center">
                        Patch file: <span className="font-mono text-xs bg-muted p-1 rounded break-all inline-block max-w-full">{savedFilePath}</span>
                    </p>
                    <IdeIntegration filePath={savedFilePath} onError={handleIdeIntegrationError} />
                </div>
            )}
        </div>
    );
}
