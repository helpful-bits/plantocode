import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui";
import { GEMINI_VIDEO_MODELS } from '../../../types/video-analysis-types';

interface VideoAnalysisModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

// Map GEMINI_VIDEO_MODELS to display format
const VIDEO_MODELS = GEMINI_VIDEO_MODELS.map(modelId => {
  // Extract model name from ID (e.g., "google/gemini-1.5-pro-latest" -> "Gemini 1.5 Pro")
  const modelName = modelId
    .split('/')[1]
    .split('-')
    .map((part, i) => {
      if (i === 0) return part.charAt(0).toUpperCase() + part.slice(1);
      if (part === 'latest') return '';
      if (part.match(/^\d/)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ');

  return {
    id: modelId,
    name: modelName,
    provider: 'Google'
  };
});

export const VideoAnalysisModelSelector: React.FC<VideoAnalysisModelSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {VIDEO_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{model.provider}</span>
              <span>{model.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};