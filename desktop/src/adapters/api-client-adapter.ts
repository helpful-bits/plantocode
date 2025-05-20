// Placeholder for API client adapter logic
// This adapter will be responsible for all communication
// with the Rust server proxy for AI tasks, billing, etc.

import { invoke } from "@tauri-apps/api/core";

import {
  createSuccessActionState,
  handleActionError,
} from "@/utils/action-utils";

import type { ActionState } from "@/types";

const SERVER_PROXY_COMMAND = "proxy_request_command"; // Example command name

interface ProxyRequestParams {
  endpoint: string; // e.g., '/openai/chat/completions'
  method: "GET" | "POST" | "PUT" | "DELETE";
  payload?: Record<string, unknown>;
  authToken?: string; // Firebase ID token
}

interface ProxyResponseData {
  // Define expected response structure from the server proxy
  [key: string]: unknown;
}

/**
 * Sends a request through the Tauri server proxy.
 * @param params - The parameters for the proxy request.
 * @returns An ActionState with the proxy response.
 */
export async function callServerProxy<T = ProxyResponseData>(
  params: ProxyRequestParams
): Promise<ActionState<T>> {
  try {
    const response = await invoke<T>(
      SERVER_PROXY_COMMAND,
      { ...params } // Convert to a plain object without losing type information
    );
    return createSuccessActionState(response);
  } catch (error) {
    return handleActionError(error, `callServerProxy.${params.endpoint}`) as ActionState<T>;
  }
}

// Example usage for an OpenRouter client adapter function
export class OpenRouterClientAdapter {
  private authToken: string | null = null;

  constructor(authToken?: string) {
    if (authToken) {
      this.setAuthToken(authToken);
    }
  }

  public setAuthToken(token: string): void {
    this.authToken = token;
  }

  public async generateChatCompletion(payload: Record<string, unknown>): Promise<ActionState<Record<string, unknown>>> {
    if (!this.authToken) {
      return {
        isSuccess: false,
        message: "Authentication token not set for OpenRouterClientAdapter.",
        error: new Error("Auth token missing."),
      };
    }
    return callServerProxy({
      endpoint: "/openrouter/chat/completions", // Adjust if your server proxy has a different path
      method: "POST",
      payload,
      authToken: this.authToken,
    });
  }
}

// Add other adapter classes or functions as needed (e.g., for config, DB, FS interactions if they pass through this layer)
