"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, ChevronLeft, ChevronRight, Search, Loader2, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import { Slider } from "@/ui/slider";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { getCreditHistory, type CreditHistoryResponse } from "@/actions/billing/credit.actions";
import { getDetailedUsage, type DetailedUsage } from "@/actions/billing/plan.actions";
import { getProvidersWithModels } from "@/actions/config.actions";
import { type ProviderWithModels } from "@/types/config-types";
import { getErrorMessage } from "@/utils/error-handling";
import { formatUsdCurrencyPrecise, formatUsdCurrency } from "@/utils/currency-utils";

export interface BillingHistoryProps {
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

export function BillingHistory({ className }: BillingHistoryProps) {
  const [transactionHistoryData, setTransactionHistoryData] = useState<CreditHistoryResponse | null>(null);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(true);
  const [isTransactionsLoadingPage, setIsTransactionsLoadingPage] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const [usageData, setUsageData] = useState<DetailedUsage[]>([]);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [activeTab, setActiveTab] = useState("transactions");
  const [hasLoadedUsage, setHasLoadedUsage] = useState(false);
  const [sliderPage, setSliderPage] = useState(1);
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);

  const getProviderDisplayName = (providerCode: string): string => {
    const provider = providers.find(p => p.provider.code === providerCode);
    return provider?.provider.name || providerCode;
  };

  const calculateUsageTotals = (data: DetailedUsage[]) => {
    return data.reduce(
      (totals, usage) => ({
        totalCost: totals.totalCost + usage.totalCost,
        totalRequests: totals.totalRequests + usage.totalRequests,
        totalInputTokens: totals.totalInputTokens + usage.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens + usage.totalOutputTokens,
        totalDurationMs: totals.totalDurationMs + usage.totalDurationMs,
      }),
      {
        totalCost: 0,
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalDurationMs: 0,
      }
    );
  };

  const loadCreditHistory = useCallback(async (page: number = 1, search?: string) => {
    try {
      if (page > 1) {
        setIsTransactionsLoadingPage(true);
      } else {
        setIsTransactionsLoading(true);
      }
      setTransactionsError(null);
      
      if (page > 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await getCreditHistory(ITEMS_PER_PAGE, offset, search);
      
      setTransactionHistoryData(response);
      setCurrentPage(page);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setTransactionsError(errorMessage);
      console.error('Failed to load credit history:', err);
    } finally {
      setIsTransactionsLoading(false);
      setIsTransactionsLoadingPage(false);
    }
  }, []);

  const loadUsageData = useCallback(async () => {
    if (!startDate || !endDate) return;
    
    setIsUsageLoading(true);
    setUsageError(null);
    
    try {
      const startDateISO = new Date(startDate).toISOString();
      const endDateISO = new Date(endDate + 'T23:59:59').toISOString();
      const result = await getDetailedUsage(startDateISO, endDateISO);
      setUsageData(result);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : 'Failed to fetch usage data');
    } finally {
      setIsUsageLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadCreditHistory(1);
    
    // Load provider information for display names
    getProvidersWithModels().then(setProviders).catch(console.error);
  }, [loadCreditHistory]);


  useEffect(() => {
    if (activeTab === "usage" && !hasLoadedUsage) {
      loadUsageData();
      setHasLoadedUsage(true);
    }
  }, [activeTab, hasLoadedUsage, loadUsageData]);

  useEffect(() => {
    if (activeTab === "usage" && hasLoadedUsage) {
      loadUsageData();
    }
  }, [startDate, endDate, activeTab, hasLoadedUsage, loadUsageData]);

  const handleTransactionsRetry = () => {
    loadCreditHistory(currentPage, searchTerm);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setSliderPage(newPage);
    loadCreditHistory(newPage, searchTerm);
  };

  const handleSearch = () => {
    setCurrentPage(1);
    setSliderPage(1);
    loadCreditHistory(1, searchTerm);
  };

  const handleSliderChange = useCallback((value: number[]) => {
    const newPage = value[0];
    setSliderPage(newPage);
  }, []);

  const debouncedPageChange = useCallback(
    ((page: number) => {
      if (page !== currentPage) {
        setCurrentPage(page);
        loadCreditHistory(page, searchTerm);
      }
    }),
    [currentPage, loadCreditHistory, searchTerm]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      debouncedPageChange(sliderPage);
    }, 300);

    return () => clearTimeout(timer);
  }, [sliderPage, debouncedPageChange]);

  const handlePresetClick = (preset: 'last24hours' | 'last7days' | 'thismonth') => {
    const end = new Date();
    const endStr = end.toISOString().split('T')[0];
    
    if (preset === 'last24hours') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'last7days') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'thismonth') {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    }
  };

  const renderTransactionSkeletonRows = () => (
    Array.from({ length: transactionHistoryData ? transactionHistoryData.transactions.length : ITEMS_PER_PAGE }).map((_, index) => (
      <tr key={`skeleton-${index}`} className="hover:bg-muted/30 transition-colors">
        <td className="py-3 px-1">
          <span className="h-5 w-16 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-32 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-full bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-20 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
      </tr>
    ))
  );

  const renderUsageSkeletonRows = () => (
    Array.from({ length: 8 }).map((_, index) => (
      <tr key={`usage-skeleton-${index}`} className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors">
        <td className="py-3 px-1">
          <span className="h-3 w-24 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-20 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-16 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-12 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-20 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-20 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-16 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
      </tr>
    ))
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Billing & Usage History</CardTitle>
        <CardDescription>
          View your credit transactions and detailed usage reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="transactions">Credit Transactions</TabsTrigger>
            <TabsTrigger value="usage">Usage Details</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            {isTransactionsLoading ? (
              <LoadingSkeleton />
            ) : transactionsError ? (
              <ErrorState message={transactionsError} onRetry={handleTransactionsRetry} />
            ) : !transactionHistoryData || transactionHistoryData.transactions.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Credit Transactions</h3>
                <p className="text-sm text-muted-foreground">
                  Your credit transaction history will appear here once you have credit activity.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search transactions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSearch}
                      disabled={isTransactionsLoading || isTransactionsLoadingPage}
                    >
                      Search
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {transactionHistoryData.totalCount} total
                  </span>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Amount</th>
                      <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Date</th>
                      <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Description</th>
                      <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isTransactionsLoadingPage ? (
                      renderTransactionSkeletonRows()
                    ) : (
                      transactionHistoryData.transactions.map((transaction) => (
                        <tr
                          key={transaction.id}
                          className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-3 px-1">
                            <span className={`font-medium text-sm ${transaction.amount >= 0 ? 'text-green-600' : 'text-foreground'}`}>
                              {transaction.amount >= 0 ? '+' : ''}{formatUsdCurrencyPrecise(transaction.amount)}
                            </span>
                          </td>
                          <td className="py-3 px-1 text-xs text-muted-foreground">
                            {formatTransactionDate(transaction.createdAt)}
                          </td>
                          <td className="py-3 px-1 text-xs text-muted-foreground">
                            {transaction.description && (
                              <span className="truncate">
                                {transaction.description}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-1 text-xs text-muted-foreground">
                            {formatUsdCurrencyPrecise(transaction.balanceAfter)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {Math.ceil(transactionHistoryData.totalCount / ITEMS_PER_PAGE) > 1 && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        1
                      </span>
                      <Slider
                        value={[sliderPage]}
                        onValueChange={handleSliderChange}
                        max={Math.ceil(transactionHistoryData.totalCount / ITEMS_PER_PAGE)}
                        min={1}
                        step={1}
                        className="flex-1"
                        disabled={isTransactionsLoadingPage}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {Math.ceil(transactionHistoryData.totalCount / ITEMS_PER_PAGE)}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(1)}
                          disabled={currentPage <= 1 || isTransactionsLoadingPage}
                          className="h-8 px-2"
                          title="First page"
                        >
                          ««
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage <= 1 || isTransactionsLoadingPage}
                          className="h-8 px-3"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={!transactionHistoryData.hasMore || isTransactionsLoadingPage}
                          className="h-8 px-3"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(Math.ceil(transactionHistoryData.totalCount / ITEMS_PER_PAGE))}
                          disabled={!transactionHistoryData.hasMore || isTransactionsLoadingPage}
                          className="h-8 px-2"
                          title="Last page"
                        >
                          »»
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Quick Select:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePresetClick('last24hours')}
                  className="h-8 text-xs hover:bg-primary/10 hover:text-primary"
                >
                  24h
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePresetClick('last7days')}
                  className="h-8 text-xs hover:bg-primary/10 hover:text-primary"
                >
                  7d
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePresetClick('thismonth')}
                  className="h-8 text-xs hover:bg-primary/10 hover:text-primary"
                >
                  1m
                </Button>
              </div>
              
              <div className="h-6 w-px bg-border mx-1" />
              
              <div className="flex items-end gap-3 flex-1 min-w-0">
                <div className="space-y-1 flex-shrink-0">
                  <label htmlFor="start-date" className="text-xs font-medium text-muted-foreground block">
                    Start Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate}
                      className="h-8 text-xs pl-9 min-w-[140px] font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1 flex-shrink-0">
                  <label htmlFor="end-date" className="text-xs font-medium text-muted-foreground block">
                    End Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    <Input
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="h-8 text-xs pl-9 min-w-[140px] font-mono"
                    />
                  </div>
                </div>
                {isUsageLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Updating...</span>
                  </div>
                )}
              </div>
            </div>

            {usageError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-destructive text-sm">{usageError}</p>
              </div>
            )}

            {!isUsageLoading && !usageError && usageData.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No usage data found for the selected date range.
              </div>
            )}

            {(isUsageLoading || (!usageError && usageData.length > 0)) && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left text-xs font-medium text-muted-foreground py-3 px-1">
                        Model
                      </th>
                      <th className="text-left text-xs font-medium text-muted-foreground py-3 px-1">
                        Provider
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                        Cost
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                        Requests
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                        Input Tokens
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                        Output Tokens
                      </th>
                      <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                        Duration (ms)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isUsageLoading ? (
                      renderUsageSkeletonRows()
                    ) : (
                      <>
                        {usageData.map((usage, index) => (
                          <tr key={index} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-1 text-xs text-muted-foreground">
                              {usage.modelDisplayName}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground">
                              {getProviderDisplayName(usage.providerCode)}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {formatUsdCurrency(usage.totalCost)}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {usage.totalRequests.toLocaleString()}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {usage.totalInputTokens.toLocaleString()}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {usage.totalOutputTokens.toLocaleString()}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {usage.totalDurationMs.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        {usageData.length > 0 && (() => {
                          const totals = calculateUsageTotals(usageData);
                          return (
                            <tr className="border-t-2 border-border bg-muted/20 font-medium">
                              <td className="py-3 px-1 text-xs font-semibold">
                                Total
                              </td>
                              <td className="py-3 px-1 text-xs text-muted-foreground">
                                {/* Empty cell for Provider column */}
                              </td>
                              <td className="py-3 px-1 text-xs font-semibold text-right">
                                {formatUsdCurrency(totals.totalCost)}
                              </td>
                              <td className="py-3 px-1 text-xs font-semibold text-right">
                                {totals.totalRequests.toLocaleString()}
                              </td>
                              <td className="py-3 px-1 text-xs font-semibold text-right">
                                {totals.totalInputTokens.toLocaleString()}
                              </td>
                              <td className="py-3 px-1 text-xs font-semibold text-right">
                                {totals.totalOutputTokens.toLocaleString()}
                              </td>
                              <td className="py-3 px-1 text-xs font-semibold text-right">
                                {totals.totalDurationMs.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })()}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}