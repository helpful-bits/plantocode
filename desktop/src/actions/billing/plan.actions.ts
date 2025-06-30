import { invoke } from '@tauri-apps/api/core';

export interface DetailedUsage {
  serviceName: string;
  modelDisplayName: string;
  providerCode: string;
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
}

export async function getDetailedUsage(
  startDate: string,
  endDate: string
): Promise<DetailedUsage[]> {
  return await invoke<DetailedUsage[]>('get_detailed_usage_command', { startDate, endDate });
}


export interface AutoTopOffSettings {
  enabled: boolean;
  threshold?: number;
  amount?: number;
}

export interface UpdateAutoTopOffRequest {
  enabled: boolean;
  threshold?: number;
  amount?: number;
}

export async function getAutoTopOffSettings(): Promise<AutoTopOffSettings> {
  return await invoke<AutoTopOffSettings>('get_auto_top_off_settings_command');
}

export async function updateAutoTopOffSettings(settings: UpdateAutoTopOffRequest): Promise<AutoTopOffSettings> {
  return await invoke<AutoTopOffSettings>('update_auto_top_off_settings_command', { request: settings });
}