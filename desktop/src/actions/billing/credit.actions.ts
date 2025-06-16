import { invoke } from '@tauri-apps/api/core';
import type { 
  CreditBalanceResponse, 
  CreditPack, 
  PaymentIntentResponse,
  CreatePaymentIntentRequest 
} from '@/types/tauri-commands';

export type { CreditPack };

export async function getCreditPacks(): Promise<CreditPack[]> {
  return await invoke<CreditPack[]>('get_credit_packs_command');
}

export async function getCreditBalance(): Promise<CreditBalanceResponse> {
  return await invoke<CreditBalanceResponse>('get_credit_balance_command');
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
