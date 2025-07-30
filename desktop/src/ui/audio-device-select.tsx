"use client";

import { Settings } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useAudioInputDevices } from "@/hooks/use-voice-recording";

interface AudioDeviceSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  showIcon?: boolean;
}

export function AudioDeviceSelect({
  value,
  onValueChange,
  disabled = false,
  className = "",
  showIcon = true,
}: AudioDeviceSelectProps) {
  const { availableAudioInputs } = useAudioInputDevices();

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || availableAudioInputs.length === 0}
    >
      <SelectTrigger className={`h-6 text-sm border-0 bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer ${className}`}>
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