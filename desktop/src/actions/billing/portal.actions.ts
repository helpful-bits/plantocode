import { invoke } from '@tauri-apps/api/core';

/**
 * Open the Stripe billing portal for the user
 * This is the single entry point for all billing portal actions.
 * Redirects the user to Stripe's hosted billing portal where they can
 * manage their subscription, payment methods, invoices, and all billing settings.
 */
export async function openBillingPortal(): Promise<string> {
  return await invoke<string>('create_billing_portal_session_command');
}