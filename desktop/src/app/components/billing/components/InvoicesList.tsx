"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Download, ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { listInvoices, downloadInvoicePdf, revealFileInExplorer, type Invoice, type ListInvoicesResponse } from "@/actions/billing";
import { getErrorMessage } from "@/utils/error-handling";
import { formatUsdCurrency } from "@/utils/currency-utils";

export interface InvoicesListProps {
  className?: string;
}

const ITEMS_PER_PAGE = 10;

function formatInvoiceDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" | "success" {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'default';
    case 'open':
      return 'secondary';
    case 'void':
    case 'uncollectible':
      return 'destructive';
    default:
      return 'outline';
  }
}


export function InvoicesList({ className }: InvoicesListProps) {
  const [invoicesData, setInvoicesData] = useState<ListInvoicesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<Record<string, string>>({});

  const loadInvoices = async (page: number = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await listInvoices(ITEMS_PER_PAGE, offset);
      
      setInvoicesData(response);
      setCurrentPage(page);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      
      let friendlyError = errorMessage;
      if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        friendlyError = 'Unable to load billing history. Please check your internet connection and try again.';
      } else if (errorMessage.toLowerCase().includes('timeout')) {
        friendlyError = 'Request timed out while loading billing history. Please try again.';
      } else if (errorMessage.toLowerCase().includes('unauthorized') || errorMessage.toLowerCase().includes('forbidden')) {
        friendlyError = 'Unable to access billing history. Please refresh the page or contact support.';
      }
      
      setError(friendlyError);
      console.error('Failed to load invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadInvoices(1);
  }, []); // Empty dependency array for initial load only

  // Listen for billing data updates
  useEffect(() => {
    const handleBillingDataUpdated = () => {
      // Reload the current page of invoices
      loadInvoices(currentPage);
    };

    window.addEventListener('billing-data-updated', handleBillingDataUpdated);
    
    return () => {
      window.removeEventListener('billing-data-updated', handleBillingDataUpdated);
    };
  }, [currentPage]); // Only depend on currentPage

  const handleRetry = () => {
    loadInvoices(currentPage);
  };

  const handlePageChange = (newPage: number) => {
    loadInvoices(newPage);
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    if (!invoice.invoicePdfUrl) return;

    try {
      setDownloadingInvoice(invoice.id);
      const filePath = await downloadInvoicePdf(invoice.id, invoice.invoicePdfUrl);
      setDownloadedFiles(prev => ({
        ...prev,
        [invoice.id]: filePath
      }));
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setDownloadingInvoice(null);
    }
  };


  const handleRevealInFolder = async (filePath: string) => {
    try {
      await revealFileInExplorer(filePath);
    } catch (error) {
      console.error('Failed to reveal file in folder:', error);
    }
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleRetry} />;
  }

  // Only show "No Billing History" if we're on the first page with no data
  // If we're on a later page with no data, show the empty table with pagination
  if (!invoicesData || (invoicesData.invoices.length === 0 && currentPage === 1)) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No Billing History</h3>
            <p className="text-sm text-muted-foreground">
              Your invoice history for credit pack purchases will appear here. Start by purchasing credits to see your billing records.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl font-bold">
          <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          Invoices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invoice Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Amount</th>
                <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Date</th>
                <th className="text-right text-xs font-medium text-muted-foreground py-2 px-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoicesData.invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        No invoices yet. Your invoice history will appear here after purchases.
                      </p>
                      {currentPage > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          className="h-8 px-3"
                        >
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          Go Back
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                invoicesData.invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2 px-1">
                    <span className="font-medium text-sm">
                      {formatUsdCurrency(invoice.amountDue / 100)}
                    </span>
                  </td>
                  <td className="py-2 px-1">
                    <Badge variant={getStatusVariant(invoice.status)} className="text-xs">
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="py-2 px-1 text-sm text-muted-foreground">
                    {formatInvoiceDate(invoice.created)}
                  </td>
                  <td className="py-2 px-1 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {downloadedFiles[invoice.id] && (
                        <button
                          onClick={() => handleRevealInFolder(downloadedFiles[invoice.id])}
                          className="text-xs text-success hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <FolderOpen className="h-3 w-3" />
                          Show
                        </button>
                      )}
                      {invoice.invoicePdfUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice)}
                          disabled={downloadingInvoice === invoice.id}
                          className="h-7 text-xs px-2"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          {downloadingInvoice === invoice.id ? 'Downloading...' : 'PDF'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(invoicesData.hasMore || currentPage > 1) && (
          <div className="pt-4 border-t flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {currentPage}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="h-8 px-2"
                  title="First page"
                >
                  ««
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!invoicesData.hasMore || isLoading}
                  className="h-8 px-3"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}