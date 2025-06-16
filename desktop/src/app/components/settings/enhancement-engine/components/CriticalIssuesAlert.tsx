import { Alert, Button } from "@/ui";
import { AlertTriangle } from "lucide-react";
import { SmartRecommendation } from "../types";

interface CriticalIssuesAlertProps {
  issues: SmartRecommendation[];
  onRecommendationApply: (recommendation: SmartRecommendation) => void;
}

export function CriticalIssuesAlert({ issues, onRecommendationApply }: CriticalIssuesAlertProps) {
  const criticalRecommendations = issues.filter(r => r.priority === 'critical');

  if (criticalRecommendations.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">Critical Configuration Issues</p>
          <p className="text-sm mt-1">
            {criticalRecommendations.length} critical issue{criticalRecommendations.length > 1 ? 's' : ''} requiring attention
          </p>
        </div>
        <Button size="sm" onClick={() => criticalRecommendations.forEach(onRecommendationApply)} className="cursor-pointer">
          Fix Now
        </Button>
      </div>
    </Alert>
  );
}