"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, ChevronLeft, ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { getCreditHistory, type CreditHistoryResponse } from "@/actions/billing/credit.actions";
import { getErrorMessage } from "@/utils/error-handling";
import { formatUsdCurrency } from "@/utils/currency-utils";

export interface CreditTransactionHistoryProps {
  className?: string;
}

const ITEMS_PER_PAGE = 10;

function formatTransactionDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTransactionTypeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  switch (type.toLowerCase()) {
    case 'purchase':
    case 'refund':
      return 'default';
    case 'usage':
    case 'consumption':
      return 'secondary';
    case 'expired':
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getTransactionTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'purchase':
    case 'refund':
      return 'text-green-600';
    case 'usage':
    case 'consumption':
      return 'text-blue-600';
    case 'expired':
    case 'cancelled':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

export function CreditTransactionHistory({ className }: CreditTransactionHistoryProps) {
  const [historyData, setHistoryData] = useState<CreditHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadCreditHistory = useCallback(async (page: number = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await getCreditHistory(ITEMS_PER_PAGE, offset);
      
      setHistoryData(response);
      setCurrentPage(page);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Failed to load credit history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCreditHistory(1);
  }, [loadCreditHistory]);

  const handleRetry = () => {
    loadCreditHistory(currentPage);
  };

  const handlePageChange = (newPage: number) => {
    loadCreditHistory(newPage);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={handleRetry} />;
  }

  if (!historyData || historyData.transactions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Credit Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No Credit Transactions</h3>
            <p className="text-sm text-muted-foreground">
              Your credit transaction history will appear here once you have credit activity.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.ceil(historyData.totalCount / ITEMS_PER_PAGE);
  const hasNextPage = historyData.hasMore;
  const hasPrevPage = currentPage > 1;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Credit Transaction History
          </div>
          <Badge variant="secondary">
            {historyData.totalCount} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {historyData.transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {transaction.amount >= 0 ? '+' : ''}{formatUsdCurrency(transaction.amount)}
                  </span>
                  <Badge variant={getTransactionTypeVariant(transaction.transactionType)}>
                    <span className={getTransactionTypeColor(transaction.transactionType)}>
                      {transaction.transactionType.charAt(0).toUpperCase() + transaction.transactionType.slice(1)}
                    </span>
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {formatTransactionDate(transaction.createdAt)}
                  </span>
                  {transaction.description && (
                    <span className="flex-1 truncate">
                      {transaction.description}
                    </span>
                  )}
                  <span className="text-xs">
                    Balance: {formatUsdCurrency(transaction.balanceAfter)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
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