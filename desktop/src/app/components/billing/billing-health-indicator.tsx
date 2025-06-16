"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Alert, AlertDescription } from "@/ui/alert";
import { getErrorMessage } from "@/utils/error-handling";

interface BillingHealthData {
  overall_status: "healthy" | "degraded" | "critical";
  stripe_connectivity: boolean;
  database_connectivity: boolean;
  service_availability: boolean;
  last_checked: string;
  issues: string[];
}

interface BillingHealthIndicatorProps {
  className?: string;
}

export function BillingHealthIndicator({ className }: BillingHealthIndicatorProps) {
  const [healthData, setHealthData] = useState<BillingHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkBillingHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await invoke<BillingHealthData>("check_billing_health_command");
      setHealthData(result);
    } catch (err) {
      console.error("Billing health check failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBillingHealth();
  }, [checkBillingHealth]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-600 bg-green-50 border-green-200";
      case "degraded":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "critical":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4" />;
      case "critical":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Checking billing system health...</span>
      </div>
    );
  }

  if (error || !healthData) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{error || "Failed to check billing system health"}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={checkBillingHealth}
            className="ml-2 h-7"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Badge className={getStatusColor(healthData.overall_status)}>
          {getStatusIcon(healthData.overall_status)}
          <span className="ml-1 capitalize">{healthData.overall_status}</span>
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkBillingHealth}
          className="h-7 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          Last checked: {new Date(healthData.last_checked).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1">
          {healthData.stripe_connectivity ? (
            <CheckCircle className="h-3 w-3 text-green-600" />
          ) : (
            <XCircle className="h-3 w-3 text-red-600" />
          )}
          <span className="text-muted-foreground">Stripe</span>
        </div>
        <div className="flex items-center gap-1">
          {healthData.database_connectivity ? (
            <CheckCircle className="h-3 w-3 text-green-600" />
          ) : (
            <XCircle className="h-3 w-3 text-red-600" />
          )}
          <span className="text-muted-foreground">Database</span>
        </div>
        <div className="flex items-center gap-1">
          {healthData.service_availability ? (
            <CheckCircle className="h-3 w-3 text-green-600" />
          ) : (
            <XCircle className="h-3 w-3 text-red-600" />
          )}
          <span className="text-muted-foreground">Services</span>
        </div>
      </div>

      {healthData.issues && healthData.issues.length > 0 && (
        <Alert variant="destructive" className="mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-medium">Issues detected:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {healthData.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}