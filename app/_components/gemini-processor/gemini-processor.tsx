"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save, XOctagon, AlertCircle, CheckCircle, RefreshCw, Clock, ExternalLink } from 'lucide-react';
import { sendPromptToGeminiAction, cancelGeminiRequestAction, cancelGeminiProcessingAction } from '@/actions/gemini-actions';
import { resetSessionStateAction, clearSessionPatchPathAction } from '@/actions/session-actions';
import { useDatabase } from '@/lib/contexts/database-context';
import { GeminiRequest, Session } from '@/types';
import { IdeIntegration } from './ide-integration';

interface GeminiProcessorProps {
    prompt: string; 
    activeSessionId: string | null;
}

export function GeminiProcessor({ prompt, activeSessionId }: GeminiProcessorProps) {
    // Track loading state for operations like cancellation, but not for send operations
    const [isLoading, setIsLoading] = useState(false);
    // Add state for tracking last request time to prevent rapid-fire requests
    const [lastRequestTime, setLastRequestTime] = useState<number>(0);
    // Define a cooldown period (2 seconds) to prevent sending requests too quickly
    const COOLDOWN_PERIOD_MS = 2000;
    // Track pending server requests separately
    const [pendingRequests, setPendingRequests] = useState<(GeminiRequest & {isPending?: boolean})[]>([]);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [sessionData, setSessionData] = useState<Session | null>(null);
    const { repository, isInitialized } = useDatabase();
    const isMountedRef = useRef(true);
    
    // Timer state for each request to calculate duration
    const [requestTimers, setRequestTimers] = useState<Record<string, string>>({});

    // --- Request Timer Logic ---
    const updateRequestTimers = useCallback((requests: GeminiRequest[] | undefined) => {
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
        
        setRequestTimers(newTimers);
    }, []);

    // --- Session Data Fetching ---
    const fetchSessionData = useCallback(async () => {
        if (activeSessionId && repository && isInitialized) {
            try {
                if (!isMountedRef.current) return;
                console.log(`[Gemini UI] Fetching session data with requests for ${activeSessionId}...`);
                
                // Clear relevant cache before fetching to get latest status
                repository.clearCacheForSession(activeSessionId);
                
                // Get the session with all requests
                const session = await repository.getSessionWithRequests(activeSessionId);
                if (!isMountedRef.current) return;

                setSessionData(session);
                
                if (session) {
                    // Update timers for all requests
                    updateRequestTimers(session.geminiRequests);
                    
                    // Clear general error if not in a failed state
                    if (session.geminiStatus !== 'failed' && session.geminiStatus !== 'canceled') {
                        setErrorMessage("");
                    }
                } else {
                    setErrorMessage("Active session not found.");
                }
            } catch (error) {
                setErrorMessage("Failed to load session details.");
                console.error("[Gemini UI] Error fetching session details:", error);
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
        }

        return () => {
            isMountedRef.current = false;
        };
    }, [activeSessionId, repository, isInitialized, fetchSessionData]);

    // Timer update effect
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;
        
        // Check if there are any running requests
        const hasRunningRequests = sessionData?.geminiRequests?.some(req => req.status === 'running');
        
        if (hasRunningRequests) {
            intervalId = setInterval(() => {
                if (isMountedRef.current) {
                    // Update timers for all requests
                    updateRequestTimers(sessionData?.geminiRequests);
                }
            }, 1000); // Update timers every second
        }
        
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [sessionData?.geminiRequests, updateRequestTimers]);
    
    // Cooldown timer update effect
    const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
    
    useEffect(() => {
        // Only run timer if we're in cooldown period
        const initialRemaining = lastRequestTime ? 
            Math.max(0, Math.ceil((COOLDOWN_PERIOD_MS - (Date.now() - lastRequestTime)) / 1000)) : 0;
        
        if (initialRemaining <= 0) {
            setCooldownRemaining(0);
            return;
        }
        
        setCooldownRemaining(initialRemaining);
        
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
        } catch (error) {
            console.error('[Gemini UI] Error resetting session state:', error);
            setErrorMessage("Failed to reset session state.");
        } finally {
            setIsLoading(false);
        }
    }, [activeSessionId, fetchSessionData]);

    // Handler for sending to Gemini
    const handleSendToGemini = useCallback(async () => {
        if (!prompt || !activeSessionId || !repository) {
            setErrorMessage("Cannot send: Missing prompt or active session.");
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
        const pendingRequest: GeminiRequest & {isPending?: boolean} = {
            id: tempRequestId,
            sessionId: activeSessionId,
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''), // Truncate for display
            status: 'running',
            createdAt: Date.now(),
            startTime: Date.now(),
            isPending: true,
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
            
            // Remove the pending request since we'll get the real one from the server
            setPendingRequests(prev => prev.filter(r => r.id !== tempRequestId));
            
            // Fetch the updated session data to show the real request
            await fetchSessionData();
            
            if (!result.isSuccess) {
                console.error(`[Gemini UI] Failed to start Gemini processing: ${result.message}`);
                
                // Special handling for API key missing
                if (result.message?.includes("GEMINI_API_KEY is not configured")) {
                    setErrorMessage("API key missing: Please configure the GEMINI_API_KEY environment variable.");
                } else if (result.message?.includes("Gemini processing was canceled")) {
                    // Enhanced error message for cancellation
                    setErrorMessage("Request was canceled: Another request may already be in progress. Please try again in a few seconds.");
                } else if (result.message?.includes("API rate limit")) {
                    // Special message for API rate limits
                    setErrorMessage("API rate limit reached: Too many requests in a short time. Please wait a moment before sending more.");
                } else if (result.message?.includes("queued")) {
                    // Message for queued requests
                    setErrorMessage("Your request has been queued and will be processed as soon as possible.");
                } else {
                    setErrorMessage(result.message || "Failed to start Gemini processing.");
                }
            }
        } catch (error) {
            console.error("[Gemini UI] Error during send:", error);
            setErrorMessage(error instanceof Error ? error.message : "An unexpected error occurred.");
            
            // Remove the pending request on error
            setPendingRequests(prev => prev.filter(r => r.id !== tempRequestId));
            
            // Fetch session data to ensure UI is up-to-date
            await fetchSessionData();
        }
        
        console.log("[Gemini UI] Finished send request processing");
    }, [prompt, activeSessionId, repository, fetchSessionData, sessionData, cooldownRemaining]);

    // Handler for canceling a specific request
    const handleCancelRequest = useCallback(async (requestId: string) => {
        if (!requestId || !repository) {
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

    // Handler for canceling all running requests for the session
    const handleCancelAllRequests = useCallback(async () => {
        if (!sessionData?.id || !repository) {
            return;
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

    // Handler for IDE integration error
    const handleIdeIntegrationError = useCallback(async (errorMsg: string, patchPath: string | null) => {
        if (errorMsg.includes('File not found') && patchPath) {
            setErrorMessage(`Patch file not found: ${patchPath}`);
            await fetchSessionData();
        } else {
            setErrorMessage(`Error opening file: ${errorMsg}`);
        }
    }, [fetchSessionData]);

    // Determine the send button state - only disable if there's no prompt
    const isSendDisabled = !prompt?.trim();

    // Get all requests with the newest first, including pending ones
    const requests = sessionData?.geminiRequests || [];
    const allRequests = [...pendingRequests, ...requests];
    const sortedRequests = [...allRequests].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    // Check if there's at least one running request
    const hasRunningRequests = sortedRequests.some(req => req.status === 'running');
    
    // Count running and queued requests
    const runningRequestsCount = sortedRequests.filter(req => req.status === 'running').length;
    const queuedRequestsCount = sortedRequests.filter(req => req.status === 'running' && (!req.tokensReceived || req.tokensReceived === 0)).length;
    const processingRequestsCount = runningRequestsCount - queuedRequestsCount;

    return (
        <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-card shadow-sm w-full">
            {/* Send Button with cooldown indicator */}
            <div className="flex flex-col items-center">
                <Button
                    onClick={handleSendToGemini} 
                    disabled={!prompt?.trim()}
                    className="px-6 py-3 text-base"
                    title={!prompt?.trim() ? "Generate a prompt first" : "Send to Gemini"}
                >
                    <Save className="mr-2 h-5 w-5" />
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
                <div className="w-full border rounded-md overflow-hidden">
                    <div className="bg-muted px-3 py-2 font-medium text-sm border-b flex justify-between items-center">
                        <span>
                            Processing Requests ({sortedRequests.length})
                            {hasRunningRequests && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                    {processingRequestsCount > 0 && (
                                        <span className="mr-1">{processingRequestsCount} Active</span>
                                    )}
                                    {queuedRequestsCount > 0 && (
                                        <span className="text-amber-700">{queuedRequestsCount} Queued</span>
                                    )}
                                </span>
                            )}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={fetchSessionData}
                            disabled={isLoading}
                            title="Refresh Status"
                            className="h-7 w-7 p-0"
                        >
                            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {sortedRequests.map((request) => {
                            const isProcessing = request.status === 'running';
                            const isCompleted = request.status === 'completed';
                            const isFailed = request.status === 'failed';
                            const isCanceled = request.status === 'canceled';
                            const isPending = 'isPending' in request && request.isPending === true;
                            
                            return (
                                <div key={request.id} className="p-3 border-b last:border-b-0 relative">
                                    {/* Pending indicator badge */}
                                    {isPending && (
                                        <div className="absolute top-2 right-2">
                                            <span className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded-sm">
                                                Starting...
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-start gap-3">
                                        {/* Status Icon */}
                                        <div className="mt-1">
                                            {(isProcessing || isPending) && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                                            {isCompleted && <CheckCircle className="h-4 w-4 text-green-600" />}
                                            {isFailed && <AlertCircle className="h-4 w-4 text-red-600" />}
                                            {isCanceled && <XOctagon className="h-4 w-4 text-orange-600" />}
                                        </div>
                                        
                                        {/* Request Details */}
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className={`font-medium ${
                                                    isFailed ? 'text-red-600' : 
                                                    isCanceled ? 'text-orange-600' : 
                                                    isCompleted ? 'text-green-600' : 
                                                    'text-blue-600'
                                                }`}>
                                                    {isPending ? 'Initializing' :
                                                     isProcessing && !request.tokensReceived ? 'Queued' : 
                                                     isProcessing ? 'Processing' : 
                                                     isCompleted ? 'Completed' : 
                                                     isFailed ? 'Failed' : 
                                                     'Canceled'}
                                                </span>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {isPending ? 'Just started' : requestTimers[request.id] || 'Just started'}
                                                </span>
                                            </div>
                                            
                                            {/* Request ID */}
                                            <p className="text-xs text-muted-foreground mt-1">
                                                ID: {isPending ? 'Pending...' : request.id.substring(0, 8)}...
                                            </p>
                                            
                                            {/* Error Message */}
                                            {request.statusMessage && (isFailed || isCanceled) && (
                                                <p className="text-sm text-red-600 mt-1">{request.statusMessage}</p>
                                            )}
                                            
                                            {/* Stream Stats */}
                                            {(isProcessing || isCompleted) && (request.tokensReceived > 0 || request.charsReceived > 0) && (
                                                <div className="text-xs text-muted-foreground mt-2 flex gap-3">
                                                    <span>Tokens: {request.tokensReceived}</span>
                                                    <span>Characters: {request.charsReceived}</span>
                                                </div>
                                            )}
                                            
                                            {/* File Path with IDE Integration */}
                                            {request.patchPath && (
                                                <div className="mt-2 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono bg-muted p-1 rounded truncate max-w-[300px]">
                                                            {request.patchPath}
                                                        </span>
                                                        <IdeIntegration 
                                                            filePath={request.patchPath} 
                                                            onError={(msg) => handleIdeIntegrationError(msg, request.patchPath)} 
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Action Buttons */}
                                        <div className="flex gap-2">
                                            {/* Cancel Button (only when running and not pending) */}
                                            {isProcessing && !isPending && (
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="sm" 
                                                    onClick={() => handleCancelRequest(request.id)}
                                                    disabled={isLoading}
                                                    title="Cancel processing"
                                                >
                                                    <XOctagon className="h-3 w-3 mr-1" />
                                                    Cancel
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* General actions */}
            {hasRunningRequests && (
                <div className="w-full flex justify-end mt-2">
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleCancelAllRequests}
                        disabled={isLoading}
                        title="Cancel all running requests"
                        className={sortedRequests.filter(req => req.status === 'running').length > 1 ? "animate-pulse" : ""}
                    >
                        <XOctagon className="h-4 w-4 mr-1" />
                        Cancel All{runningRequestsCount > 1 ? 
                            ` (${processingRequestsCount > 0 ? `${processingRequestsCount} Active` : ''}${processingRequestsCount > 0 && queuedRequestsCount > 0 ? ', ' : ''}${queuedRequestsCount > 0 ? `${queuedRequestsCount} Queued` : ''})` : 
                            ""}
                    </Button>
                </div>
            )}

            {/* Show general component-level errors */}
            {errorMessage && (
                <div className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-red-600 flex items-center justify-center gap-1 break-words max-w-full">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mr-1" /> {errorMessage}
                </div>
            )}
        </div>
    );
}
