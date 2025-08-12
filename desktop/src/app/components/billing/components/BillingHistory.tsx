"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DollarSign, ChevronLeft, ChevronRight, Search, Loader2, Calendar, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import { Slider } from "@/ui/slider";
import { LoadingSkeleton, ErrorState } from "./loading-and-error-states";
import { getCreditHistory, type UnifiedCreditHistoryResponse, type UnifiedCreditHistoryEntry, getDetailedUsageWithSummary, type DetailedUsageRecord, type UsageSummary } from "@/actions/billing";
import { getProvidersWithModels } from "@/actions/config.actions";
import { type ProviderWithModels } from "@/types/config-types";
import { getErrorMessage } from "@/utils/error-handling";
import { formatUsdCurrencyPrecise, formatUsdCurrency } from "@/utils/currency-utils";
import { useDynamicTableRows } from "@/hooks/use-dynamic-table-rows";

export interface BillingHistoryProps {
  className?: string;
  isInModal?: boolean;
}

// Dynamic items per page based on screen size

function formatTransactionDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function BillingHistory({ className, isInModal = false }: BillingHistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableBodyContainerRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<number>(0);
  const fetchInProgressRef = useRef<boolean>(false);
  const itemsPerPageRef = useRef<number>(10); // Store current value in ref
  const latestRequestIdRef = useRef(0);
  const currentPageRef = useRef(1);
  const searchTermRef = useRef("");
  const activeTabRef = useRef<"transactions" | "usage">("transactions");
  const hasLoadedUsageRef = useRef(false);
  
  // State declarations - moved before useEffects
  const [activeTab, setActiveTab] = useState<"transactions" | "usage">("transactions");
  const [modalVisibleRows, setModalVisibleRows] = useState(10);
  const [transactionHistoryData, setTransactionHistoryData] = useState<UnifiedCreditHistoryResponse | null>(null);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(true);
  const [isTransactionsLoadingPage, setIsTransactionsLoadingPage] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [usageData, setUsageData] = useState<DetailedUsageRecord[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1); // Changed to 24h default
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [hasLoadedUsage, setHasLoadedUsage] = useState(false);
  const [sliderPage, setSliderPage] = useState(1);
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<'last1hour' | 'last24hours' | 'last7days' | 'thisweek' | 'thismonth' | 'last30days' | null>('last24hours');
  const [tableVersion, setTableVersion] = useState(0); // Force re-render counter
  const [observedElement, setObservedElement] = useState<HTMLElement | null>(null);
  
  // Safety buffer for measurement calculations
  const SAFETY_BUFFER_PX = 1;

  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { searchTermRef.current = searchTerm; }, [searchTerm]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { hasLoadedUsageRef.current = hasLoadedUsage; }, [hasLoadedUsage]);

  const getProviderDisplayName = (providerCode: string): string => {
    const provider = providers.find(p => p.provider.code === providerCode);
    return provider?.provider.name || providerCode;
  };

  // Helper to normalize unified credit response
  const normalizeUnifiedCreditResponse = (resp: UnifiedCreditHistoryResponse): UnifiedCreditHistoryResponse => {
    // Ensure entries is an array
    const entries = Array.isArray(resp.entries) ? resp.entries : [];
    
    // Ensure totalCount and hasMore have valid values
    const totalCount = typeof resp.totalCount === 'number' ? resp.totalCount : entries.length;
    const hasMore = typeof resp.hasMore === 'boolean' ? resp.hasMore : false;
    
    return {
      entries,
      totalCount,
      hasMore
    };
  };

  const loadCreditHistory = useCallback(async (page: number = 1, search?: string, forceItemsPerPage?: number, skipRateLimit: boolean = false) => {
    // Increment and capture request ID for staleness check
    const reqId = ++latestRequestIdRef.current;
    
    // Throttle requests - minimum 300ms between fetches (skip for initial load)
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchRef.current;
    if (!skipRateLimit && lastFetchRef.current > 0 && timeSinceLastFetch < 300) {
      console.warn(`Throttling request, only ${timeSinceLastFetch}ms since last fetch`);
      return;
    }
    
    fetchInProgressRef.current = true;
    lastFetchRef.current = now;
    
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
      
      // Compute safe page size - never allow 0
      const pageSize = Math.max(1, Math.floor(forceItemsPerPage ?? itemsPerPageRef.current ?? 10));
      const offset = Math.max(0, (Math.max(1, page) - 1) * pageSize);
      
      // Normalize search before calling the action
      const trimmed = (search ?? '').trim();
      const normalizedSearch = trimmed.length > 0 ? trimmed : undefined;
      
      // Debug logging (temporary)
      console.debug('loadCreditHistory:', { pageSize, offset, normalizedSearch });
      
      const response = await getCreditHistory(pageSize, offset, normalizedSearch);
      
      // Check if this response is stale (newer request has been made)
      if (reqId !== latestRequestIdRef.current) {
        console.debug('Ignoring stale response from request', reqId);
        return;
      }
      
      // Normalize the response
      const normalizedResponse = normalizeUnifiedCreditResponse(response);
      
      // Debug logging (temporary)
      console.debug('Response:', { 
        entriesLength: normalizedResponse.entries.length, 
        totalCount: normalizedResponse.totalCount,
        hasMore: normalizedResponse.hasMore 
      });
      
      setTransactionHistoryData(normalizedResponse);
      setCurrentPage(page);
      setTableVersion(v => v + 1); // Force table re-render
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setTransactionsError(errorMessage);
      console.error('Failed to load credit history:', err);
      // Don't clear existing data on error - keep last known good state
    } finally {
      setIsTransactionsLoading(false);
      setIsTransactionsLoadingPage(false);
      fetchInProgressRef.current = false;
    }
  }, []);

  const loadUsageData = useCallback(async () => {
    if (!startDate || !endDate) return;
    
    setIsUsageLoading(true);
    setUsageError(null);
    
    try {
      let startDateISO: string;
      let endDateISO: string;
      
      if (selectedPreset === 'last1hour') {
        // For 1 hour filter, use actual hour precision
        const end = new Date();
        const start = new Date();
        start.setHours(start.getHours() - 1);
        startDateISO = start.toISOString();
        endDateISO = end.toISOString();
      } else if (selectedPreset === 'last24hours') {
        // For 24 hour filter, use actual 24-hour precision
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 1);
        startDateISO = start.toISOString();
        endDateISO = end.toISOString();
      } else if (selectedPreset === 'last7days') {
        // For 7 days filter, use actual 7-day precision
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        startDateISO = start.toISOString();
        endDateISO = end.toISOString();
      } else if (selectedPreset === 'last30days') {
        // For 30 days filter, use actual 30-day precision
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        startDateISO = start.toISOString();
        endDateISO = end.toISOString();
      } else {
        // For custom date ranges, ensure we include entire days
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        startDateISO = start.toISOString();
        endDateISO = end.toISOString();
      }
      
      const result = await getDetailedUsageWithSummary(startDateISO, endDateISO);
      setUsageData(result.detailedUsage);
      setUsageSummary(result.summary);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : 'Failed to fetch usage data');
    } finally {
      setIsUsageLoading(false);
    }
  }, [startDate, endDate, selectedPreset]);

  const measureAndSetModalRows = () => {
    if (!isInModal) return;
    const container = tableBodyContainerRef.current as HTMLElement | null;
    if (!container) return;

    const containerHeight = container.clientHeight;
    if (!containerHeight) return;

    const headerEl = container.querySelector('thead') as HTMLElement | null;
    const headerHeight = headerEl?.offsetHeight ?? 40;

    const rowEl = container.querySelector('tbody > tr') as HTMLElement | null;
    const rowHeight = rowEl?.offsetHeight ?? 48;

    if (!rowHeight || rowHeight === 0) {
      // Keep the last known good value if measurement fails
      return;
    }

    const availableForRows = containerHeight - headerHeight - SAFETY_BUFFER_PX;
    const computed = availableForRows > 0 ? Math.floor(availableForRows / rowHeight) : 1;

    const finalRows = Math.max(1, computed);
    // Only update if value is greater than 0
    if (finalRows > 0) {
      setModalVisibleRows((prev) => (prev !== finalRows ? finalRows : prev));
    }
  };
  
  useEffect(() => {
    if (!isInModal) return;
    
    setObservedElement(tableBodyContainerRef.current);
  }, [isInModal, activeTab]);

  useEffect(() => {
    if (!observedElement) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedMeasure = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        measureAndSetModalRows();
      }, 150);
    };

    let initialRaf = 0;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    initialRaf = requestAnimationFrame(() => {
      initialTimer = setTimeout(() => {
        measureAndSetModalRows();
      }, 60);
    });

    const observer = new ResizeObserver(() => {
      debouncedMeasure();
    });
    observer.observe(observedElement);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (initialTimer) clearTimeout(initialTimer);
      if (initialRaf) cancelAnimationFrame(initialRaf);
      observer.disconnect();
    };
  }, [observedElement, isInModal]);

  // Re-measurement on data and tab transitions
  useEffect(() => {
    if (!isInModal) return;

    // Use a short rAF + timeout to wait for DOM updates on tab/data change
    let raf = 0;
    let t: ReturnType<typeof setTimeout> | null = null;
    raf = requestAnimationFrame(() => {
      t = setTimeout(() => {
        measureAndSetModalRows();
      }, 50);
    });

    return () => {
      if (t) clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    isInModal,
    activeTab,
    isTransactionsLoading,
    isUsageLoading,
    transactionHistoryData?.entries?.length,
    usageData?.length
  ]);
  
  const itemsPerPage = isInModal 
    ? modalVisibleRows
    : useDynamicTableRows(
        containerRef as React.RefObject<HTMLElement>, 
        {
          rowHeight: 48,
          headerHeight: 40,
          paginationHeight: 70,
          extraPadding: 180,
          minRows: 5,
          maxRows: 25,
        }
      );
  
  // Update itemsPerPageRef when itemsPerPage changes - only if greater than 0
  useEffect(() => { 
    if (itemsPerPage > 0) {
      itemsPerPageRef.current = itemsPerPage;
    }
  }, [itemsPerPage]);
  
  // Calculate total pages for transactions
  const effectiveItemsPerPage = Math.max(1, itemsPerPage);
  const totalTransactionPages = transactionHistoryData 
    ? Math.max(1, Math.ceil(transactionHistoryData.totalCount / effectiveItemsPerPage))
    : 1;
  

  
  // Handle itemsPerPage changes - but skip on initial render
  const lastItemsPerPageRef = useRef(itemsPerPage);
  useEffect(() => {
    // Skip if not initialized or no change
    if (!hasInitializedRef.current) return;
    if (itemsPerPage === lastItemsPerPageRef.current) return;
    if (activeTab !== "transactions") return;
    if (!transactionHistoryData) return;
    
    console.debug('Items per page changed from', lastItemsPerPageRef.current, 'to', itemsPerPage);
    lastItemsPerPageRef.current = itemsPerPage;
    
    // Calculate what data range we currently have
    const currentStartIndex = (currentPage - 1) * lastItemsPerPageRef.current;
    
    // Calculate new page that would contain the same starting item
    const newPage = Math.max(1, Math.floor(currentStartIndex / itemsPerPage) + 1);
    const newTotalPages = Math.max(1, Math.ceil(transactionHistoryData.totalCount / itemsPerPage));
    
    // Clamp to valid range
    const targetPage = Math.min(newPage, newTotalPages);
    
    // Update page and refetch with new itemsPerPage
    setCurrentPage(targetPage);
    setSliderPage(targetPage);
    loadCreditHistory(targetPage, searchTerm, itemsPerPage);
  }, [itemsPerPage, activeTab, transactionHistoryData, currentPage, searchTerm, loadCreditHistory]);

  // Initial load - ONE TIME ONLY on mount with useRef to prevent re-runs
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    console.debug('Initial load triggered');
    
    // Initial load with default itemsPerPage
    loadCreditHistory(1, '', 10, true);
    
    // Load provider information for display names
    getProvidersWithModels().then(providers => {
      setProviders(providers);
    }).catch(error => {
      console.error('Failed to load providers:', error);
    });
  }, []); // Empty deps - only run on mount

  useEffect(() => {
    const handleBillingDataUpdated = () => {
      const page = currentPageRef.current;
      const search = searchTermRef.current;
      const perPage = Math.max(1, itemsPerPageRef.current);
      loadCreditHistory(page, search, perPage);
      if (activeTabRef.current === "usage" && hasLoadedUsageRef.current) {
        loadUsageData();
      }
    };

    window.addEventListener('billing-data-updated', handleBillingDataUpdated);
    
    return () => {
      window.removeEventListener('billing-data-updated', handleBillingDataUpdated);
    };
  }, [loadUsageData, loadCreditHistory]);



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
    loadCreditHistory(currentPage, searchTerm, itemsPerPageRef.current);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setSliderPage(newPage);
    loadCreditHistory(newPage, searchTerm, itemsPerPageRef.current);
  };

  const handleSearch = () => {
    setCurrentPage(1);
    setSliderPage(1);
    setIsSearchActive(searchTerm.trim().length > 0);
    loadCreditHistory(1, searchTerm, itemsPerPageRef.current);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
    setSliderPage(1);
    setIsSearchActive(false);
    loadCreditHistory(1, "", itemsPerPageRef.current);
  };

  const handleSliderChange = (value: number[]) => {
    const newPage = value[0];
    setSliderPage(newPage);
  };


  useEffect(() => {
    const timer = setTimeout(() => {
      if (sliderPage !== currentPage) {
        setCurrentPage(sliderPage);
        loadCreditHistory(sliderPage, searchTerm, itemsPerPageRef.current);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [sliderPage, currentPage, searchTerm]);

  const handlePresetClick = (preset: 'last1hour' | 'last24hours' | 'last7days' | 'thisweek' | 'thismonth' | 'last30days') => {
    const end = new Date();
    const endStr = end.toISOString().split('T')[0];
    
    setSelectedPreset(preset);
    
    if (preset === 'last1hour') {
      // For 1 hour, we use the current day to match date input limitations
      // but the actual filtering will be done with proper hour precision in the API call
      const start = new Date();
      start.setHours(start.getHours() - 1);
      // Use today's date for the input, but the API will filter by actual hour
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'last24hours') {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'last7days') {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'thisweek') {
      const start = new Date(end);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
      start.setDate(diff);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'thismonth') {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    } else if (preset === 'last30days') {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(endStr);
    }
  };

  const renderTransactionSkeletonRows = () => {
    const skeletonCount = Math.max(itemsPerPage || 8, 8);
    
    return Array.from({ length: skeletonCount }).map((_, index) => (
      <tr key={`skeleton-${index}`} className="hover:bg-muted/30 transition-colors">
        <td className="py-3 px-1 min-w-[100px]">
          <span className="h-5 w-16 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-32 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1">
          <span className="h-3 w-24 bg-muted/30 rounded animate-pulse inline-block" />
        </td>
        <td className="py-3 px-1 text-right hidden sm:table-cell">
          <span className="h-3 w-16 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right hidden md:table-cell">
          <span className="h-3 w-16 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-16 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
        <td className="py-3 px-1 text-right">
          <span className="h-3 w-20 bg-muted/30 rounded animate-pulse inline-block ml-auto" />
        </td>
      </tr>
    ));
  };

  const renderUsageSkeletonRows = () => {
    const skeletonCount = Math.max(itemsPerPage || 8, 8);
    
    return Array.from({ length: skeletonCount }).map((_, index) => (
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
      </tr>
    ));
  };

  return (
    <Card className={`${className} flex flex-col ${isInModal ? 'h-full' : 'max-h-[800px]'}`} ref={containerRef}>
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              API Usage History
            </CardTitle>
            <CardDescription>
              Track your API usage and costs
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "transactions" | "usage")} className="w-full flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="usage">Usage Details</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="flex flex-col mt-4 flex-1 min-h-0">
            {isTransactionsLoading ? (
              <LoadingSkeleton />
            ) : transactionsError ? (
              <ErrorState message={transactionsError} onRetry={handleTransactionsRetry} />
            ) : !transactionHistoryData || transactionHistoryData.entries.length === 0 ? (
              (() => {
                // Debug logging for empty state conditions
                console.log('Empty state debug:', {
                  isTransactionsLoading,
                  transactionsError,
                  transactionHistoryData: transactionHistoryData ? {
                    entriesLength: transactionHistoryData.entries.length,
                    totalCount: transactionHistoryData.totalCount,
                    hasMore: transactionHistoryData.hasMore
                  } : 'null',
                  isSearchActive,
                  searchTerm,
                  itemsPerPage,
                  currentPage
                });
                
                return (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">
                        {isSearchActive ? "No Matching Transactions" : "No Credit Transactions"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {isSearchActive 
                          ? "No transactions match your search criteria. Try adjusting your search terms."
                          : "Your credit transaction history will appear here once you have credit activity."}
                      </p>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col flex-1 min-h-0 gap-3">
                <div className="flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search transactions..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 pr-10"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                      {searchTerm && (
                        <button
                          onClick={handleClearSearch}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-muted/80 flex items-center justify-center transition-colors cursor-pointer"
                          type="button"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
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
                    {isSearchActive 
                      ? `${transactionHistoryData.totalCount} found` 
                      : `${transactionHistoryData.totalCount} total`
                    }
                  </span>
                </div>

                <div className="flex-1 min-h-0 rounded-lg border border-border/40 overflow-auto" ref={isInModal ? tableBodyContainerRef : undefined}>
                    <table className="w-full" key={`transactions-${tableVersion}-${currentPage}-${itemsPerPage}`}>
                      <thead>
                        <tr className="border-b border-border/40 bg-muted/30">
                          <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Price</th>
                          <th className={`text-left text-xs font-medium text-muted-foreground py-2 px-1 ${isInModal ? 'hidden sm:table-cell' : ''}`}>Date</th>
                          <th className="text-left text-xs font-medium text-muted-foreground py-2 px-1">Model</th>
                          <th className={`text-right text-xs font-medium text-muted-foreground py-2 px-1 ${isInModal ? 'hidden md:table-cell' : ''}`}>Input Tokens</th>
                          <th className={`text-right text-xs font-medium text-muted-foreground py-2 px-1 ${isInModal ? 'hidden lg:table-cell' : 'hidden sm:table-cell'}`}>Output Tokens</th>
                          <th className={`text-right text-xs font-medium text-muted-foreground py-2 px-1 ${isInModal ? 'hidden' : 'hidden md:table-cell'}`}>Cached Tokens</th>
                          <th className="text-right text-xs font-medium text-muted-foreground py-2 px-1">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                      {isTransactionsLoadingPage ? (
                        renderTransactionSkeletonRows()
                      ) : (
                        transactionHistoryData.entries.map((transaction: UnifiedCreditHistoryEntry) => {
                          const cachedTokens = (transaction.cacheReadTokens ?? 0) + (transaction.cacheWriteTokens ?? 0);
                          return (
                            <tr
                              key={transaction.id}
                              className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-3 px-1">
                                <span className={`font-medium text-sm ${transaction.price >= 0 ? 'text-green-600' : 'text-foreground'}`}>
                                  {transaction.price >= 0 ? '+' : ''}{formatUsdCurrencyPrecise(transaction.price)}
                                </span>
                              </td>
                              <td className={`py-3 px-1 text-xs text-muted-foreground ${isInModal ? 'hidden sm:table-cell' : ''}`}>
                                {formatTransactionDate(transaction.date)}
                              </td>
                              <td className="py-3 px-1 text-xs text-muted-foreground truncate max-w-[150px]">
                                {transaction.model || 'Credit Purchase'}
                              </td>
                              <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden md:table-cell' : ''}`}>
                                {transaction.inputTokens != null ? transaction.inputTokens.toLocaleString() : '-'}
                              </td>
                              <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden lg:table-cell' : 'hidden sm:table-cell'}`}>
                                {transaction.outputTokens != null ? transaction.outputTokens.toLocaleString() : '-'}
                              </td>
                              <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden' : 'hidden md:table-cell'}`}>
                                {cachedTokens > 0 ? cachedTokens.toLocaleString() : '-'}
                              </td>
                              <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                                {formatUsdCurrencyPrecise(transaction.balanceAfter)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {transactionHistoryData.totalCount > itemsPerPage && (
                  <div className="pt-2 border-t flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Page {currentPage} of {totalTransactionPages}
                      </span>
                      <Slider
                        value={[sliderPage]}
                        onValueChange={handleSliderChange}
                        max={totalTransactionPages}
                        min={1}
                        step={1}
                        className="flex-1"
                        disabled={isTransactionsLoadingPage}
                      />
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
                          disabled={currentPage >= totalTransactionPages || isTransactionsLoadingPage}
                          className="h-8 px-3"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(totalTransactionPages)}
                          disabled={currentPage >= totalTransactionPages || isTransactionsLoadingPage}
                          className="h-8 px-2"
                          title="Last page"
                        >
                          »»
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="usage" className="flex flex-col mt-4 flex-1 min-h-0">
            <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/40 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={selectedPreset === 'last1hour' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('last1hour')}
                  className={`h-8 text-xs ${selectedPreset === 'last1hour' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  1h
                </Button>
                <Button
                  variant={selectedPreset === 'last24hours' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('last24hours')}
                  className={`h-8 text-xs ${selectedPreset === 'last24hours' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  24h
                </Button>
                <Button
                  variant={selectedPreset === 'last7days' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('last7days')}
                  className={`h-8 text-xs ${selectedPreset === 'last7days' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  7d
                </Button>
                <Button
                  variant={selectedPreset === 'thisweek' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('thisweek')}
                  className={`h-8 text-xs ${selectedPreset === 'thisweek' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  This Week
                </Button>
                <Button
                  variant={selectedPreset === 'thismonth' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('thismonth')}
                  className={`h-8 text-xs ${selectedPreset === 'thismonth' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  This Month
                </Button>
                <Button
                  variant={selectedPreset === 'last30days' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handlePresetClick('last30days')}
                  className={`h-8 text-xs ${selectedPreset === 'last30days' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10 hover:text-primary'}`}
                >
                  30d
                </Button>
                
                <div className="h-4 w-px bg-border/60 mx-2"></div>
                
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setSelectedPreset(null); // Clear preset when manually changing dates
                    }}
                    max={endDate}
                    className="h-8 text-xs pl-9 min-w-[140px] font-mono"
                  />
                </div>
                <span className="text-xs text-muted-foreground">to</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setSelectedPreset(null); // Clear preset when manually changing dates
                    }}
                    min={startDate}
                    className="h-8 text-xs pl-9 min-w-[140px] font-mono"
                  />
                </div>
                
              </div>
              {/* Loading indicator */}
              {isUsageLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading...</span>
                </div>
              )}
            </div>

            {usageError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-destructive text-sm">{usageError}</p>
              </div>
            )}

            {!isUsageLoading && !usageError && usageData.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No Usage Data</h3>
                  <p className="text-sm text-muted-foreground">
                    No API usage found for the selected date range.
                  </p>
                </div>
              </div>
            )}

            {(isUsageLoading || (!usageError && usageData.length > 0)) && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 rounded-lg border border-border/40 overflow-hidden" ref={isInModal && activeTab === "usage" ? tableBodyContainerRef : undefined}>
                  <table className="w-full table-fixed">
                    {!isInModal && (
                      <colgroup>
                        <col className="w-auto" />
                        <col className="w-auto" />
                        <col className="w-20" />
                        <col className="w-24" />
                        <col className="w-28" />
                        <col className="w-28" />
                        <col className="w-28" />
                      </colgroup>
                    )}
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left text-xs font-medium text-muted-foreground py-3 px-1">
                          Model
                        </th>
                        <th className={`text-left text-xs font-medium text-muted-foreground py-3 px-1 ${isInModal ? 'hidden sm:table-cell' : ''}`}>
                          Provider
                        </th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-3 px-1">
                          Cost
                        </th>
                        <th className={`text-right text-xs font-medium text-muted-foreground py-3 px-1 ${isInModal ? 'hidden md:table-cell' : ''}`}>
                          Requests
                        </th>
                        <th className={`text-right text-xs font-medium text-muted-foreground py-3 px-1 ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                          Input Tokens
                        </th>
                        <th className={`text-right text-xs font-medium text-muted-foreground py-3 px-1 ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                          Output Tokens
                        </th>
                        <th className={`text-right text-xs font-medium text-muted-foreground py-3 px-1 ${isInModal ? 'hidden' : ''}`}>
                          Cached Tokens
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
                            <td className="py-3 px-1 text-xs text-muted-foreground truncate">
                              {usage.modelDisplayName}
                            </td>
                            <td className={`py-3 px-1 text-xs text-muted-foreground ${isInModal ? 'hidden sm:table-cell' : ''}`}>
                              {getProviderDisplayName(usage.providerCode)}
                            </td>
                            <td className="py-3 px-1 text-xs text-muted-foreground text-right">
                              {formatUsdCurrency(usage.totalCost)}
                            </td>
                            <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden md:table-cell' : ''}`}>
                              {usage.totalRequests.toLocaleString()}
                            </td>
                            <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                              {usage.totalInputTokens.toLocaleString()}
                            </td>
                            <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                              {usage.totalOutputTokens.toLocaleString()}
                            </td>
                            <td className={`py-3 px-1 text-xs text-muted-foreground text-right ${isInModal ? 'hidden' : ''}`}>
                              {(usage.totalCachedTokens ?? 0) > 0 ? usage.totalCachedTokens.toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
                {/* Total row outside scrollable area */}
                {!isUsageLoading && !usageError && usageData.length > 0 && usageSummary && (
                  <div className="border-t-2 border-border bg-muted/20 flex-shrink-0 mt-3">
                    <table className="w-full table-fixed">
                      {!isInModal && (
                        <colgroup>
                          <col className="w-auto" />
                          <col className="w-auto" />
                          <col className="w-20" />
                          <col className="w-24" />
                          <col className="w-28" />
                          <col className="w-28" />
                          <col className="w-28" />
                        </colgroup>
                      )}
                      <tbody>
                        <tr className="font-medium">
                          <td className="py-3 px-1 text-xs font-semibold">
                            Total
                          </td>
                          <td className={`py-3 px-1 text-xs ${isInModal ? 'hidden sm:table-cell' : ''}`}>
                            {/* Empty cell for Provider column */}
                          </td>
                          <td className="py-3 px-1 text-xs font-bold text-right text-primary">
                            {formatUsdCurrency(usageSummary.totalCost)}
                          </td>
                          <td className={`py-3 px-1 text-xs font-semibold text-right ${isInModal ? 'hidden md:table-cell' : ''}`}>
                            {usageSummary.totalRequests.toLocaleString()}
                          </td>
                          <td className={`py-3 px-1 text-xs font-semibold text-right ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                            {usageSummary.totalInputTokens.toLocaleString()}
                          </td>
                          <td className={`py-3 px-1 text-xs font-semibold text-right ${isInModal ? 'hidden lg:table-cell' : ''}`}>
                            {usageSummary.totalOutputTokens.toLocaleString()}
                          </td>
                          <td className={`py-3 px-1 text-xs font-semibold text-right ${isInModal ? 'hidden' : ''}`}>
                            {(usageSummary.totalCachedTokens ?? 0) > 0 ? usageSummary.totalCachedTokens.toLocaleString() : '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}