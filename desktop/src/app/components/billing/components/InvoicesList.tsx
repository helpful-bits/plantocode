"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { listInvoices, type Invoice, type ListInvoicesResponse } from "@/actions/billing/invoice.actions";
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

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
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

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'text-green-600';
    case 'open':
      return 'text-yellow-600';
    case 'void':
    case 'uncollectible':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

export function InvoicesList({ className }: InvoicesListProps) {
  const [invoicesData, setInvoicesData] = useState<ListInvoicesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadInvoices = useCallback(async (page: number = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await listInvoices(ITEMS_PER_PAGE, offset);
      
      setInvoicesData(response);
      setCurrentPage(page);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      
      // Check if error is 404/Not Found or similar - treat as empty state for billing history
      if (errorMessage.includes('404') || 
          errorMessage.toLowerCase().includes('not found') ||
          errorMessage.toLowerCase().includes('no invoices') ||
          errorMessage.toLowerCase().includes('no customer') ||
          errorMessage.toLowerCase().includes('no billing history') ||
          errorMessage.toLowerCase().includes('customer not found')) {
        setInvoicesData({ invoices: [], totalInvoices: 0, hasMore: false });
        setError(null);
      } else {
        // Provide more user-friendly error messages
        let friendlyError = errorMessage;
        if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
          friendlyError = 'Unable to load billing history. Please check your internet connection and try again.';
        } else if (errorMessage.toLowerCase().includes('timeout')) {
          friendlyError = 'Request timed out while loading billing history. Please try again.';
        } else if (errorMessage.toLowerCase().includes('unauthorized') || errorMessage.toLowerCase().includes('forbidden')) {
          friendlyError = 'Unable to access billing history. Please refresh the page or contact support.';
        }
        setError(friendlyError);
      }
      
      console.error('Failed to load invoices:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvoices(1);
  }, [loadInvoices]);

  const handleRetry = () => {
    loadInvoices(currentPage);
  };

  const handlePageChange = (newPage: number) => {
    loadInvoices(newPage);
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    if (invoice.invoicePdfUrl) {
      window.open(invoice.invoicePdfUrl, '_blank');
    }
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleRetry} />;
  }

  if (!invoicesData || invoicesData.invoices.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Billing History
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

  const hasNextPage = invoicesData.hasMore;
  const hasPrevPage = currentPage > 1;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Billing History
          </div>
          <Badge variant="secondary">
            {invoicesData.totalInvoices} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invoice List */}
        <div className="space-y-3">
          {invoicesData.invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {formatUsdCurrency(invoice.amountDue / 100)}
                  </span>
                  <Badge variant={getStatusVariant(invoice.status)}>
                    <span className={getStatusColor(invoice.status)}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </span>
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {formatInvoiceDate(invoice.created)}
                  </span>
                  {invoice.dueDate && (
                    <span>
                      Due: {formatInvoiceDate(invoice.dueDate)}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {invoice.invoicePdfUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadInvoice(invoice)}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    View PDF
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {(hasNextPage || hasPrevPage) && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {currentPage}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!hasPrevPage}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!hasNextPage}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}