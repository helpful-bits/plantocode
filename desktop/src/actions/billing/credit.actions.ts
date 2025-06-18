import { invoke } from '@tauri-apps/api/core';
import type { 
  CreditBalanceResponse,
  CreditHistoryResponse,
  CreditTransactionEntry
} from '@/types/tauri-commands';

export interface CreditPack {
  id: string;
  name: string;
  valueCredits: number;
  priceAmount: number;
  currency: string;
  description?: string;
  recommended: boolean;
  bonusPercentage?: number;
  isPopular?: boolean;
  isActive: boolean;
  displayOrder: number;
  stripePriceId: string;
}

export type { CreditHistoryResponse, CreditTransactionEntry };

export async function getCreditDetails(): Promise<CreditBalanceResponse> {
  return await invoke<CreditBalanceResponse>('get_credit_balance_command');
}

export async function getCreditHistory(
  limit: number = 10,
  offset: number = 0
): Promise<CreditHistoryResponse> {
  return await invoke<CreditHistoryResponse>('get_credit_history_command', {
    limit,
    offset,
  });
}

export async function getCreditPacks(): Promise<CreditPack[]> {
  return await invoke<CreditPack[]>('get_credit_packs_command');
}
