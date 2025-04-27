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

// Background job status
export type BackgroundJobStatus = 
  | 'created'
  | 'queued'
  | 'running' 
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Background job structure
export interface BackgroundJob {
  id: string;
  type: string;
  status: BackgroundJobStatus;
  progress?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
  assignedTo?: string;
}

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