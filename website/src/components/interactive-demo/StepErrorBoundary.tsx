/**
 * Individual step error boundary - prevents single step failures from crashing entire demo
 */
'use client';

import React, { Component, ReactNode } from 'react';

interface StepErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface StepErrorBoundaryProps {
  children: ReactNode;
  stepTitle: string;
  stepId: number;
  onError?: (stepId: number, error: Error) => void;
}

export class StepErrorBoundary extends Component<StepErrorBoundaryProps, StepErrorBoundaryState> {
  constructor(props: StepErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): StepErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Step ${this.props.stepId} (${this.props.stepTitle}) error:`, error, errorInfo);
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(this.props.stepId, error);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full p-6 text-center bg-destructive/5 border border-destructive/20 rounded-lg">
          <div className="mb-4">
            <svg 
              className="mx-auto h-12 w-12 text-destructive/60" 
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
          
          <h3 className="text-lg font-semibold text-destructive mb-2">
            Step {this.props.stepId} Error
          </h3>
          
          <p className="text-sm text-muted-foreground mb-4">
            The "{this.props.stepTitle}" step encountered an error but other steps continue to work.
          </p>

          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            aria-label={`Retry ${this.props.stepTitle} step`}
          >
            Retry Step
          </button>
          
          {/* Show error details in development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 text-left p-3 bg-background/50 rounded border text-xs">
              <summary className="font-medium cursor-pointer">Error Details</summary>
              <pre className="mt-2 text-red-600 overflow-auto whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}