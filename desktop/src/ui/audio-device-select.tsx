"use client";

import { Settings } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useMediaDeviceSettings } from "@/hooks/useMediaDeviceSettings";
import { cn } from "@/utils/utils";

interface AudioDeviceSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showIcon?: boolean;
  variant?: 'compact' | 'default';
}

export function AudioDeviceSelect({
  value,
  onValueChange,
  disabled = false,
  className = "",
  showIcon = true,
  variant = 'compact',
}: AudioDeviceSelectProps) {
  const { availableAudioInputs } = useMediaDeviceSettings();

  const triggerClassName = variant === 'compact' 
    ? cn(
        "h-6 text-sm text-foreground border-0 bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer",
        className
      )
    : cn(
        "h-10 px-3 text-sm text-foreground border border-input bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-fit",
        className
      );

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || availableAudioInputs.length === 0}
    >
      <SelectTrigger className={triggerClassName}>
        {showIcon && <Settings className="h-4 w-4 mr-2 flex-shrink-0" />}
        <SelectValue placeholder="Mic" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default</SelectItem>
        {availableAudioInputs.map((device, index) => (
          <SelectItem key={device.deviceId} value={device.deviceId || `device-${index}`}>
            {device.label || `Mic ${index + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}