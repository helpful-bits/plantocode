"use client";

import React, { Suspense, useState } from "react";
import { GeminiProcessor } from '@/app/components/gemini-processor/gemini-processor';
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface GeminiSectionProps {
  state: {
    prompt: string;
    activeSessionId?: string | null;
    projectDirectory?: string;
    sessionInitialized?: boolean;
    diffTemperature?: number;
    isGenerating: boolean;
    geminiApiKey?: string;
    geminiResponse?: string;
    isSubmittingToGemini?: boolean;
    geminiErrorMessage?: string;
  };
  actions?: {
    handleSetGeminiApiKey?: (key: string) => void;
    handleSubmitToGemini?: (prompt: string) => Promise<void>;
    handleClearGeminiResponse?: () => void;
  };
}

export default function GeminiSection({ state, actions = {} }: GeminiSectionProps) {
  const { 
    prompt, 
    activeSessionId, 
    projectDirectory, 
    sessionInitialized, 
    diffTemperature,
    isGenerating,
    geminiApiKey,
    geminiResponse,
    isSubmittingToGemini,
    geminiErrorMessage
  } = state;
  
  const {
    handleSetGeminiApiKey,
    handleSubmitToGemini,
    handleClearGeminiResponse
  } = actions;

  const [apiKey, setApiKey] = useState(geminiApiKey || "");

  // Handle API key input changes
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    if (handleSetGeminiApiKey) {
      handleSetGeminiApiKey(value);
    }
  };

  // Handle submission to Gemini
  const handleSubmit = () => {
    if (handleSubmitToGemini && prompt) {
      handleSubmitToGemini(prompt);
    }
  };

  // Handle clearing the response
  const handleClear = () => {
    if (handleClearGeminiResponse) {
      handleClearGeminiResponse();
    }
  };

  return (
    <div className="flex flex-col space-y-4 border p-4 rounded-md">
      <h3 className="text-lg font-medium">Gemini API</h3>

      <div className="space-y-2">
        <Label htmlFor="gemini-api-key">Gemini API Key</Label>
        <Input
          id="gemini-api-key"
          type="password"
          placeholder="Enter your Gemini API key"
          value={apiKey}
          onChange={handleApiKeyChange}
        />
        <p className="text-xs text-muted-foreground">
          Your API key will be used locally and not stored on our servers.
        </p>
      </div>

      {activeSessionId && projectDirectory && sessionInitialized && prompt ? (
        <Suspense fallback={<div>Loading Gemini Processor...</div>}>
          <div className="flex gap-2 justify-end">
            <Button 
              type="button" 
              variant="outline"
              onClick={handleClear}
              disabled={isSubmittingToGemini || !geminiResponse}
            >
              Clear Response
            </Button>
            
            <Button 
              type="button" 
              variant="default"
              onClick={handleSubmit}
              disabled={isSubmittingToGemini || isGenerating || !apiKey}
            >
              {isSubmittingToGemini ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : "Submit to Gemini"}
            </Button>
          </div>
        </Suspense>
      ) : (
        <p className="text-sm text-muted-foreground">
          Please ensure you have an active session, project directory, and prompt before using Gemini.
        </p>
      )}

      {geminiErrorMessage && (
        <div className="bg-destructive/10 p-2 rounded text-sm text-destructive">
          Error: {geminiErrorMessage}
        </div>
      )}

      {geminiResponse && (
        <div className="mt-4">
          <Label>Response:</Label>
          <Textarea 
            className="h-48 mt-1"
            readOnly
            value={geminiResponse}
          />
        </div>
      )}
    </div>
  );
} 