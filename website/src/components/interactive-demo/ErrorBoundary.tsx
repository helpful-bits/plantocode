/**
 * ErrorBoundary - React error boundary for the interactive demo system.
 * 
 * Provides graceful error handling with user-friendly fallbacks when
 * the interactive demo encounters runtime errors. Includes accessibility
 * compliance and recovery options.
 */
'use client';

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging
    console.error('Interactive demo error boundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback or default error UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div 
          className="max-w-4xl mx-auto p-6 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-8">
            <div className="mb-6">
              <svg 
                className="mx-auto h-16 w-16 text-destructive/60" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
                aria-hidden="true"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={1} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" 
                />
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-destructive mb-4">
              Interactive Demo Encountered an Error
            </h2>
            
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              We're sorry, but the interactive demo has encountered an unexpected error. 
              You can try to restart the demo or refresh the page.
            </p>

            {/* Error details for development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mb-6 p-4 bg-background/50 rounded border">
                <summary className="font-semibold cursor-pointer">Error Details</summary>
                <pre className="mt-2 text-xs text-red-600 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Try to restart the interactive demo"
              >
                Try Again
              </button>
              
              <button
                onClick={this.handleRefresh}
                className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 focus:ring-2 focus:ring-secondary/50 focus:ring-offset-2 transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Refresh the entire page"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;