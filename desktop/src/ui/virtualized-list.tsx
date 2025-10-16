"use client";

import React, { useRef, useState, useEffect } from "react";
import { cn } from "@/utils/utils";

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export default function VirtualizedList<T>({
  items,
  itemHeight,
  overscan = 8,
  getKey,
  renderItem,
  className,
}: VirtualizedListProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  const totalHeight = items.length * itemHeight;

  const updateVisibleRange = () => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, clientHeight } = scrollContainerRef.current;
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleEnd = Math.ceil((scrollTop + clientHeight) / itemHeight);

    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(items.length, visibleEnd + overscan);

    setVisibleRange({ start, end });
  };

  useEffect(() => {
    updateVisibleRange();
  }, [items.length, itemHeight, overscan]);

  const handleScroll = () => {
    updateVisibleRange();
  };

  const visibleItems = items.slice(visibleRange.start, visibleRange.end);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={cn("overflow-auto", className)}
      style={{ position: "relative" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, index) => {
          const actualIndex = visibleRange.start + index;
          return (
            <div
              key={getKey(item, actualIndex)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: itemHeight,
                transform: `translateY(${actualIndex * itemHeight}px)`,
              }}
            >
              {renderItem(item, actualIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
