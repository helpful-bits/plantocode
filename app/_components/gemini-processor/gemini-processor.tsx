"use client";

import { useState, useEffect, useCallback } from 'react';
import { useInterval } from 'usehooks-ts';
import { Button } from '@/components/ui/button';
import { Loader2, Save, XOctagon, AlertCircle, CheckCircle } from 'lucide-react'; // Keep imports
import { sendPromptToGeminiAction, cancelGeminiProcessingAction } from '@/actions/gemini-actions';
import { useDatabase } from '@/lib/contexts/database-context';
import { Session } from '@/types';
// Keep GeminiProcessorProps interface
interface GeminiProcessorProps {
    prompt: string; 
    activeSessionId: string | null;
}

export function GeminiProcessor({ prompt, activeSessionId }: GeminiProcessorProps) {
    const [isLoading, setIsLoading] = useState(false); // Tracks if the *component* is performing an action (send/cancel)
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [sessionData, setSessionData] = useState<Session | null>(null);
    const [elapsedTime, setElapsedTime] = useState<string>(""); // State for timer display string
    const [sessionName, setSessionName] = useState<string>("");
    const { repository, isInitialized } = useDatabase();
    const POLLING_RATE_MS = 1500; // Poll every 1.5 seconds for faster updates

    // --- Timer Logic --- // Keep Timer Logic comment
    // Formats elapsed time given a start time in milliseconds
    const formatElapsedTime = (startTime: number | null | undefined): string => { // Allow null/undefined startTime
        if (!startTime) return ""; // Return empty string if no start time
 
        // Ensure now is always >= startTime
        const now = Date.now();
        const diffSeconds = Math.max(0, Math.floor((now - startTime) / 1000)); // Use max to handle potential small clock skew
        const minutes = Math.floor(diffSeconds / 60); // Calculate minutes
        const seconds = diffSeconds % 60;
        return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`; // Format as Xm Ys
    };

    // Periodically update timer display if processing is running // Keep comment
    useInterval(
        () => {
            // Only update timer if session data exists, status is running, and start time is known
            if (sessionData?.geminiStatus === 'running' && sessionData?.geminiStartTime) {
                setElapsedTime(formatElapsedTime(sessionData.geminiStartTime));
            }
        },
        // Run interval only when status is 'running'
        sessionData?.geminiStatus === 'running' ? 1000 : null // Update timer every second if running
    ); // Close useInterval
    
    // --- Session Data Fetching --- // Keep Session Data Fetching comment
    // Fetches the latest session data from the database
    const fetchSessionData = useCallback(async () => {
        if (activeSessionId && repository && isInitialized) { // Add isInitialized check
            try {
                console.log(`[Gemini UI] Fetching session data for ${activeSessionId}`);
                const session = await repository.getSession(activeSessionId);
                setSessionData(session); // Update local state with fetched data

                if (session) {
                    setSessionName(session.name); // Update session name display if needed
                    // Only clear error if status isn't 'failed' or 'canceled'
                    if (session.geminiStatus !== 'failed' && session.geminiStatus !== 'canceled') {
                        setErrorMessage("");
                    } else if (session.geminiStatus === 'failed' || session.geminiStatus === 'canceled') {
                        // Set error message based on status and message from session
                        setErrorMessage(session.geminiStatusMessage || (session.geminiStatus === 'failed' ? "Processing failed." : "Processing canceled.")); // Display specific message
                    }
                    // Set initial elapsed time and control polling based on status
                    if (session.geminiStatus === 'running' && session.geminiStartTime) {
                         // Ensure elapsed time updates based on fresh data
                        setElapsedTime(formatElapsedTime(session.geminiStartTime));
                    } else if (session.geminiStatus !== 'running') {
                        setElapsedTime(""); // Clear elapsed time if not running
                        setPollingInterval(null); // Stop polling
                    } // Close if statement
                } else {
                    // Handle case where session is not found (maybe deleted)
                    setSessionName("");
                    setErrorMessage("Active session not found.");
                }
            } catch (error) {
                setSessionName("");
                setErrorMessage("Failed to load session details.");
                console.error("[Gemini UI] Error fetching session details:", error);
                setElapsedTime(""); // Clear elapsed time on error
                setPollingInterval(null); // Stop polling on error
            }
        } else {
            // No active session or repository, clear local state
            setSessionData(null);
            setSessionName("");
            setErrorMessage("No active session selected.");
            setPollingInterval(null); // Stop polling if no active session
        }
    }, [activeSessionId, repository, isInitialized]); // Add isInitialized dependency
    
    // Fetch session data initially and whenever the active session ID or repository changes
    useEffect(() => {
        fetchSessionData();
        // Start polling immediately, fetchSessionData will stop it if needed
        setPollingInterval(POLLING_RATE_MS);

        // Cleanup polling on component unmount or session change // Keep comment
        return () => setPollingInterval(null);
    }, [activeSessionId, repository]); // Depend only on session/repo changes

    // State to manage the polling interval
    const [pollingInterval, setPollingInterval] = useState<number | null>(null);

    // Fetch session data periodically using useInterval hook
    useInterval(fetchSessionData, pollingInterval);

    // Effect to control polling based on fetched status
    useEffect(() => {
        if (sessionData?.geminiStatus === 'running' && pollingInterval === null) {
            setPollingInterval(POLLING_RATE_MS);
        } else if (sessionData?.geminiStatus !== 'running' && pollingInterval !== null) {
            setPollingInterval(null);
        }
    }, [sessionData?.geminiStatus, pollingInterval]); // Depend on status and interval state
    
    // --- Action Handlers --- // Keep Action Handlers comment
    const handleSendToGemini = useCallback(async () => {
        if (!prompt || !activeSessionId || !repository) { // Add repository check
            setErrorMessage("Cannot send: Missing prompt or active session.");
            return;
        }

        setIsLoading(true); // Set loading indicator
        setErrorMessage(""); // Clear previous errors
        setElapsedTime(""); // Reset timer display
        
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
             // Set polling to ensure status updates propagate
             await fetchSessionData();
        } finally {
            setIsLoading(false); // Reset component loading state
        } // Close finally block
    }, [prompt, activeSessionId, repository, fetchSessionData]); // Removed sessionData dependency

    const handleCancelProcessing = useCallback(async () => {
        if (!activeSessionId || !repository || sessionData?.geminiStatus !== 'running') { // Check status directly
            console.log(`[Gemini UI] Cancellation prevented: Session ${activeSessionId}, Status ${sessionData?.geminiStatus}`);
            return;
        }

        setIsLoading(true);
        
        try {
            // Call the action to update the DB status to 'canceled'.
            const result = await cancelGeminiProcessingAction(activeSessionId);

            if (result.isSuccess) {
                // Successfully requested cancellation, refetch immediately to update UI
                await fetchSessionData();
            } else {
                // Failed to request cancellation (e.g., DB error, or already stopped)
                setErrorMessage(result.message || "Failed to cancel processing.");
                await fetchSessionData(); // Refetch anyway to show the current (likely still 'running') status
            }
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "An error occurred during cancellation.");
            // Refetch session data on unexpected error
            await fetchSessionData();
        } finally {
            setIsLoading(false); // Reset component loading indicator
        }
    }, [activeSessionId, repository, sessionData?.geminiStatus, fetchSessionData]); // Keep dependency array


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
    const savedFilePath = geminiStatus === 'completed' ? sessionData?.geminiPatchPath : null; // Get path from sessionData

    return (
        <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card shadow-sm">
            <Button
                type="button" // Explicitly set type
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
                {isLoading && !isProcessing ? "Starting..." : isProcessing ? "Processing..." : "Send to Gemini & Save Patch"}
            </Button>

            {/* Render error message if exists and not processing */}
            {errorMessage && !isProcessing && (
              <p className="text-red-600 flex items-center justify-center gap-1 break-words max-w-full"><AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {errorMessage}</p>
            )}

            {/* Status Display Section */}
            <div className="text-sm text-center min-h-[40px] w-full flex items-center justify-center px-2"> {/* Added padding */}
                {isProcessing && !isLoading && ( // Show processing status + cancel button
                    <div className="flex items-center justify-center gap-2 text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing... ({elapsedTime})</span>
                        <Button // Cancellation Button
                            type="button"
                            variant="destructive"
                            size="sm" 
                            onClick={handleCancelProcessing}
                            disabled={isCancelDisabled}
                            className="ml-2 h-7 px-2 text-xs"
                            title={isCancelDisabled ? "Cancellation in progress or not currently running" : "Cancel Gemini processing"}
                        >
                            <XOctagon className="h-3 w-3 mr-1" />
                            Cancel
                        </Button>
                    </div>
                )}
                 {isLoading && isProcessing && ( // Show canceling message only when actively canceling
                    <div className="flex items-center justify-center gap-2 text-orange-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Canceling...</span>
                    </div>
                 )}
                {/* Display final status messages */}
                {isCompleted && sessionData?.geminiStatusMessage && (
                    <p className="text-green-600 flex items-center justify-center gap-1 break-words max-w-full">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 mr-1" /> 
                        {sessionData.geminiStatusMessage} {/* Show status message from session */}
                    </p>
                )}
                {isFailed && sessionData?.geminiStatusMessage && (
                    // Ensure error message wraps if long
                    <p className="text-red-600 flex items-center justify-center gap-1 break-words max-w-full"><AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {sessionData.geminiStatusMessage}</p>
                )}
                {isCanceled && sessionData?.geminiStatusMessage && (
                    // Ensure canceled message wraps
                    <p className="text-orange-600 flex items-center justify-center gap-1 break-words max-w-full"><XOctagon className="h-4 w-4 flex-shrink-0 mr-1" /> {sessionData.geminiStatusMessage || 'Processing canceled.'}</p>
                )}
                {/* Show component-level errors when idle */}
                {geminiStatus === 'idle' && errorMessage && (
                   <p className="text-red-600 flex items-center justify-center gap-1 break-words max-w-full"><AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {errorMessage}</p>
                )}
            </div>
            {savedFilePath && geminiStatus === 'completed' && ( // Only show path if completed
                <p className="text-sm text-center"> {/* Centered text */}
                   Patch saved to: <span className="font-mono text-xs bg-muted p-1 rounded break-all inline-block max-w-full">{savedFilePath}</span> {/* Display the path */}
                </p>
            )}
        </div>
    );
}
