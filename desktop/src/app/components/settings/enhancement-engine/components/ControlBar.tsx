import { Button, Badge, Tooltip } from "@/ui";
import { Zap, Undo2, Download, Upload } from "lucide-react";

interface ControlBarProps {
  recommendationsCount: number;
  canUndo: boolean;
  onToggleRecommendations: () => void;
  onUndo: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function ControlBar({
  recommendationsCount,
  canUndo,
  onToggleRecommendations,
  onUndo,
  onExport,
  onImport
}: ControlBarProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Tooltip>
        <Button
          variant={recommendationsCount > 0 ? "default" : "ghost"}
          size="sm"
          onClick={onToggleRecommendations}
          className="relative cursor-pointer"
        >
          <Zap className="h-4 w-4 mr-1" />
          AI
          {recommendationsCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 text-xs p-0 flex items-center justify-center">
              {recommendationsCount}
            </Badge>
          )}
        </Button>
        <div className="text-xs">AI Recommendations</div>
      </Tooltip>
      
      <Tooltip>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          className="cursor-pointer"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <div className="text-xs">Undo Last Change</div>
      </Tooltip>
      
      <Tooltip>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExport}
          className="cursor-pointer"
        >
          <Download className="h-4 w-4" />
        </Button>
        <div className="text-xs">Export Settings</div>
      </Tooltip>
      
      <Tooltip>
        <Button
          variant="ghost"
          size="sm"
          onClick={onImport}
          className="cursor-pointer"
        >
          <Upload className="h-4 w-4" />
        </Button>
        <div className="text-xs">Import Settings</div>
      </Tooltip>
    </div>
  );
}