"use client";

import { Globe, Check, MapPin } from "lucide-react";
import { cn } from "@/utils/utils";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import type { ServerRegionInfo } from "@/types/tauri-commands";

interface RegionSelectorProps {
  regions: ServerRegionInfo[];
  currentRegion: string | null;
  onRegionChange: (region: string) => void;
  disabled?: boolean;
  className?: string;
}

export function RegionSelector({
  regions,
  currentRegion,
  onRegionChange,
  disabled = false,
  className,
}: RegionSelectorProps) {
  const currentRegionInfo = regions.find(r => r.url === currentRegion);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="Select server region"
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !currentRegionInfo && "text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>{currentRegionInfo ? currentRegionInfo.label : "Select a region..."}</span>
          </div>
          <MapPin className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-[320px] p-0" 
        align="start"
        sideOffset={4}
      >
        <div className="max-h-[400px] overflow-y-auto">
          <div className="p-1">
            {regions.map((region) => (
              <button
                key={region.url}
                onClick={() => onRegionChange(region.url)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer",
                  currentRegion === region.url && "bg-accent/50 font-medium"
                )}
              >
                <span>{region.label}</span>
                {currentRegion === region.url && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}