"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  FileText,
  Download,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Calendar,
  DollarSign,
  Eye,
  Filter,
  ArrowUpDown
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Card, CardContent } from "@/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { 
  getEnhancedInvoiceHistory,
  downloadInvoicePdf,
  bulkDownloadInvoicePdfs,
  InvoiceHistoryRequest 
} from "@/actions/billing/invoice.actions";
import type { InvoiceHistoryEntry } from "@/types/tauri-commands";

export interface InvoiceHistoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EnhancedInvoiceHistoryEntry extends InvoiceHistoryEntry {
  displayAmount: string;
  displayDate: string;
  displayDueDate: string;
  displayPaidDate: string;
  statusColor: string;
  statusText: string;
  isOverdue: boolean;
  daysPastDue: number;
  hasPdf: boolean;
}

interface InvoiceHistorySummary {
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
}

export function InvoiceHistoryManager({ 
  isOpen, 
  onClose 
}: InvoiceHistoryManagerProps) {
  const [invoices, setInvoices] = useState<EnhancedInvoiceHistoryEntry[]>([]);
  const [summary, setSummary] = useState<InvoiceHistorySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'createdDate' | 'amount' | 'status'>('createdDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { showNotification } = useNotification();

  useEffect(() => {
    if (isOpen) {
      loadInvoiceHistory();
    }
  }, [isOpen]);

  const loadInvoiceHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const request: InvoiceHistoryRequest = {
        limit: 100 // Load up to 100 invoices for comprehensive history
      };

      const response = await getEnhancedInvoiceHistory(request);
      setInvoices(response.invoices);
      setSummary(response.summary);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load invoice history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDownloadPdf = useCallback(async (invoice: EnhancedInvoiceHistoryEntry) => {
    if (!invoice.hasPdf) {
      showNotification({
        title: "PDF Not Available",
        message: "PDF download is not available for this invoice.",
        type: "warning",
      });
      return;
    }

    try {
      setDownloadingIds(prev => new Set(prev).add(invoice.id));
      await downloadInvoicePdf(invoice);
      
      showNotification({
        title: "PDF Downloaded",
        message: `Invoice ${invoice.id} PDF opened successfully.`,
        type: "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Download Failed",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setDownloadingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(invoice.id);
        return newSet;
      });
    }
  }, [showNotification]);

  const handleBulkDownload = useCallback(async () => {
    const pdfInvoices = invoices.filter(invoice => invoice.hasPdf);
    
    if (pdfInvoices.length === 0) {
      showNotification({
        title: "No PDFs Available",
        message: "No invoices with PDFs found for download.",
        type: "warning",
      });
      return;
    }

    try {
      setIsLoading(true);
      const results = await bulkDownloadInvoicePdfs(pdfInvoices);
      
      showNotification({
        title: "Bulk Download Complete",
        message: `Successfully downloaded ${results.successful} PDFs. ${results.failed > 0 ? `${results.failed} failed.` : ''}`,
        type: results.failed > 0 ? "warning" : "success",
      });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      showNotification({
        title: "Bulk Download Failed",
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [invoices, showNotification]);

  const handleSort = useCallback((field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  const formatCurrency = useCallback((amount: number, currency = "USD") => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }, []);

  // Filter and sort invoices
  const filteredAndSortedInvoices = invoices
    .filter(invoice => statusFilter === 'all' || invoice.status?.toLowerCase() === statusFilter)
    .sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'createdDate':
          aValue = new Date(a.createdDate).getTime();
          bValue = new Date(b.createdDate).getTime();
          break;
        case 'amount':
          aValue = a.amount;
          bValue = b.amount;
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        default:
          return 0;
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice History
          </DialogTitle>
          <DialogDescription>
            View and download your invoice history. PDFs can be downloaded individually or in bulk.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary.paidAmount)}
                </div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(summary.outstandingAmount)}
                </div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(summary.overdueAmount)}
                </div>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{invoices.length}</div>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="open">Open</option>
              <option value="past_due">Past Due</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={loadInvoiceHistory} 
              disabled={isLoading}
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              onClick={handleBulkDownload}
              disabled={isLoading || invoices.filter(i => i.hasPdf).length === 0}
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Download All PDFs
            </Button>
          </div>
        </div>

        {/* Invoice Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading invoice history...
          </div>
        ) : filteredAndSortedInvoices.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Invoices Found</h3>
              <p className="text-muted-foreground mb-4">
                {statusFilter === 'all' 
                  ? 'No invoices have been generated yet.' 
                  : `No invoices found with status "${statusFilter}".`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">
                    <button
                      onClick={() => handleSort('createdDate')}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Calendar className="h-4 w-4" />
                      Date
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 font-medium">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <DollarSign className="h-4 w-4" />
                      Amount
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 font-medium">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      Status
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 font-medium">Description</th>
                  <th className="text-left p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t hover:bg-muted/20">
                    <td className="p-4">
                      <div className="text-sm font-medium">{invoice.displayDate}</div>
                      {invoice.displayDueDate && invoice.displayDueDate !== 'Not available' && (
                        <div className="text-xs text-muted-foreground">
                          Due: {invoice.displayDueDate}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium">{invoice.displayAmount}</div>
                      {invoice.displayPaidDate && invoice.displayPaidDate !== 'Not available' && (
                        <div className="text-xs text-muted-foreground">
                          Paid: {invoice.displayPaidDate}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge className={invoice.statusColor}>
                        {invoice.statusText}
                      </Badge>
                      {invoice.isOverdue && (
                        <div className="text-xs text-red-600 mt-1">
                          {invoice.daysPastDue} days overdue
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{invoice.description}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {invoice.hasPdf ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadPdf(invoice)}
                            disabled={downloadingIds.has(invoice.id)}
                          >
                            {downloadingIds.has(invoice.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}