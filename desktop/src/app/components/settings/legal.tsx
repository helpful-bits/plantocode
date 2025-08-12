"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { createLogger } from "@/utils/logger";
import { open } from "@/utils/shell-utils";

const logger = createLogger({ namespace: "Legal" });

export default function Legal() {
  // Helper function to open external URLs
  const openExternal = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      logger.error('Failed to open external URL:', error);
      // Fallback if Tauri shell fails
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    openExternal(url);
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Review important legal information and third-party policies that apply to your use of Vibe Manager.
      </div>
      
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Legal</CardTitle>
          <CardDescription>
            Our terms of service and privacy policy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <button
              onClick={(e) => handleLinkClick(e, "https://vibemanager.app/terms")}
              className="block text-primary underline hover:opacity-80 transition-opacity"
              aria-label="Open Terms of Service in browser"
            >
              Terms of Service
            </button>
            <button
              onClick={(e) => handleLinkClick(e, "https://vibemanager.app/privacy")}
              className="block text-primary underline hover:opacity-80 transition-opacity"
              aria-label="Open Privacy Policy in browser"
            >
              Privacy Policy
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Third-Party AI Providers</CardTitle>
          <CardDescription>
            Legal policies for AI providers that may be used in your workflows
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">OpenAI</h4>
              <div className="space-y-1">
                <button
                  onClick={(e) => handleLinkClick(e, "https://openai.com/policies/terms-of-use")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open OpenAI Terms of Use in browser"
                >
                  Terms of Use
                </button>
                <button
                  onClick={(e) => handleLinkClick(e, "https://openai.com/policies/privacy-policy")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open OpenAI Privacy Policy in browser"
                >
                  Privacy Policy
                </button>
                <button
                  onClick={(e) => handleLinkClick(e, "https://openai.com/policies/usage-policies")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open OpenAI Usage Policies in browser"
                >
                  Usage Policies
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Google AI (Gemini)</h4>
              <div className="space-y-1">
                <button
                  onClick={(e) => handleLinkClick(e, "https://ai.google.dev/terms")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open Google AI Terms in browser"
                >
                  Terms of Service
                </button>
                <button
                  onClick={(e) => handleLinkClick(e, "https://policies.google.com/privacy")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open Google Privacy Policy in browser"
                >
                  Privacy Policy
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">xAI (Grok)</h4>
              <div className="space-y-1">
                <button
                  onClick={(e) => handleLinkClick(e, "https://x.ai/legal")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open xAI Terms in browser"
                >
                  Terms of Service
                </button>
                <button
                  onClick={(e) => handleLinkClick(e, "https://x.ai/legal/privacy-policy")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open xAI Privacy Policy in browser"
                >
                  Privacy Policy
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">OpenRouter</h4>
              <div className="space-y-1">
                <button
                  onClick={(e) => handleLinkClick(e, "https://openrouter.ai/terms")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open OpenRouter Terms in browser"
                >
                  Terms of Service
                </button>
                <button
                  onClick={(e) => handleLinkClick(e, "https://openrouter.ai/privacy")}
                  className="block text-sm text-primary underline hover:opacity-80 transition-opacity"
                  aria-label="Open OpenRouter Privacy Policy in browser"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground border-t border-border pt-4">
            <p>
              Depending on your model selection, workflows may route to specific providers. 
              Use of these features requires adherence to the respective provider policies.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}