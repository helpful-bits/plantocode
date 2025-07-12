import { invoke } from '@tauri-apps/api/core';
import type { 
  CreditDetailsResponse,
  CreditHistoryResponse,
  CreditTransactionEntry,
  UnifiedCreditHistoryResponse,
  UnifiedCreditHistoryEntry,
  PaymentMethodsResponse,
  BillingPortalResponse
} from '@/types/tauri-commands';

// Credit types
export type { CreditHistoryResponse, CreditTransactionEntry, UnifiedCreditHistoryResponse, UnifiedCreditHistoryEntry };

// Credit actions
export async function getCreditDetails(): Promise<CreditDetailsResponse> {
  return await invoke<CreditDetailsResponse>('get_credit_details_command');
}

export async function getCreditHistory(
  limit: number = 10,
  offset: number = 0,
  search?: string
): Promise<UnifiedCreditHistoryResponse> {
  return await invoke<UnifiedCreditHistoryResponse>('get_credit_history_command', {
    limit,
    offset,
    search,
  });
}

// Plan/Usage types and actions
export interface DetailedUsage {
  serviceName: string;
  modelDisplayName: string;
  providerCode: string;
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheWriteTokens: number;
  totalCacheReadTokens: number;
}

export interface UsageSummary {
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheWriteTokens: number;
  totalCacheReadTokens: number;
}

export interface DetailedUsageResponse {
  detailedUsage: DetailedUsage[];
  summary: UsageSummary;
}

export async function getDetailedUsageWithSummary(
  startDate: string,
  endDate: string
): Promise<DetailedUsageResponse> {
  return await invoke<DetailedUsageResponse>('get_detailed_usage_with_summary_command', { startDate, endDate });
}

export interface AutoTopOffSettings {
  enabled: boolean;
  threshold?: number;
  amount?: number;
}

export interface UpdateAutoTopOffRequest {
  enabled: boolean;
  threshold?: number;
  amount?: number;
}

export async function getAutoTopOffSettings(): Promise<AutoTopOffSettings> {
  return await invoke<AutoTopOffSettings>('get_auto_top_off_settings_command');
}

export async function updateAutoTopOffSettings(settings: UpdateAutoTopOffRequest): Promise<AutoTopOffSettings> {
  return await invoke<AutoTopOffSettings>('update_auto_top_off_settings_command', { request: settings });
}

// Checkout types and actions
export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export async function createCreditPurchaseCheckoutSession(
  amount: number
): Promise<CheckoutSessionResponse> {
  return await invoke<CheckoutSessionResponse>('create_credit_purchase_checkout_session_command', {
    amount,
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

// Invoice types and actions
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


// Payment method actions
export async function getPaymentMethods(): Promise<PaymentMethodsResponse> {
  return await invoke<PaymentMethodsResponse>('get_payment_methods_command');
}

export async function openBillingPortal(): Promise<string> {
  const response = await invoke<BillingPortalResponse>('create_billing_portal_session_command');
  return response.url;
}

