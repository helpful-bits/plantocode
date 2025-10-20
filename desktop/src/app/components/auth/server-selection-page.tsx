/**
 * Server Selection Page Component for PlanToCode Desktop
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Button } from "@/ui/button";
import type { ServerRegionInfo } from "@/types/tauri-commands";

interface ServerSelectionPageProps {
  regions: ServerRegionInfo[];
  onSelect: (url: string) => void;
}

export default function ServerSelectionPage({ regions, onSelect }: ServerSelectionPageProps) {
  const [selectedUrl, setSelectedUrl] = useState<string>("");

  const handleContinue = () => {
    if (selectedUrl) {
      onSelect(selectedUrl);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-card dark:bg-gradient-to-br dark:from-background dark:via-popover dark:to-muted p-4">
      <Card className="w-full max-w-md bg-background/95 backdrop-blur-sm border-border/60 shadow-soft rounded-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            Choose Your Server Region
          </CardTitle>
          <CardDescription className="text-base">
            Select the server region closest to your location for optimal performance
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Select value={selectedUrl} onValueChange={setSelectedUrl}>
              <SelectTrigger>
                <SelectValue placeholder="Select a server region" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region.url} value={region.url}>
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleContinue}
              disabled={!selectedUrl}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}