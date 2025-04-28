/**
 * This file contains types for the background jobs system
 */

// WebSocket connection states
export enum WebSocketState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
  FAILED = "failed",
  RECONNECTING = "reconnecting"
}

// Agent status enum
export enum AgentStatus {
  ONLINE = "online",
  BUSY = "busy",
  OFFLINE = "offline"
}

// Define the possible statuses for background jobs processing
export type JobStatus = 'created' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

// Type for API types
export type ApiType = 'gemini' | 'claude' | 'whisper';

// Type for task types
export type TaskType = 
  | 'xml_generation' 
  | 'pathfinder' 
  | 'transcription' 
  | 'regex_generation'
  | 'path_correction'
  | 'text_improvement'
  | 'voice_correction'
  | 'task_enhancement'
  | 'guidance_generation'
  | 'unknown';

// Type for individual background job
export type BackgroundJob = {
    id: string;
    sessionId: string;
    prompt: string;
    status: JobStatus;
    startTime: number | null;
    endTime: number | null;
    xmlPath: string | null;
    statusMessage: string | null;
    tokensReceived: number;
    charsReceived: number;
    lastUpdate: number | null;
    createdAt: string;
    cleared?: boolean; // For history clearing functionality
    type: string;
    updatedAt: string;
    parameters: Record<string, any>;
    apiType: ApiType;
    taskType: TaskType;
    modelUsed: string | null;
    maxOutputTokens: number | null;
};

// Available agent structure
export interface AvailableAgent {
  id: string;
  name: string;
  status: AgentStatus;
  capabilities: string[];
  lastSeen: string;
  metadata?: Record<string, any>;
}

// Background job event types
export type BackgroundJobEventType =
  | 'jobUpdate'
  | 'agentUpdate'
  | 'ping'
  | 'pong';

// Background job event structure
export interface BackgroundJobEvent {
  type: BackgroundJobEventType;
  timestamp: string;
  data: BackgroundJob | AvailableAgent | any;
} 