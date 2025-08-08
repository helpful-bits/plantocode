import { AlertCircle, RefreshCw, Loader2 } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader } from "@/ui/card";


export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-soft backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-1.5 w-full bg-muted rounded animate-pulse" />
              <div className="flex justify-between">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border/60 bg-card text-card-foreground shadow-soft backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-12 bg-muted rounded animate-pulse" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
            <div className="flex justify-between items-center">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="h-10 w-full bg-muted rounded-lg animate-pulse" />
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-4 p-6">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
        <div>
          <h3 className="font-semibold mb-2 text-foreground">Billing Error</h3>
          <p className="text-sm text-muted-foreground leading-7">
            {message}
          </p>
        </div>
        <Button
          onClick={onRetry}
          variant="destructive"
          className="shadow-soft hover:shadow-soft-md backdrop-blur-sm transition-all duration-200"
          size="sm"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  );
}


interface ProcessingStateProps {
  title: string;
  description?: string;
  progress?: number;
}

export function ProcessingState({ title, description, progress }: ProcessingStateProps) {
  return (
    <div className="content-spacing">
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-3 bg-primary/10 rounded-full">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
        {progress !== undefined && (
          <div className="w-64 space-y-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="h-2 bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
          </div>
        )}
      </div>
    </div>
  );
}
