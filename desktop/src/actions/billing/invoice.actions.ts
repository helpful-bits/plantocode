import { invoke } from '@tauri-apps/api/core';
import type { 
  InvoiceHistoryResponse, 
  InvoiceHistoryEntry,
  InvoiceHistoryRequest 
} from '@/types/tauri-commands';

// Re-export the type for use in components
export type { InvoiceHistoryRequest };

/**
 * Get invoice history with optional pagination and filtering
 */
export async function getInvoiceHistory(
  request: InvoiceHistoryRequest = {}
): Promise<InvoiceHistoryResponse> {
  // Only pass request if it has properties, otherwise pass undefined for optional parameter
  const hasParams = Object.keys(request).length > 0;
  return await invoke<InvoiceHistoryResponse>('get_invoice_history_command', hasParams ? request as Record<string, unknown> : undefined);
}

/**
 * Download invoice PDF by opening it in a new window/tab
 */
export async function downloadInvoicePdf(invoice: InvoiceHistoryEntry): Promise<void> {
  if (!invoice.invoicePdf) {
    throw new Error('Invoice PDF URL not available');
  }
  
  try {
    // Open PDF in new window/tab for download
    window.open(invoice.invoicePdf, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('Failed to open invoice PDF:', error);
    throw new Error('Failed to open invoice PDF. Please try again or contact support.');
  }
}

/**
 * Bulk download multiple invoice PDFs
 */
export async function bulkDownloadInvoicePdfs(invoices: InvoiceHistoryEntry[]): Promise<{
  successful: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  for (const invoice of invoices) {
    try {
      if (invoice.invoicePdf) {
        await downloadInvoicePdf(invoice);
        results.successful++;
        // Add small delay between downloads to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        results.failed++;
        results.errors.push(`Invoice ${invoice.id}: PDF not available`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Invoice ${invoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return results;
}

/**
 * Format invoice for display
 */
export function formatInvoice(invoice: InvoiceHistoryEntry): {
  displayAmount: string;
  displayDate: string;
  displayDueDate: string;
  displayPaidDate: string;
  statusColor: string;
  statusText: string;
  isOverdue: boolean;
  daysPastDue: number;
  hasPdf: boolean;
} {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };
  
  const displayAmount = formatCurrency(invoice.amount, invoice.currency);
  const displayDate = formatDate(invoice.createdDate);
  const displayDueDate = formatDate(invoice.dueDate);
  const displayPaidDate = formatDate(invoice.paidDate);
  
  // Determine status color and text
  let statusColor = 'bg-gray-100 text-gray-800';
  let statusText = invoice.status || 'Unknown';
  
  switch (invoice.status?.toLowerCase()) {
    case 'paid':
      statusColor = 'bg-green-100 text-green-800';
      statusText = 'Paid';
      break;
    case 'open':
      statusColor = 'bg-blue-100 text-blue-800';
      statusText = 'Open';
      break;
    case 'past_due':
      statusColor = 'bg-red-100 text-red-800';
      statusText = 'Past Due';
      break;
    case 'draft':
      statusColor = 'bg-yellow-100 text-yellow-800';
      statusText = 'Draft';
      break;
    case 'void':
      statusColor = 'bg-gray-100 text-gray-600';
      statusText = 'Void';
      break;
    case 'uncollectible':
      statusColor = 'bg-red-100 text-red-800';
      statusText = 'Uncollectible';
      break;
  }
  
  // Check if overdue
  let isOverdue = false;
  let daysPastDue = 0;
  
  if (invoice.dueDate && invoice.status?.toLowerCase() === 'open') {
    const dueDate = new Date(invoice.dueDate);
    const today = new Date();
    if (dueDate < today) {
      isOverdue = true;
      daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  
  return {
    displayAmount,
    displayDate,
    displayDueDate,
    displayPaidDate,
    statusColor,
    statusText,
    isOverdue,
    daysPastDue,
    hasPdf: !!invoice.invoicePdf
  };
}

/**
 * Get enhanced invoice history with formatted display data
 */
export async function getEnhancedInvoiceHistory(
  request: InvoiceHistoryRequest = {}
): Promise<{
  invoices: Array<InvoiceHistoryEntry & ReturnType<typeof formatInvoice>>;
  totalCount: number;
  hasMore: boolean;
  summary: {
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    overdueAmount: number;
    overdueCount: number;
  };
}> {
  const response = await getInvoiceHistory(request);
  
  const enhancedInvoices = response.invoices.map(invoice => ({
    ...invoice,
    ...formatInvoice(invoice)
  }));
  
  // Calculate summary
  const summary = {
    totalAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    overdueCount: 0
  };
  
  for (const invoice of enhancedInvoices) {
    summary.totalAmount += invoice.amount;
    
    if (invoice.status?.toLowerCase() === 'paid') {
      summary.paidAmount += invoice.amount;
    } else if (invoice.status?.toLowerCase() === 'open') {
      summary.outstandingAmount += invoice.amount;
      
      if (invoice.isOverdue) {
        summary.overdueAmount += invoice.amount;
        summary.overdueCount++;
      }
    }
  }
  
  return {
    invoices: enhancedInvoices,
    totalCount: response.totalCount,
    hasMore: response.hasMore,
    summary
  };
}

