import { invoke } from '@tauri-apps/api/core';

export interface Invoice {
  id: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  created: number;
  dueDate: number;
  invoicePdfUrl?: string;
}

export interface ListInvoicesResponse {
  invoices: Invoice[];
  totalInvoices: number;
  hasMore: boolean;
}

export async function listInvoices(limit?: number, offset?: number): Promise<ListInvoicesResponse> {
  return await invoke<ListInvoicesResponse>('list_invoices_command', { limit, offset });
}