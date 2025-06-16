import { Button, Badge } from "@/ui";
import { BulkOperation } from "../types";

interface BulkOperationsPanelProps {
  operations: BulkOperation[];
  onPreviewOperation: (operation: BulkOperation) => void;
}

export function BulkOperationsPanel({ operations, onPreviewOperation }: BulkOperationsPanelProps) {
  if (operations.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-amber-900 dark:text-amber-100">Bulk Optimization Available</h4>
        <Badge variant="outline" className="text-amber-700">
          {operations.length} operation{operations.length > 1 ? 's' : ''}
        </Badge>
      </div>
      
      <div className="grid gap-2">
        {operations.map(op => (
          <div key={op.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border">
            <div>
              <div className="font-medium text-sm">{op.name}</div>
              <div className="text-xs text-muted-foreground">{op.description}</div>
              <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <span>{op.estimatedTime} min, {op.targetTasks.length} tasks, {op.riskLevel} risk</span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => onPreviewOperation(op)}
              className="text-xs cursor-pointer"
            >
              Preview
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}