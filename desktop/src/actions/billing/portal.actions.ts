import { invoke } from '@tauri-apps/api/core';

/**
 * Open the Stripe billing portal for the user
 * This will redirect the user to Stripe's hosted billing portal
 * where they can manage their subscription, payment methods, and invoices
 */
export async function openBillingPortal(): Promise<string> {
  return await invoke<string>('create_billing_portal_session_command');
}

/**
 * Get the Stripe publishable key for frontend use
 */
export async function getStripePublishableKey(): Promise<string> {
  return await invoke<string>('get_stripe_publishable_key_command');
}