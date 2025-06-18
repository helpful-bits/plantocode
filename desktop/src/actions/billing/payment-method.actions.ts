import { invoke } from '@tauri-apps/api/core';
import type { PaymentMethodsResponse, BillingPortalResponse } from '@/types/tauri-commands';

export async function getPaymentMethods(): Promise<PaymentMethodsResponse> {
  return await invoke<PaymentMethodsResponse>('get_payment_methods_command');
}

export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<void> {
  return await invoke<void>('set_default_payment_method_command', { paymentMethodId });
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<void> {
  return await invoke<void>('detach_payment_method_command', { paymentMethodId });
}

export async function openBillingPortal(): Promise<string> {
  const response = await invoke<BillingPortalResponse>('create_billing_portal_session_command');
  return response.url;
}

