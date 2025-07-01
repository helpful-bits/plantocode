import { invoke } from '@tauri-apps/api/core';

export interface DetailedUsage {
  serviceName: string;
  modelDisplayName: string;
  providerCode: string;
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface UsageSummary {
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface DetailedUsageResponse {
  detailedUsage: DetailedUsage[];
  summary: UsageSummary;
}


export async function getDetailedUsageWithSummary(
  startDate: string,
  endDate: string
): Promise<DetailedUsageResponse> {
  return await invoke<DetailedUsageResponse>('get_detailed_usage_with_summary_command', { startDate, endDate });
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