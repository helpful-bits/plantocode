import { Button, Badge } from "@/ui";
import { SmartRecommendation } from "../types";

interface RecommendationsPanelProps {
  recommendations: SmartRecommendation[];
  isVisible: boolean;
  onClose: () => void;
  onApplyRecommendation: (recommendation: SmartRecommendation) => void;
}

export function RecommendationsPanel({ 
  recommendations, 
  isVisible, 
  onClose, 
  onApplyRecommendation 
}: RecommendationsPanelProps) {
  if (!isVisible || recommendations.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
            AI Recommendations
          </h3>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            {recommendations.length} insights
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-blue-600 hover:text-blue-800 cursor-pointer"
        >
          Close
        </Button>
      </div>
      
      <div className="grid gap-3">
        {recommendations.slice(0, 4).map(rec => (
          <div key={rec.id} className="bg-white dark:bg-gray-900 p-4 rounded-lg border shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    variant={rec.priority === 'critical' ? 'destructive' : rec.priority === 'warning' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {rec.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{rec.confidence}% confidence</span>
                </div>
                
                <h4 className="font-medium text-sm mb-1">{rec.title}</h4>
                <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-green-700">Impact:</span>
                    <p className="text-green-600">{rec.estimatedImprovement}</p>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">Change:</span>
                    <p className="text-blue-600">{rec.currentValue} → {rec.recommendedValue}</p>
                  </div>
                </div>
              </div>
              
              <Button
                size="sm"
                onClick={() => onApplyRecommendation(rec)}
                disabled={!rec.automatable}
                className="text-xs h-7 cursor-pointer ml-4"
              >
                {rec.automatable ? 'Apply' : 'Review'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}