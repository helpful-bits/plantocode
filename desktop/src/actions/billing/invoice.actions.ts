import { invoke } from '@tauri-apps/api/core';

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
  dueDate?: number;
  paidAt?: number;
  description?: string;
  invoiceUrl?: string;
  invoicePdf?: string;
}

export interface ListInvoicesResponse {
  invoices: Invoice[];
  totalCount: number;
  hasMore: boolean;
}

export async function listInvoices(limit?: number, offset?: number): Promise<ListInvoicesResponse> {
  return await invoke<ListInvoicesResponse>('list_invoices_command', { limit, offset });
}