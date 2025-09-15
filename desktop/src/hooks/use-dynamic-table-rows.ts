import { useState, useEffect, useCallback, RefObject } from 'react';

interface UseDynamicTableRowsOptions {
  rowHeight?: number;
  headerHeight?: number;
  paginationHeight?: number;
  minRows?: number;
  maxRows?: number;
  extraPadding?: number;
}

export function useDynamicTableRows(
  containerRef: RefObject<HTMLElement>,
  options: UseDynamicTableRowsOptions = {}
) {
  const {
    rowHeight = 52, // Approximate height of a table row in pixels
    headerHeight = 40, // Table header height
    paginationHeight = 60, // Pagination controls height
    minRows = 5,
    maxRows = 20, // Reasonable default
    extraPadding = 120, // Extra padding for tabs, search bar, etc.
  } = options;

  const [itemsPerPage, setItemsPerPage] = useState(10);

  const calculateOptimalRows = useCallback(() => {
    if (!containerRef.current) return minRows;

    const containerHeight = containerRef.current.clientHeight;
    // Ensure we have positive available height
    const availableHeight = Math.max(0, containerHeight - headerHeight - paginationHeight - extraPadding);
    
    // If very little space, use minimum rows
    if (availableHeight < rowHeight * minRows) {
      return minRows;
    }
    
    const calculatedRows = Math.floor(availableHeight / rowHeight);
    
    // Clamp between min and max
    return Math.max(minRows, Math.min(maxRows, calculatedRows));
  }, [containerRef, rowHeight, headerHeight, paginationHeight, extraPadding, minRows, maxRows]);

  useEffect(() => {
    let resizeTimeout: number;
    let isInitialLoad = true;
    
    const updateRows = () => {
      const optimalRows = calculateOptimalRows();
      setItemsPerPage(optimalRows);
    };

    // Initial calculation - immediate
    updateRows();

    // Debounced update for subsequent changes
    const debouncedUpdateRows = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateRows();
      }, isInitialLoad ? 0 : 300); // No delay for initial, 300ms debounce for subsequent
      isInitialLoad = false;
    };

    // Update on window resize with debouncing
    const handleResize = () => {
      debouncedUpdateRows();
    };

    window.addEventListener('resize', handleResize);
    
    // Also observe container size changes with debouncing
    const resizeObserver = new ResizeObserver(() => {
      // Skip the first observation which happens immediately after observe()
      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }
      debouncedUpdateRows();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [calculateOptimalRows, containerRef]);

  return itemsPerPage;
}