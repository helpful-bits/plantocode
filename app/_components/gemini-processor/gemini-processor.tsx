"use client";

import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import { useDebounceValue } from 'usehooks-ts';
import {Button} from '@/components/ui/button';
import {Loader2, Save, XOctagon, AlertCircle, CheckCircle, RefreshCw, Clock, ExternalLink, ChevronDown, ChevronUp, Hammer, Search} from 'lucide-react';
import {
    sendPromptToGeminiAction,
    cancelGeminiRequestAction,
    cancelGeminiProcessingAction
} from '@/actions/gemini-actions';
import {resetSessionStateAction, clearSessionXmlPathAction} from '@/actions/session-actions';
import {GeminiProcessorContext, useGeminiProcessor} from './gemini-processor-context';
import {useDatabase} from '@/lib/contexts/database-context';
import {GeminiRequest, Session, GeminiStatus} from '@/types';
import {normalizePath} from '@/lib/path-utils';
import {IdeIntegration} from './ide-integration';
import { applyXmlChangesFromFileAction } from '@/actions/apply-xml-changes-action';
import { useProject } from '@/lib/contexts/project-context';
import path from 'path';
import { toast } from '@/components/ui/use-toast';

interface GeminiProcessorProps {
    prompt: string;
    activeSessionId: string | null;
}

interface ExtendedGeminiRequest extends GeminiRequest {
    isPending?: boolean;
}

export function GeminiProcessor({prompt, activeSessionId}: GeminiProcessorProps) {
    // Track loading state for operations like cancellation, but not for send operations
    const [isLoading, setIsLoading] = useState(false);
    // Add state for tracking last request time to prevent rapid-fire requests
    const [lastRequestTime, setLastRequestTime] = useState<number>(0);
    // Define a cooldown period (2 seconds) to prevent sending requests too quickly
    const COOLDOWN_PERIOD_MS = 2000;
    // Track pending server requests separately
    const [pendingRequests, setPendingRequests] = useState<ExtendedGeminiRequest[]>([]);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [sessionData, setSessionData] = useState<Session | null>(null);
    const {repository, isInitialized} = useDatabase();
    const { projectDirectory } = useProject();
    const isMountedRef = useRef(true);

    // Timer display string state for each request
    const [requestTimers, setRequestTimers] = useState<Record<string, string>>({});

    // Debounce session data to prevent excessive updates
    const [debouncedSessionData] = useDebounceValue(sessionData, 300);

    // Add state for XML application
    const [applyingXmlId, setApplyingXmlId] = useState<string | null>(null);
    const [applyResult, setApplyResult] = useState<{
        requestId: string;
        isSuccess: boolean;
        message: string;
        changes: string[];
    } | null>(null);
    const [showChangesMap, setShowChangesMap] = useState<Record<string, boolean>>({});

    // Add a state variable for collapsed requests
    const [isRequestsCollapsed, setIsRequestsCollapsed] = useState(false);

    // --- Request Timer Logic ---
    const updateRequestTimers = useCallback((requests: ExtendedGeminiRequest[] | undefined) => {
        if (!requests) return;
        const newTimers: Record<string, string> = {};

        requests.forEach(request => {
            // Calculate time display based on status
            if (request.status === 'running' && request.startTime) {
                // Running timer for active requests
                const diffSeconds = Math.max(0, Math.floor((Date.now() - request.startTime) / 1000));
                const minutes = Math.floor(diffSeconds / 60);
                const seconds = diffSeconds % 60;
                newTimers[request.id] = `Running (${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s)`;
            } else if ((request.status === 'completed' || request.status === 'failed' || request.status === 'canceled') &&
                request.startTime && request.endTime) {
                // Static time for completed requests
                const diffSeconds = Math.max(0, Math.floor((request.endTime - request.startTime) / 1000));
                const minutes = Math.floor(diffSeconds / 60);
                const seconds = diffSeconds % 60;
                newTimers[request.id] = `Finished in ${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
            }
        });

        if (isMountedRef.current) setRequestTimers(newTimers);
    }, []);

    // --- Session Data Fetching ---
    const fetchSessionData = useCallback(async () => {
        if (activeSessionId && repository && isInitialized) {
            try {
                console.log(`[Gemini UI] Fetching session data with requests for ${activeSessionId}...`);

                // Clear session detail cache to ensure we get the latest request statuses
                // Note: This might be slightly aggressive, but ensures UI reflects DB state accurately.
                // Consider more granular cache invalidation if performance becomes an issue.
                repository.clearCacheForSessionWithRequests(activeSessionId);
                repository.clearCacheForSession(activeSessionId); // Also clear basic session cache

                // Get the session with all requests
                const session = await repository.getSessionWithRequests(activeSessionId);

                if (session) {
                    if (!isMountedRef.current) return;

                    setSessionData(session);

                    // Update timers for all requests
                    updateRequestTimers(session.geminiRequests);

                    // Find if any request is in failed/canceled state
                    const hasFailedOrCanceledRequest = session.geminiRequests?.some((req: any) => req.status === 'failed' || req.status === 'canceled');

                    if (!hasFailedOrCanceledRequest) {
                        setErrorMessage("");
                    }
                } else {
                    setErrorMessage("Active session not found.");
                    setSessionData(null); // Clear session data if not found
                }
            } catch (error) {
                setErrorMessage("Failed to load session details.");
                console.error("[Gemini UI] Error fetching session details:", error instanceof Error ? error.message : error);
            }
        } else {
            setSessionData(null);
            setErrorMessage("");
            setRequestTimers({});
        }
    }, [activeSessionId, repository, isInitialized, updateRequestTimers]);

    // Initial data fetch
    useEffect(() => {
        isMountedRef.current = true;

        if (activeSessionId && repository && isInitialized) {
            fetchSessionData();

            // Polling interval to refresh data, especially for running requests
            const pollInterval = setInterval(() => {
                const hasRunning = sessionData?.geminiRequests?.some(req => req.status === 'running');
                if (hasRunning && isMountedRef.current) {
                    fetchSessionData();
                }
            }, 5000); // Poll every 5 seconds if there are running requests

            return () => {
                clearInterval(pollInterval);
                isMountedRef.current = false;
            };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSessionId, repository, isInitialized, fetchSessionData]);

    // Timer update effect - Now depends on debounced data
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        const hasRunningRequests = debouncedSessionData?.geminiRequests?.some(req => req.status === 'running');

        if (hasRunningRequests) {
            intervalId = setInterval(() => {
                if (isMountedRef.current) updateRequestTimers(debouncedSessionData?.geminiRequests);
            }, 1000); // Update timers every second
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [sessionData?.geminiRequests, updateRequestTimers]);

    // Cooldown timer update effect
    const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

    useEffect(() => {
        let initialRemaining = lastRequestTime ?
            Math.max(0, Math.ceil((COOLDOWN_PERIOD_MS - (Date.now() - lastRequestTime)) / 1000)) : 0;

        if (initialRemaining <= 0) {
            setCooldownRemaining(0);
            return;
        }

        // Set up interval to update cooldown timer
        const cooldownIntervalId = setInterval(() => {
            if (isMountedRef.current) {
                const newRemaining = Math.max(0, Math.ceil((COOLDOWN_PERIOD_MS - (Date.now() - lastRequestTime)) / 1000));
                setCooldownRemaining(newRemaining);

                // Clear interval when cooldown is complete
                if (newRemaining <= 0) {
                    clearInterval(cooldownIntervalId);
                }
            }
        }, 200); // Update more frequently for smoother countdown

        return () => {
            clearInterval(cooldownIntervalId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastRequestTime, COOLDOWN_PERIOD_MS]);

    // Function to reset the session state
    const resetSessionState = useCallback(async () => {
        if (!activeSessionId) return;
        try {
            console.log(`[Gemini UI] Resetting session state for ${activeSessionId}`);
            setIsLoading(true);
            const result = await resetSessionStateAction(activeSessionId);
            if (!result.isSuccess) {
                console.error(`[Gemini UI] Failed to reset session state: ${result.message}`);
                setErrorMessage(result.message || "Failed to reset session state.");
            }
            await fetchSessionData();

            // Clear error message on successful reset
            if (result.isSuccess) {
                setErrorMessage("");
            }
        } catch (error) {
            console.error('[Gemini UI] Error resetting session state:', error);
            setErrorMessage("Failed to reset session state.");
        } finally {
            setIsLoading(false);
        }
    }, [activeSessionId, fetchSessionData]);

    // Function to reset the processor state
    const resetProcessorState = useCallback(async () => {
        if (!activeSessionId) return;

        console.log(`[Gemini UI] Resetting processor state for session ${activeSessionId}`);

        try {
            setIsLoading(true);

            // Cancel any running requests first
            await cancelGeminiProcessingAction(activeSessionId);

            // Then reset the session state
            await resetSessionStateAction(activeSessionId);

            // Clear error message
            setErrorMessage("");

            // Refresh session data to reflect changes
            await fetchSessionData();

            console.log(`[Gemini UI] Processor state reset completed for session ${activeSessionId}`);
        } catch (error) {
            console.error('[Gemini UI] Error resetting processor state:', error);
            setErrorMessage("Failed to reset processor state. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [activeSessionId, fetchSessionData]);

    // Handler for sending to Gemini, using useCallback for stability
    const handleSendToGemini = useCallback(async () => {
        if (!prompt?.trim() || !activeSessionId || !repository) { // Check prompt trim
            setErrorMessage("Cannot send: Missing prompt or active session."); // Keep error message
            console.error("[Gemini UI] Cannot send: Missing prompt, active session, or repository.");
            return;
        }

        // Check if we're within the cooldown period
        if (cooldownRemaining > 0) {
            console.log(`[Gemini UI] Request ignored - within cooldown period (${cooldownRemaining}s remaining)`);
            setErrorMessage(`Please wait ${cooldownRemaining} second${cooldownRemaining !== 1 ? 's' : ''} before sending another request.`);
            return;
        }

        // Note: We're allowing multiple concurrent requests to be sent.
        // The only restriction is the cooldown period between requests from the same user.
        // This allows the system to process multiple requests simultaneously.

        console.log(`[Gemini UI] Starting new request for session ${activeSessionId}`);

        // Record this request attempt time
        setLastRequestTime(Date.now());

        // Create a temporary request to show immediately in the UI
        const tempRequestId = `pending-${Date.now()}`;
        const pendingRequest: ExtendedGeminiRequest = {
            id: tempRequestId,
            sessionId: activeSessionId,
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''), // Truncate for display
            status: 'preparing', // Use 'preparing' status for pending requests
            createdAt: Date.now(),
            startTime: Date.now(),
            isPending: true, // Custom flag for pending state
            tokensReceived: 0,
            charsReceived: 0
        } as any; // Type cast to satisfy the GeminiRequest interface

        // Add to pending requests state to display immediately
        setPendingRequests(prev => [pendingRequest, ...prev]);

        // Clear error message
        setErrorMessage("");

        try {
            console.log(`[Gemini UI] Sending prompt to Gemini for session ${activeSessionId}`);

            // Send the actual request to the server
            const result = await sendPromptToGeminiAction(prompt, activeSessionId);
            console.log(`[Gemini UI] Send action completed with result:`, result);

            // Always remove the pending request regardless of success or failure
            setPendingRequests(prev => prev.filter(r => r.id !== tempRequestId));

            if (!result.isSuccess) {
                console.error(`[Gemini UI] Failed to start Gemini processing: ${result.message}`);

                // Special handling for API key missing
                if (result.message?.includes("GEMINI_API_KEY is not configured")) {
                    setErrorMessage("API key missing: Please configure the GEMINI_API_KEY environment variable.");
                } else if (result.message?.includes("canceled") || result.message?.includes("cancelled")) {
                    // Handle cancellation specially to make it clear to the user
                    setErrorMessage(`Request was canceled: ${result.message}`);

                    // Force a session data refresh to ensure UI state is correct
                    await fetchSessionData();
                } else {
                    setErrorMessage(result.message || "Unknown error starting Gemini processing.");
                }

                // Make sure session state is properly reset in the UI when there's an error
                if (sessionData && sessionData.geminiStatus === 'running') {
                    console.log('[Gemini UI] Forcing session data refresh after error');
                    await fetchSessionData();
                }

                return;
            }

            // Fetch the updated session data to show the real request
            await fetchSessionData();
        } catch (error) {
            console.error('[Gemini UI] Error in Gemini request:', error);

            // Remove the pending request
            setPendingRequests(prev => prev.filter(r => r.id !== tempRequestId));

            // Set error message
            setErrorMessage(error instanceof Error ? error.message : "Unknown error sending Gemini request");

            // Force a refresh of session data to ensure UI is in correct state
            await fetchSessionData();
        }
    }, [activeSessionId, cooldownRemaining, fetchSessionData, prompt, repository, sessionData?.geminiStatus]);

    // Handler for canceling a specific request, using useCallback
    const handleCancelRequest = useCallback(async (requestId: string) => {
        if (!requestId || !repository) { // Add repository check
            return;
        }

        setIsLoading(true);

        try {
            console.log(`[Gemini UI] Canceling request ${requestId}`);
            const result = await cancelGeminiRequestAction(requestId);

            if (result.isSuccess) {
                console.log(`[Gemini UI] Cancellation request successful for ${requestId}`);
            } else {
                console.error(`[Gemini UI] Failed to cancel request: ${result.message}`);
            }

            await fetchSessionData();
        } catch (error) {
            console.error("[Gemini UI] Error during cancel:", error);
            await fetchSessionData();
        } finally {
            setIsLoading(false);
        }
    }, [repository, fetchSessionData]);

    // Handler for canceling all running requests for the session, using useCallback
    const handleCancelAllRequests = useCallback(async () => {
        if (!sessionData?.id || !repository) {
            return; // Add repository check
        }

        setIsLoading(true);

        try {
            console.log(`[Gemini UI] Canceling all running requests for session ${sessionData.id}`);
            const result = await cancelGeminiProcessingAction(sessionData.id);

            if (result.isSuccess) {
                console.log(`[Gemini UI] Cancellation request successful for all running requests`);
            } else {
                console.error(`[Gemini UI] Failed to cancel all requests: ${result.message}`);
                setErrorMessage(result.message || "Failed to cancel processing");
            }

            await fetchSessionData();
        } catch (error) {
            console.error("[Gemini UI] Error during cancel all:", error);
            setErrorMessage(error instanceof Error ? error.message : "An error occurred during cancellation");
            await fetchSessionData();
        } finally {
            setIsLoading(false);
        }
    }, [repository, sessionData?.id, fetchSessionData]);

    // Function to handle applying XML changes
    const handleApplyXmlChanges = async (requestId: string, xmlPath: string) => {
        if (!xmlPath || !projectDirectory) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "XML file path is missing or project directory is not set."
            });
            return;
        }
        
        setApplyingXmlId(requestId);
        
        try {
            const result = await applyXmlChangesFromFileAction(xmlPath, projectDirectory);
            
            if (result.isSuccess) {
                toast({
                    title: "Success",
                    description: result.message || "XML changes applied successfully."
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: result.message || "Failed to apply XML changes."
                });
            }
        } catch (error) {
            console.error("Error applying XML changes:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to apply XML changes."
            });
        } finally {
            setApplyingXmlId(null);
        }
    };

    // Function to toggle showing changes for a specific request
    const toggleShowChanges = useCallback((requestId: string) => {
        setShowChangesMap(prev => ({
            ...prev,
            [requestId]: !prev[requestId]
        }));
    }, []);

    /**
     * Handle IDE integration error by clearing the XML path if file is missing
     */
    const handleIdeIntegrationError = async (errorMessage: string, filePath: string) => {
        if (errorMessage.includes("File not found") && activeSessionId) {
            console.log(`XML file not found: ${filePath}, clearing from session`);
            await clearSessionXmlPathAction(activeSessionId);
            
            // Refresh data by triggering a refetch
            setTimeout(() => {
                fetchSessionData();
            }, 500);
            
            toast({
                variant: "destructive",
                title: "File Not Found",
                description: "The XML file was missing and has been cleared from the session."
            });
        }
    };

    // Determine the send button state - only disable if there's no prompt
    const isSendDisabled = !prompt?.trim();

    // Get all requests with the newest first, including pending ones
    // Use debouncedSessionData to avoid flicker during rapid updates
    const requests = debouncedSessionData?.geminiRequests || [];
    const sortedRequests = [...pendingRequests, ...requests]
        .sort((a, b) => (b.startTime || Date.now()) - (a.startTime || Date.now()));

    // Count of requests by status for displaying in UI
    const runningRequestsCount = sortedRequests.filter(req => req.status === 'running').length;
    const queuedRequestsCount = sortedRequests.filter(req => req.status === 'preparing').length;
    const hasRunningRequests = runningRequestsCount > 0;
    const processingRequestsCount = runningRequestsCount - queuedRequestsCount;

    // Provide context value
    const contextValue = useMemo(() => ({
        resetProcessorState
    }), [resetProcessorState]);
    
    // Add this function before the return statement
    const renderRequestItem = (request: any, index: number) => {
        const isProcessing = request.status === 'running';
        const isCompleted = request.status === 'completed';
        const isFailed = request.status === 'failed';
        const isCanceled = request.status === 'canceled';
        const isPending = 'isPending' in request && request.isPending === true;
        const isPreparing = request.status === 'preparing';

        return (
            <div key={request.id || index} 
                className={`flex flex-col border-b last:border-b-0 p-3 ${
                    isPending ? 'bg-blue-50/30' : 
                    isCompleted ? 'bg-green-50/30' :
                    isFailed ? 'bg-red-50/30' :
                    isCanceled ? 'bg-orange-50/30' : ''
                }`}>
                {/* Pending indicator badge */}
                {isPending && (
                    <div className="absolute top-2 right-2">
                        <span
                            className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded-sm flex items-center">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Starting...
                        </span>
                    </div>
                )}

                <div className="flex items-start gap-3">
                    {/* Status Icon with appropriate visual feedback */}
                    <div className={`mt-1 flex-shrink-0 p-1 rounded-full ${
                        isProcessing || isPending ? 'bg-blue-100' :
                        isCompleted ? 'bg-green-100' :
                        isFailed ? 'bg-red-100' :
                        'bg-orange-100'
                    }`}>
                        {(isProcessing || isPending) &&
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600"/>}
                        {isCompleted && <CheckCircle className="h-4 w-4 text-green-600"/>}
                        {isFailed && <AlertCircle className="h-4 w-4 text-red-600"/>}
                        {isCanceled && <XOctagon className="h-4 w-4 text-orange-600"/>}
                    </div>

                    {/* Request Details */}
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <span className={`font-medium text-sm ${
                                isFailed ? 'text-red-600' :
                                    isCanceled ? 'text-orange-600' :
                                        isCompleted ? 'text-green-600' :
                                            (isProcessing || isPreparing || isPending) ? 'text-blue-600' :
                                                'text-muted-foreground'
                            }`}>
                                {isPending || isPreparing ? 'Preparing' :
                                    isProcessing ? 'Processing' :
                                        isCompleted ? 'Completed' :
                                            isFailed ? 'Failed' :
                                                'Canceled'}
                            </span>
                            <span
                                className="text-xs text-muted-foreground flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full">
                                <Clock className="h-3 w-3 flex-shrink-0"/>
                                {isPending ? 'Just started' : requestTimers[request.id] || 'Just started'}
                            </span>
                        </div>

                        {/* Request ID (shortened) */}
                        <p className="text-xs text-muted-foreground mt-1">
                            ID: {isPending ? 'Pending...' : request.id.substring(0, 8)}...
                        </p>

                        {/* Error Message */}
                        {request.statusMessage && (isFailed || isCanceled || (isCompleted && !request.xmlPath && request.statusMessage !== 'Gemini processing completed successfully.')) && ( // Only show completion message if it's an error/warning
                            <p className="text-sm text-red-600 mt-1">{request.statusMessage}</p>
                        )}

                        {/* Stream Stats */}
                        {(isProcessing || isCompleted) && (request.tokensReceived > 0 || request.charsReceived > 0) && (
                            <div className="text-xs text-muted-foreground mt-2 flex gap-3">
                                <span>Tokens: {request.tokensReceived}</span>
                                <span>Characters: {request.charsReceived}</span>
                            </div>
                        )}

                        {/* XML Changes File Path with IDE Integration and Apply Button */}
                        {request.xmlPath && ( // xmlPath refers to the XML change file
                            <div className="mt-2 text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                        className="font-mono bg-muted p-1 rounded truncate max-w-[300px]">
                                        {normalizePath(request.xmlPath)}
                                    </span>
                                    <div className="flex gap-2 items-center">
                                        <IdeIntegration
                                            filePath={request.xmlPath}
                                            onError={(msg) => handleIdeIntegrationError(msg, request.xmlPath)}
                                        />
                                        
                                        {/* Only show Apply button for completed requests with valid xmlPath */}
                                        {request.status === 'completed' && (
                                            <Button 
                                                className="px-2 py-1 h-7 text-xs"
                                                variant="outline"
                                                onClick={() => handleApplyXmlChanges(request.id, request.xmlPath)}
                                                disabled={applyingXmlId === request.id}
                                            >
                                                {applyingXmlId === request.id ? (
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                )}
                                                Apply
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Show Apply results if available for this request */}
                        {applyResult && applyResult.requestId === request.id && (
                            <div className={`mt-2 text-xs p-2 rounded-md ${
                                applyResult.isSuccess ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                            }`}>
                                <p className={`font-medium ${applyResult.isSuccess ? 'text-green-700' : 'text-red-700'}`}>
                                    {applyResult.message}
                                </p>
                                
                                {applyResult.changes.length > 0 && (
                                    <div className="mt-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => toggleShowChanges(request.id)}
                                            className="text-xs p-0 h-auto mb-1 font-medium"
                                        >
                                            {showChangesMap[request.id] ? "Hide Details" : "Show Details"}
                                            {showChangesMap[request.id] ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                                        </Button>
                                        
                                        {showChangesMap[request.id] && (
                                            <ul className="space-y-1 max-h-32 overflow-y-auto bg-white/50 p-1 rounded text-xs">
                                                {applyResult.changes.map((change, idx) => (
                                                    <li key={idx} className={
                                                        change.startsWith("Error") || change.startsWith("Warning") 
                                                            ? "text-amber-600" 
                                                            : "text-foreground"
                                                    }>
                                                        {change}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        {/* Cancel Button (only when running or preparing) */}
                        {isProcessing && !isPending && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelRequest(request.id)}
                                disabled={isLoading}
                                title="Cancel processing"
                                className="bg-white border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                                <XOctagon className="h-3 w-3 mr-1"/>
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>

                {/* Add this before the closing div of the request item */}
                {isProcessing && request.tokensReceived > 0 && (
                    <div className="mt-2 w-full">
                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-500 rounded-full animate-pulse"
                                style={{ 
                                    width: `${Math.min(100, request.tokensReceived / 10)}%`,
                                    transition: 'width 0.5s ease-in-out' 
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <GeminiProcessorContext.Provider value={contextValue}>
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card shadow-sm w-full">
                {/* Send Button with cooldown indicator */}
                <div className="flex flex-col items-center">
                    <Button
                        onClick={handleSendToGemini}
                        disabled={!prompt?.trim()}
                        className="px-6 py-3 text-base"
                        title={!prompt?.trim() ? "Generate a prompt first" : "Send to Gemini"}
                    >
                        <Save className="mr-2 h-5 w-5"/>
                        Send to Gemini
                    </Button>

                    {/* Cooldown indicator */}
                    {cooldownRemaining > 0 && prompt?.trim() && (
                        <p className="text-xs text-amber-600 mt-1">
                            Please wait {cooldownRemaining}s before sending another request
                        </p>
                    )}

                    {/* Info about multiple requests */}
                    {!cooldownRemaining && sortedRequests.filter(req => req.status === 'running').length > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                            {sortedRequests.filter(req => req.status === 'running').length > 1
                                ? `Multiple requests are running - they will be processed in parallel`
                                : `You can send multiple requests simultaneously - they will be queued if needed`}
                        </p>
                    )}
                </div>

                {/* Processing Request List - Show if we have pending or regular requests */}
                {sortedRequests.length > 0 && (
                    <div className="w-full border rounded-md overflow-hidden shadow-sm">
                        <div
                            className="bg-muted px-3 py-2 font-medium text-sm border-b flex justify-between items-center">
                            <span className="flex items-center">
                                <span className="font-semibold">Processing Requests</span>
                                <span className="ml-2 text-sm text-muted-foreground">({sortedRequests.length})</span>
                                {hasRunningRequests && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        {processingRequestsCount > 0 && (
                                            <span className="flex items-center">
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                {processingRequestsCount} Active
                                            </span>
                                        )}
                                        {queuedRequestsCount > 0 && (
                                            <span className="ml-1 flex items-center text-amber-700">
                                                <Clock className="h-3 w-3 mr-1" />
                                                {queuedRequestsCount} Queued
                                            </span>
                                        )}
                                    </span>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        // Toggle collapsed state
                                        setIsRequestsCollapsed(!isRequestsCollapsed)
                                    }}
                                    title={isRequestsCollapsed ? "Expand" : "Collapse"}
                                    className="h-7 w-7 p-0"
                                >
                                    {isRequestsCollapsed ? 
                                        <ChevronDown className="h-4 w-4" /> : 
                                        <ChevronUp className="h-4 w-4" />
                                    }
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={fetchSessionData}
                                    disabled={isLoading}
                                    title="Refresh Status"
                                    className="h-7 w-7 p-0"
                                >
                                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>
                                </Button>
                            </div>
                        </div>
                        {!isRequestsCollapsed && (
                            <div className="max-h-64 overflow-y-auto">
                                {/* Add this grouping logic */}
                                {(() => {
                                    // Group requests by status
                                    const runningRequests = sortedRequests.filter(r => r.status === 'running' || r.status === 'preparing' || ('isPending' in r && r.isPending));
                                    const completedRequests = sortedRequests.filter(r => r.status === 'completed');
                                    const failedOrCanceledRequests = sortedRequests.filter(r => r.status === 'failed' || r.status === 'canceled');
                                    
                                    // Render groups only if they have items
                                    return (
                                        <>
                                            {runningRequests.length > 0 && (
                                                <div>
                                                    <div className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium border-b">
                                                        Active ({runningRequests.length})
                                                    </div>
                                                    {runningRequests.map((request, index) => renderRequestItem(request, index))}
                                                </div>
                                            )}
                                            
                                            {completedRequests.length > 0 && (
                                                <div>
                                                    <div className="px-3 py-1 bg-green-50 text-green-700 text-xs font-medium border-b">
                                                        Completed ({completedRequests.length})
                                                    </div>
                                                    {completedRequests.map((request, index) => renderRequestItem(request, index))}
                                                </div>
                                            )}
                                            
                                            {failedOrCanceledRequests.length > 0 && (
                                                <div>
                                                    <div className="px-3 py-1 bg-red-50 text-red-700 text-xs font-medium border-b">
                                                        Failed/Canceled ({failedOrCanceledRequests.length})
                                                    </div>
                                                    {failedOrCanceledRequests.map((request, index) => renderRequestItem(request, index))}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* General actions */}
                {hasRunningRequests && (
                    <div className="w-full flex justify-end mt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCancelAllRequests}
                            disabled={isLoading}
                            title="Cancel all running requests"
                            className={`bg-white border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 ${
                                sortedRequests.filter(req => req.status === 'running').length > 1 ? "animate-pulse" : ""
                            }`}
                        >
                            <XOctagon className="h-4 w-4 mr-1"/>
                            Cancel All{runningRequestsCount > 1 ?
                            ` (${processingRequestsCount > 0 ? `${processingRequestsCount} Active` : ''}${processingRequestsCount > 0 && queuedRequestsCount > 0 ? ', ' : ''}${queuedRequestsCount > 0 ? `${queuedRequestsCount} Queued` : ''})` :
                            ""}
                        </Button>
                    </div>
                )}

                {/* Show general component-level errors */}
                {errorMessage && (
                    <div
                        className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-red-600 flex items-center justify-center gap-1 break-words max-w-full">
                        <AlertCircle className="h-4 w-4 flex-shrink-0 mr-1"/> {errorMessage}
                    </div>
                )}
            </div>
        </GeminiProcessorContext.Provider>
    );
}
