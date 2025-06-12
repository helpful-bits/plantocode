import { invoke } from '@tauri-apps/api/core';

export interface CreditPack {
  id: string;
  name: string;
  valueCredits: number;
  priceAmount: number;
  currency: string;
  description?: string;
  recommended: boolean;
  bonusPercentage?: number;
  isPopular: boolean;
  displayOrder: number;
}

export interface CreditBalance {
  balance: number;
  currency: string;
  lastUpdated: string;
}

export interface PaymentIntent {
  id?: string; // id is not always present in the create response
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
  description: string;
  status?: string; // status is not in the create response
}

/**
 * Get available credit packs for purchase
 */
export async function getCreditPacks(): Promise<CreditPack[]> {
  return await invoke<CreditPack[]>('get_credit_packs_command');
}

/**
 * Get current credit balance for the user
 */
export async function getCreditBalance(): Promise<CreditBalance> {
  return await invoke<CreditBalance>('get_credit_balance_command');
}

/**
 * Create a PaymentIntent for purchasing credits
 */
export async function purchaseCredits(
  creditPackId: string,
  savePaymentMethod: boolean = false
): Promise<PaymentIntent> {
  return await invoke<PaymentIntent>('create_credit_payment_intent_command', {
    creditPackId,
    savePaymentMethod,
  });
}

