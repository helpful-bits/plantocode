"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  ScrollArea,
  Alert,
  AlertDescription,
} from "@/ui";
import { CheckCircle, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/utils/utils";

interface BulkOperationChange {
  task: string;
  field: string;
  from: any;
  to: any;
  impact: 'positive' | 'neutral' | 'needs-review';
}

interface BulkOperation {
  id: string;
  type: 'model-sync' | 'optimize-all' | 'reset-defaults' | 'apply-preset';
  name: string;
  description: string;
  targetTasks: string[];
  previewChanges: BulkOperationChange[];
  estimatedTime: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface BulkOperationPreviewModalProps {
  operation: BulkOperation | null;
  isOpen: boolean;
  onClose: () => void;
  onApply: (operation: BulkOperation) => Promise<void>;
}

export function BulkOperationPreviewModal({
  operation,
  isOpen,
  onClose,
  onApply,
}: BulkOperationPreviewModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleApply = async () => {
    if (!operation) return;

    setIsApplying(true);
    setError(null);

    try {
      await onApply(operation);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply operation");
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    if (isApplying) return;
    setError(null);
    setSuccess(false);
    onClose();
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'positive':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'needs-review':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-gray-300" />;
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">unset</span>;
    }
    if (typeof value === 'boolean') {
      return value ? 'enabled' : 'disabled';
    }
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  };

  if (!operation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold">
                {operation.name}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {operation.description}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getRiskColor(operation.riskLevel) as any}>
                {operation.riskLevel} risk
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {operation.estimatedTime} min
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              Operation applied successfully!
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 min-h-0">
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-2">Operation Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {operation.targetTasks.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Tasks Affected
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {operation.previewChanges.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Settings Changes
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {operation.previewChanges.filter(c => c.impact === 'positive').length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Improvements
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="text-lg font-medium mb-3">Changes Preview</h3>
            <ScrollArea className="h-64 border rounded-lg">
              <div className="p-4 space-y-3">
                {operation.previewChanges.map((change, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all duration-200",
                      change.impact === 'positive' && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                      change.impact === 'needs-review' && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800",
                      change.impact === 'neutral' && "bg-muted/30 border-border"
                    )}
                  >
                    <div className="flex-shrink-0">
                      {getImpactIcon(change.impact)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {change.task}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {change.field}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <div className="text-right">
                        <div className="text-muted-foreground">
                          {formatValue(change.from)}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="text-right">
                        <div className="font-medium">
                          {formatValue(change.to)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {operation.previewChanges.some(c => c.impact === 'needs-review') && (
            <Alert variant="warning" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Some changes require review. Please carefully examine the changes marked 
                with a warning icon before proceeding.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isApplying}
            isLoading={isApplying}
            loadingText="Applying Changes..."
            className={cn(
              operation.riskLevel === 'high' && "bg-destructive hover:bg-destructive/85",
              operation.riskLevel === 'medium' && "bg-warning hover:bg-warning/85"
            )}
          >
            {isApplying ? "Applying..." : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkOperationPreviewModal;