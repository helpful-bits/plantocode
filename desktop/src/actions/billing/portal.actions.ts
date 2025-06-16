import { invoke } from '@tauri-apps/api/core';

interface BillingPortalResponse {
  url: string;
}

export async function openBillingPortal(): Promise<string> {
  const response = await invoke<BillingPortalResponse>('create_billing_portal_session_command');
  return response.url;
}