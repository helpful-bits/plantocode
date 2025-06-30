import { invoke } from '@tauri-apps/api/core';
import type { 
  CreditDetailsResponse,
  CreditHistoryResponse,
  CreditTransactionEntry
} from '@/types/tauri-commands';


export type { CreditHistoryResponse, CreditTransactionEntry };

export async function getCreditDetails(): Promise<CreditDetailsResponse> {
  return await invoke<CreditDetailsResponse>('get_credit_details_command');
}

export async function getCreditHistory(
  limit: number = 10,
  offset: number = 0,
  search?: string
): Promise<CreditHistoryResponse> {
  return await invoke<CreditHistoryResponse>('get_credit_history_command', {
    limit,
    offset,
    search,
  });
}

