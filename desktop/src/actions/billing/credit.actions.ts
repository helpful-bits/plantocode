import { invoke } from '@tauri-apps/api/core';
import type { 
  CreditBalanceResponse, 
  CreditPack, 
  PaymentIntentResponse,
  CreatePaymentIntentRequest,
  CreditHistoryResponse,
  CreditDetailsResponse 
} from '@/types/tauri-commands';

export type { CreditPack };

export async function getCreditPacks(): Promise<CreditPack[]> {
  return await invoke<CreditPack[]>('get_credit_packs_command');
}

export async function getCreditDetails(): Promise<CreditDetailsResponse> {
  // TODO: Once the backend implements get_credit_details_command, replace this with:
  // return await invoke<CreditDetailsResponse>('get_credit_details_command');
  
  // For now, we'll combine existing calls to maintain functionality
  const [balanceResponse, historyResponse] = await Promise.all([
    invoke<CreditBalanceResponse>('get_credit_balance_command'),
    invoke<CreditHistoryResponse>('get_credit_history_command', { limit: 10, offset: 0 })
  ]);
  
  return {
    balance: balanceResponse.balance,
    currency: balanceResponse.currency,
    lastUpdated: balanceResponse.lastUpdated || undefined,
    transactions: historyResponse.transactions
  };
}


export async function createCreditPurchaseIntent(
  creditPackId: string,
  savePaymentMethod: boolean = false
): Promise<PaymentIntentResponse> {
  const request: CreatePaymentIntentRequest = {
    creditPackId,
    savePaymentMethod,
  };
  return await invoke<PaymentIntentResponse>('create_credit_payment_intent_command', { ...request });
}
