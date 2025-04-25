"use client";

import React, { useState, useRef } from 'react';
import { useBackgroundRequests } from '@/lib/contexts/background-requests-context';
import { GeminiRequest } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, Clock, RefreshCw, X, Trash2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

export const BackgroundRequestsSidebar: React.FC = () => {
  const { 
    activeRequests, 
    isLoading, 
    error, 
    fetchActiveRequests, 
    cancelRequest, 
    clearHistory 
  } = useBackgroundRequests();
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const refreshClickedRef = useRef(false);
  
  // Handle manual refresh with debounce
  const handleRefresh = async () => {
    // Prevent duplicate clicks
    if (refreshClickedRef.current || isLoading) return;
    
    refreshClickedRef.current = true;
    try {
      await fetchActiveRequests();
    } finally {
      // Reset after a delay to prevent rapid clicks
      setTimeout(() => {
        refreshClickedRef.current = false;
      }, 1000);
    }
  };
  
  // Handle cancellation of a request
  const handleCancel = async (requestId: string) => {
    setIsCancelling(prev => ({ ...prev, [requestId]: true }));
    try {
      await cancelRequest(requestId);
    } finally {
      setIsCancelling(prev => ({ ...prev, [requestId]: false }));
    }
  };
  
  // Handle clearing of history
  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearHistory();
    } finally {
      setIsClearing(false);
    }
  };
  
  // Helper to truncate text
  const truncateText = (text: string, maxLength = 50) => {
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  };
  
  // Helper to get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'preparing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'canceled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };
  
  // Format time ago
  const formatTimeAgo = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return 'unknown time';
    }
  };
  
  // No-requests state
  if (activeRequests.length === 0 && !isLoading && !error) {
    return (
      <div className="fixed left-0 top-0 bottom-0 w-64 border-r border-gray-200 bg-gray-50 overflow-hidden transition-all duration-500 ease-in-out">
        <div className="flex justify-between items-center p-4 h-14 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-700">Background Jobs</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ScrollArea className="h-[calc(100vh-60px)]">
          <div className="flex items-center justify-center h-[calc(100vh-120px)] min-h-[200px]">
            <p className="text-sm text-gray-500">No active background jobs</p>
          </div>
        </ScrollArea>
      </div>
    );
  }
  
  return (
    <div className={`fixed left-0 top-0 bottom-0 border-r border-gray-200 bg-gray-50 overflow-hidden transition-all duration-500 ease-in-out ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <div className="flex justify-between items-center p-4 h-14 border-b border-gray-200">
        {!isCollapsed && (
          <h2 className="text-lg font-semibold text-gray-700">Background Jobs</h2>
        )}
        <div className="flex">
          {!isCollapsed && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading}>
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={handleClearHistory} 
                      disabled={isClearing || activeRequests.length === 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear history</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(!isCollapsed)}>
                  {isCollapsed ? <RefreshCw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isCollapsed ? 'Expand' : 'Collapse'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {error && !isCollapsed && (
        <div className="bg-red-50 text-red-700 p-2 text-xs m-2 rounded">
          {error}
        </div>
      )}
      
      {!isCollapsed && (
        <ScrollArea className="h-[calc(100vh-60px)] pb-4">
          <div className="space-y-2 p-2 min-h-[200px]">
            {activeRequests.map((request) => (
              <Collapsible key={request.id} className="border rounded-md bg-white">
                <CollapsibleTrigger className="w-full flex justify-between items-center p-2 hover:bg-gray-50 h-10">
                  <div className="flex items-center space-x-2">
                    <span className="w-4 flex-shrink-0">{getStatusIcon(request.status)}</span>
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {truncateText(request.prompt.split('\n')[0], 20)}
                    </span>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={request.status === 'running' ? 'default' : 'outline'}>
                      {request.status}
                    </Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-2 text-xs border-t bg-gray-50 transition-all">
                  <div className="space-y-1">
                    <div>
                      <span className="font-semibold">Created:</span> {formatTimeAgo(request.createdAt)}
                    </div>
                    {request.startTime && (
                      <div>
                        <span className="font-semibold">Started:</span> {formatTimeAgo(request.startTime)}
                      </div>
                    )}
                    {request.tokensReceived > 0 && (
                      <div>
                        <span className="font-semibold">Tokens:</span> {request.tokensReceived}
                      </div>
                    )}
                    <div className="mt-2">
                      <span className="font-semibold">Prompt:</span>
                      <div className="mt-1 bg-gray-100 p-1 rounded whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {truncateText(request.prompt, 150)}
                      </div>
                    </div>
                    {(request.status === 'running' || request.status === 'preparing') && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="mt-2 w-full"
                        onClick={() => handleCancel(request.id)}
                        disabled={isCancelling[request.id]}
                      >
                        {isCancelling[request.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <X className="h-3 w-3 mr-1" />
                        )}
                        Cancel
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}; 