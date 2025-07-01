import { invoke } from '@tauri-apps/api/core';

export interface Invoice {
  id: string;
  created: number;
  dueDate?: number;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  invoicePdfUrl?: string;
}

export interface ListInvoicesResponse {
  invoices: Invoice[];
  hasMore: boolean;
}

export async function listInvoices(limit?: number, offset?: number): Promise<ListInvoicesResponse> {
  return await invoke<ListInvoicesResponse>('list_invoices_command', { limit, offset });
}

export async function downloadInvoicePdf(invoiceId: string, pdfUrl: string): Promise<string> {
  return await invoke<string>('download_invoice_pdf_command', { invoiceId, pdfUrl });
}

export async function revealFileInExplorer(filePath: string): Promise<void> {
  return await invoke<void>('reveal_file_in_explorer_command', { filePath });
}