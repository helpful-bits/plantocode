import { invoke } from '@tauri-apps/api/core';

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export async function createCreditCheckoutSession(
  amount: number
): Promise<CheckoutSessionResponse> {
  return await invoke<CheckoutSessionResponse>('create_credit_checkout_session_command', {
    amount,
  });
}

export async function createSubscriptionCheckoutSession(planId: string): Promise<CheckoutSessionResponse> {
  return await invoke<CheckoutSessionResponse>('create_subscription_checkout_session_command', {
    planId,
  });
}

export async function createSetupCheckoutSession(): Promise<CheckoutSessionResponse> {
  return await invoke<CheckoutSessionResponse>('create_setup_checkout_session_command');
}


export interface CheckoutSessionStatusResponse {
  status: string;
  paymentStatus: string;
  customerEmail?: string;
}

export async function getCheckoutSessionStatus(sessionId: string): Promise<CheckoutSessionStatusResponse> {
  return await invoke<CheckoutSessionStatusResponse>('get_checkout_session_status_command', {
    sessionId,
  });
}