'use client';

import { useState } from 'react';
import { useAnimationPerformance } from '@/hooks/useAnimationPerformance';

/**
 * Animation Performance Monitor Component
 * 
 * Visual display of animation performance metrics in development mode
 */
export function AnimationPerformanceMonitor() {
  const { metrics, optimizationSuggestions } = useAnimationPerformance();
  const [isVisible, setIsVisible] = useState(false);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="bg-black/80 text-white px-3 py-2 rounded-lg text-sm font-mono"
      >
        {metrics.fps} FPS
      </button>
      
      {isVisible && (
        <div className="absolute bottom-full right-0 mb-2 bg-black/90 text-white p-4 rounded-lg text-sm font-mono min-w-[300px]">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>FPS: {metrics.fps}</div>
            <div>Avg: {metrics.averageFps}</div>
            <div>Frame Time: {metrics.frameTime}ms</div>
            <div>Status: {metrics.isLowPerformance ? '⚠️ Low' : '✅ Good'}</div>
          </div>
          
          {metrics.memoryUsage && (
            <div className="mb-3">Memory: {metrics.memoryUsage}MB</div>
          )}
          
          {optimizationSuggestions.length > 0 && (
            <div>
              <div className="font-bold mb-1">Suggestions:</div>
              {optimizationSuggestions.map((suggestion, index) => (
                <div key={index} className="text-xs text-yellow-300 mb-1">
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}