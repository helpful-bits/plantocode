'use client';

import { useState, useEffect, useRef } from 'react';
import { memoryManager } from '../../utils/performance';

interface WebVitalsMetric {
  id: string;
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
}

interface PerformanceMonitorProps {
  metrics: WebVitalsMetric[];
  enableMemoryMonitoring?: boolean;
  enableRenderTracking?: boolean;
  enableBundleAnalysis?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  theme?: 'dark' | 'light';
}

export function PerformanceMonitor({
  metrics,
  enableMemoryMonitoring = true,
  enableRenderTracking = true,
  enableBundleAnalysis = false,
  position = 'bottom-right',
  theme = 'dark',
}: PerformanceMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [memoryInfo, setMemoryInfo] = useState<{
    used: number;
    total: number;
    limit: number;
  } | null>(null);
  const [renderCount, setRenderCount] = useState(0);
  const [renderTime, setRenderTime] = useState(0);
  const [bundleSize, setBundleSize] = useState<number | null>(null);
  const renderStartTime = useRef<number>(0);

  // Track component renders
  useEffect(() => {
    if (enableRenderTracking) {
      renderStartTime.current = performance.now();
      setRenderCount(prev => prev + 1);
      
      return () => {
        const endTime = performance.now();
        setRenderTime(endTime - renderStartTime.current);
      };
    }
  });

  // Memory monitoring
  useEffect(() => {
    if (!enableMemoryMonitoring) return;

    const updateMemoryInfo = () => {
      const info = memoryManager.getMemoryInfo();
      if (info) {
        setMemoryInfo({
          used: Math.round(info.usedJSHeapSize / 1024 / 1024),
          total: Math.round(info.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(info.jsHeapSizeLimit / 1024 / 1024),
        });
      }
    };

    updateMemoryInfo();
    const interval = setInterval(updateMemoryInfo, 1000);

    return () => clearInterval(interval);
  }, [enableMemoryMonitoring]);

  // Bundle analysis
  useEffect(() => {
    if (!enableBundleAnalysis || typeof window === 'undefined') return;

    const calculateBundleSize = () => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const jsResources = resources.filter(resource => 
        resource.name.includes('.js') || resource.name.includes('/_next/static')
      );
      
      const totalSize = jsResources.reduce((sum, resource) => {
        return sum + (resource.transferSize || 0);
      }, 0);

      setBundleSize(Math.round(totalSize / 1024));
    };

    calculateBundleSize();
  }, [enableBundleAnalysis]);

  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  // Theme classes
  const themeClasses = {
    dark: 'bg-gray-900/95 text-white border-gray-700',
    light: 'bg-white/95 text-gray-900 border-gray-300',
  };

  // Metric rating colors
  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'text-green-400';
      case 'needs-improvement': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  // Format metric value
  const formatMetricValue = (name: string, value: number) => {
    if (name === 'CLS') {
      return value.toFixed(3);
    }
    return `${Math.round(value)}ms`;
  };

  // Get metric thresholds
  const getMetricThreshold = (name: string) => {
    const thresholds: Record<string, { good: number; poor: number }> = {
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 },
      FCP: { good: 1800, poor: 3000 },
      TTFB: { good: 800, poor: 1800 },
    };
    return thresholds[name];
  };

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 transition-all duration-300 ${
        isExpanded ? 'w-80' : 'w-12'
      }`}
    >
      <div
        className={`${themeClasses[theme]} border rounded-lg shadow-lg backdrop-blur-sm transition-all duration-300 ${
          isExpanded ? 'p-4' : 'p-2'
        }`}
      >
        {/* Toggle button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute top-2 right-2 text-xs hover:opacity-70 transition-opacity"
          title={isExpanded ? 'Minimize' : 'Expand Performance Monitor'}
        >
          {isExpanded ? '−' : '📊'}
        </button>

        {isExpanded && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Performance Monitor</h3>
              <span className="text-xs opacity-70">
                {renderCount} renders
              </span>
            </div>

            {/* Core Web Vitals */}
            {metrics.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 opacity-80">Core Web Vitals</h4>
                <div className="space-y-1">
                  {metrics.slice(-5).map((metric) => {
                    const threshold = getMetricThreshold(metric.name);
                    return (
                      <div key={metric.id} className="flex justify-between items-center text-xs">
                        <span className="flex items-center gap-1">
                          {metric.name}
                          {threshold && (
                            <span className="text-xs opacity-50">
                              (←{threshold.good}←{threshold.poor})
                            </span>
                          )}
                        </span>
                        <span className={`font-mono ${getRatingColor(metric.rating || 'good')}`}>
                          {formatMetricValue(metric.name, metric.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Memory Info */}
            {enableMemoryMonitoring && memoryInfo && (
              <div>
                <h4 className="text-xs font-semibold mb-2 opacity-80">Memory Usage</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Used:</span>
                    <span className="font-mono">
                      {memoryInfo.used}MB / {memoryInfo.total}MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usage:</span>
                    <span className={`font-mono ${
                      (memoryInfo.used / memoryInfo.total) > 0.8 ? 'text-red-400' :
                      (memoryInfo.used / memoryInfo.total) > 0.6 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {Math.round((memoryInfo.used / memoryInfo.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all duration-300 ${
                        (memoryInfo.used / memoryInfo.total) > 0.8 ? 'bg-red-400' :
                        (memoryInfo.used / memoryInfo.total) > 0.6 ? 'bg-yellow-400' :
                        'bg-green-400'
                      }`}
                      style={{ width: `${(memoryInfo.used / memoryInfo.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Render Info */}
            {enableRenderTracking && (
              <div>
                <h4 className="text-xs font-semibold mb-2 opacity-80">Render Performance</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Renders:</span>
                    <span className="font-mono">{renderCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Render:</span>
                    <span className={`font-mono ${
                      renderTime > 16 ? 'text-red-400' :
                      renderTime > 8 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {renderTime.toFixed(2)}ms
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Bundle Analysis */}
            {enableBundleAnalysis && bundleSize && (
              <div>
                <h4 className="text-xs font-semibold mb-2 opacity-80">Bundle Size</h4>
                <div className="text-xs">
                  <div className="flex justify-between">
                    <span>JS Assets:</span>
                    <span className={`font-mono ${
                      bundleSize > 1000 ? 'text-red-400' :
                      bundleSize > 500 ? 'text-yellow-400' :
                      'text-green-400'
                    }`}>
                      {bundleSize}KB
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="border-t pt-2 mt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && (window as any).gc) {
                      (window as any).gc();
                    }
                  }}
                  className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                  title="Force garbage collection (Chrome DevTools only)"
                >
                  GC
                </button>
                <button
                  onClick={() => {
                    const metrics = performance.getEntriesByType('measure');
                    console.table(metrics);
                  }}
                  className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-white transition-colors"
                  title="Log performance metrics to console"
                >
                  Log
                </button>
                <button
                  onClick={() => {
                    performance.clearMeasures();
                    performance.clearMarks();
                    setRenderCount(0);
                  }}
                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
                  title="Clear performance data"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}