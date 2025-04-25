"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { sendPromptToGeminiAction } from '@/actions/gemini-actions';
import { useProject } from '@/lib/contexts/project-context';
import { toast } from '@/components/ui/use-toast';

interface GeminiProcessorProps {
    prompt: string;
    model: string;
    temperature?: number;
}

export function GeminiProcessor({ prompt, model, temperature = 0.7 }: GeminiProcessorProps) {
    // Track loading state for send operations
    const [isSending, setIsSending] = useState(false);
    // Add state for tracking last request time to prevent rapid-fire requests
    const [lastRequestTime, setLastRequestTime] = useState<number>(0);
    // Define a cooldown period (2 seconds) to prevent sending requests too quickly
    const COOLDOWN_PERIOD_MS = 2000;
    const { projectDirectory } = useProject();
    const isMountedRef = useRef(true);

    // Cooldown timer update effect
    const cooldownRemaining = Math.max(0, Math.ceil((COOLDOWN_PERIOD_MS - (Date.now() - lastRequestTime)) / 1000));

    // Handle sending prompt to Gemini
    const handleSendToGemini = async () => {
        if (!prompt.trim()) {
            toast({
                title: "Empty prompt",
                description: "Please enter a prompt before sending to Gemini.",
                variant: "destructive",
            });
            return;
        }

        // Prevent rapid-fire requests
        if (Date.now() - lastRequestTime < COOLDOWN_PERIOD_MS) {
            toast({
                title: "Request cooldown",
                description: `Please wait ${cooldownRemaining} seconds before sending another request.`,
                variant: "destructive",
            });
            return;
        }

        try {
            setIsSending(true);
            setLastRequestTime(Date.now());

            // Get the active session ID
            const activeSessionId = sessionStorage.getItem('activeSessionId');
            if (!activeSessionId) {
                throw new Error('No active session found. Please create a session first.');
            }

            // Send the request using the server action
            const result = await sendPromptToGeminiAction(
                prompt,
                activeSessionId,
                Intl.DateTimeFormat().resolvedOptions().timeZone,
                {
                    model,
                    temperature
                }
            );

            if (result.isSuccess) {
                toast({
                    title: "Request sent",
                    description: "Your request has been sent to Gemini. Check the Background Jobs sidebar for status.",
                });
            } else {
                toast({
                    title: "Error sending request",
                    description: result.message || "An unknown error occurred",
                    variant: "destructive",
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to send prompt to Gemini";
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            if (isMountedRef.current) setIsSending(false);
        }
    };

    // Cleanup effect
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return (
        <div className="flex flex-col space-y-4 w-full">
            <div className="flex justify-end">
                <Button 
                    variant="default"
                    onClick={handleSendToGemini}
                    disabled={isSending || !prompt.trim() || cooldownRemaining > 0}
                    className="flex items-center gap-2"
                >
                    {isSending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                        </>
                    ) : cooldownRemaining > 0 ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Wait {cooldownRemaining}s...
                        </>
                    ) : (
                        <>Send to Gemini</>
                    )}
                </Button>
            </div>
        </div>
    );
}
