"use client";

import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Wrench,
  AlertCircle,
  Trash2,
  Database,
  FileDown,
  HardDrive,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

import {
  type DatabaseErrorCategory,
  type DatabaseErrorSeverity,
} from "@/types/error-types";
import { extractErrorInfo, createUserFriendlyErrorMessage } from "@/utils/error-handling";

import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./dialog";

type DatabaseHealthData = {
  status: "ok" | "error" | "warning" | "checking";
  fileExists: boolean;
  fileSize: number | null;
  filePermissions: string | null;
  setupSuccess: boolean;
  integrityStatus: string | null;
  integrityDetails: unknown;
  recoveryMode: boolean;
  needsRepair: boolean;
  error: string | null;
  errorCategory?: DatabaseErrorCategory;
  errorSeverity?: DatabaseErrorSeverity;
  details: unknown;
  lastModified: string | null;
};

export default function DatabaseErrorHandler() {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAttemptingRepair, setIsAttemptingRepair] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState<boolean | null>(null);
  const [repairStatus, setRepairStatus] = useState("");
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<DatabaseHealthData | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [structuredErrorInfo, setStructuredErrorInfo] = useState<ReturnType<typeof extractErrorInfo> | null>(null);
  
  // Store timeout IDs for cleanup
  const timeoutIdsRef = useRef<Set<number>>(new Set());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutIdsRef.current) {
        clearTimeout(timeoutId);
      }
      timeoutIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    // Listen for database connection errors
    const handleError = (event: CustomEvent<{type?: string; message?: string}>) => {
      if (event.detail && event.detail.type === "database_error") {
        const errorMsg = event.detail.message || "Database connection failed";
        setErrorMessage(errorMsg);
        
        // Extract structured error information for better guidance
        const errorInfo = extractErrorInfo(errorMsg);
        setStructuredErrorInfo(errorInfo);
        
        setIsOpen(true);
        setRepairSuccess(null);
        setRepairStatus("");
        setBackupPath(null);
        // Check database health when error occurs
        void checkDatabaseHealth();
      }
    };

    // Add event listener
    window.addEventListener(
      "database_error",
      handleError as EventListener
    );

    // Clean up listener
    return () => {
      window.removeEventListener(
        "database_error",
        handleError as EventListener
      );
    };
  }, []);

  const checkDatabaseHealth = async () => {
    setIsCheckingHealth(true);
    try {
      // Use Tauri command to check database health
      const data = await invoke<DatabaseHealthData>(
        "check_database_health_command"
      );
      setHealthData(data);
    } catch (_error) {
      console.error("Error checking database health:", _error);
      setHealthData(null);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleRepairAttempt = async (): Promise<void> => {
    setIsAttemptingRepair(true);
    setRepairStatus("Attempting database repair...");
    try {
      // Use Tauri command to repair database
      const result = await invoke<{
        success: boolean;
        error?: string;
        backup?: string;
      }>("repair_database_command");

      if (result.success) {
        setRepairSuccess(true);
        setRepairStatus(
          "Database repair was successful. The application will now refresh."
        );
        setBackupPath(result.backup || null);

        const timeoutId = window.setTimeout(() => {
          window.location.reload();
        }, 2000);
        timeoutIdsRef.current.add(timeoutId);
      } else {
        setRepairSuccess(false);
        setRepairStatus(`Repair failed: ${result.error || "Unknown error"}`);
        setBackupPath(result.backup || null);
        // Check database health again to update status
        await checkDatabaseHealth();
      }
    } catch (_error) {
      setRepairSuccess(false);
      setRepairStatus(
        "Failed to repair database. Please try a full reset or contact support."
      );
      await checkDatabaseHealth();
    } finally {
      setIsAttemptingRepair(false);
    }
  };

  const handleFullReset = async (): Promise<void> => {
    if (
      !window.confirm(
        "WARNING: This will completely reset the database and delete all stored data. A backup will be created if possible. Continue?"
      )
    ) {
      return;
    }

    setIsAttemptingRepair(true);
    setRepairStatus("Performing full database reset...");
    try {
      // Use Tauri command to reset database
      const result = await invoke<{
        success: boolean;
        error?: string;
        backup?: string;
      }>("reset_database_command");

      if (result.success) {
        setRepairSuccess(true);
        setRepairStatus(
          "Database was successfully reset. The application will now refresh."
        );
        setBackupPath(result.backup || null);

        const timeoutId = window.setTimeout(() => {
          window.location.reload();
        }, 2000);
        timeoutIdsRef.current.add(timeoutId);
      } else {
        setRepairSuccess(false);
        setRepairStatus(`Reset failed: ${result.error || "Unknown error"}`);
        setBackupPath(result.backup || null);
        // Check database health again to update status
        await checkDatabaseHealth();
      }
    } catch (_error) {
      setRepairSuccess(false);
      setRepairStatus("Failed to reset database. Please contact support.");
      await checkDatabaseHealth();
    } finally {
      setIsAttemptingRepair(false);
    }
  };

  // Generate specific guidance based on health data and error type
  const getRepairGuidance = () => {
    if (!healthData) {
      // Provide guidance based on structured error info if health data is not available
      if (structuredErrorInfo) {
        const userFriendlyMessage = createUserFriendlyErrorMessage(structuredErrorInfo, "database");
        return (
          <Alert className="my-4 bg-info/10 border-info/30">
            <AlertTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-info" />
              Error Analysis
            </AlertTitle>
            <AlertDescription>
              <p className="mb-2">{userFriendlyMessage}</p>
              <p className="text-sm text-muted-foreground">
                {(() => {
                  switch (structuredErrorInfo.type) {
                    case "DATABASE_ERROR":
                      return "This appears to be a database-specific error. Try running the database health check first.";
                    case "PERMISSION_ERROR":
                      return "The application may not have proper file system permissions to access the database.";
                    case "NETWORK_ERROR":
                      return "If using a remote database, check your network connection.";
                    case "CONFIGURATION_ERROR":
                      return "Check if the database configuration is correct in your settings.";
                    case "INTERNAL_ERROR":
                      return "This is an internal system error. Database repair or reset may be needed.";
                    case "WORKFLOW_ERROR":
                      if (structuredErrorInfo.workflowContext?.stageName) {
                        return `Database error occurred during ${structuredErrorInfo.workflowContext.stageName} workflow stage.`;
                      }
                      return "Database error occurred during workflow execution.";
                    default:
                      return "Run the database health check for more detailed diagnostics.";
                  }
                })()}
              </p>
              {structuredErrorInfo.type && (
                <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
                  <div className="font-medium mb-1">Error Classification:</div>
                  <div>Type: {structuredErrorInfo.type}</div>
                  {structuredErrorInfo.workflowContext && (
                    <div className="mt-1">
                      <div className="font-medium">Workflow Context:</div>
                      {structuredErrorInfo.workflowContext.stageName && (
                        <div>Stage: {structuredErrorInfo.workflowContext.stageName}</div>
                      )}
                      {structuredErrorInfo.workflowContext.retryAttempt && (
                        <div>Retry Attempt: {structuredErrorInfo.workflowContext.retryAttempt}</div>
                      )}
                    </div>
                  )}
                  {structuredErrorInfo.metadata && Object.keys(structuredErrorInfo.metadata).length > 0 && (
                    <div className="mt-1">Additional Info: {JSON.stringify(structuredErrorInfo.metadata, null, 2)}</div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        );
      }
      return null;
    }

    if (!healthData.fileExists) {
      return (
        <Alert className="my-4 bg-warning/10 border-warning/30">
          <AlertTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-warning" />
            Database File Missing
          </AlertTitle>
          <AlertDescription>
            <p>
              The database file is missing or cannot be found. This usually happens when:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>The application is running for the first time</li>
              <li>The database file was accidentally deleted</li>
              <li>There are permission issues with the data directory</li>
            </ul>
            <p className="mt-3 text-sm font-medium">
              Recommended action: <strong>Full Reset</strong> (will create a new database)
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    if (
      healthData.fileExists &&
      healthData.filePermissions &&
      parseInt(healthData.filePermissions, 8) < 600
    ) {
      return (
        <Alert className="my-4 bg-warning/10 border-warning/30">
          <AlertTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-warning" />
            Permission Issues
          </AlertTitle>
          <AlertDescription>
            <p>
              The database file has insufficient permissions (current: {healthData.filePermissions}). 
              The application needs read and write access to function properly.
            </p>
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
              <div className="font-medium mb-1">File Details:</div>
              <div>Permissions: {healthData.filePermissions}</div>
              {healthData.fileSize && <div>Size: {(healthData.fileSize / 1024).toFixed(2)} KB</div>}
            </div>
            <p className="mt-3 text-sm font-medium">
              Recommended action: <strong>Attempt Repair</strong> (will fix permissions)
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    if (healthData.integrityStatus === "invalid") {
      return (
        <Alert className="my-4 bg-destructive/10 border-destructive/30">
          <AlertTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-destructive" />
            Database Corruption Detected
          </AlertTitle>
          <AlertDescription>
            <p>
              The database integrity check failed, indicating potential corruption. This can happen due to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Unexpected application shutdown</li>
              <li>Disk space issues during writes</li>
              <li>Hardware problems</li>
              <li>Concurrent access conflicts</li>
            </ul>
            <p className="mt-3 text-sm">
              Try <strong>Attempt Repair</strong> first. If that fails, <strong>Full Reset</strong> may be necessary.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              ⚠️ Full reset will delete all stored sessions and data, but a backup will be created.
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    if (healthData.recoveryMode) {
      return (
        <Alert className="my-4 bg-blue-50 border-blue-200">
          <AlertTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-600" />
            Recovery Mode Active
          </AlertTitle>
          <AlertDescription>
            <p className="text-blue-800">
              The database is currently in recovery mode. This is an automatic response to detected issues.
            </p>
            <p className="mt-2 text-sm text-blue-700">
              Recommended action: <strong>Attempt Repair</strong> to complete the recovery process.
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    // Default guidance for other error cases
    const userFriendlyMessage = structuredErrorInfo 
      ? createUserFriendlyErrorMessage(structuredErrorInfo, "database")
      : "The database health check completed, but there may be connection or configuration issues.";
    
    return (
      <Alert className="my-4 bg-warning/10 border-warning/30">
        <AlertTitle className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          Database Connection Issue
        </AlertTitle>
        <AlertDescription>
          <p>{userFriendlyMessage}</p>
          {healthData.error && (
            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
              <div className="font-medium mb-1">Additional Details:</div>
              <div>{healthData.error}</div>
            </div>
          )}
          {structuredErrorInfo && structuredErrorInfo.type && (
            <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
              <div className="font-medium mb-1">Error Classification:</div>
              <div>Type: {structuredErrorInfo.type}</div>
              {structuredErrorInfo.metadata && Object.keys(structuredErrorInfo.metadata).length > 0 && (
                <div>Metadata: {JSON.stringify(structuredErrorInfo.metadata, null, 2)}</div>
              )}
            </div>
          )}
          <p className="mt-3 text-sm">
            Try <strong>Attempt Repair</strong> first. If issues persist, consider a <strong>Full Reset</strong>.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            💡 A backup will be created before any destructive operations.
          </p>
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Database Connection Error
          </DialogTitle>
          <DialogDescription>
            The application has encountered an issue connecting to its database.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="my-4">
          <AlertTitle>Error Details</AlertTitle>
          <AlertDescription>
            {/* User-friendly error message */}
            {structuredErrorInfo && (
              <div className="mb-3 p-3 bg-muted/30 rounded text-sm">
                <div className="font-medium mb-1">Summary:</div>
                <div>{createUserFriendlyErrorMessage(structuredErrorInfo, "database")}</div>
              </div>
            )}
            
            {/* Technical error details */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground mb-2">
                Technical Details
                <span className="ml-1 transition-transform group-open:rotate-90">▶</span>
              </summary>
              <div className="whitespace-pre-wrap text-xs mb-2 p-2 bg-destructive/5 rounded border border-border">{errorMessage}</div>
              {structuredErrorInfo && (
                <div className="mt-3 p-2 bg-muted/30 rounded text-xs">
                  <div className="font-medium mb-1">Error Classification:</div>
                  <div>Type: {structuredErrorInfo.type}</div>
                  {structuredErrorInfo.metadata && Object.keys(structuredErrorInfo.metadata).length > 0 && (
                    <div>Additional Info: {JSON.stringify(structuredErrorInfo.metadata, null, 2)}</div>
                  )}
                </div>
              )}
            </details>
          </AlertDescription>
        </Alert>

        {healthData && getRepairGuidance()}

        {healthData && (
          <div className="my-4 text-sm border border-border rounded-md p-3 bg-muted/50">
            <h4 className="font-medium mb-2">Database Diagnostics:</h4>
            <ul className="space-y-1 pl-2">
              <li>File exists: {healthData.fileExists ? "Yes" : "No"}</li>
              {healthData.fileSize && (
                <li>File size: {(healthData.fileSize / 1024).toFixed(2)} KB</li>
              )}
              {healthData.lastModified && (
                <li>
                  Last modified:{" "}
                  {new Date(healthData.lastModified).toLocaleString()}
                </li>
              )}
              {healthData.filePermissions && (
                <li>File permissions: {healthData.filePermissions}</li>
              )}
              <li>
                Integrity check: {healthData.integrityStatus || "Unknown"}
              </li>
              <li>
                Recovery mode: {healthData.recoveryMode ? "Active" : "Inactive"}
              </li>
            </ul>
          </div>
        )}

        {repairStatus && (
          <Alert
            variant={
              repairSuccess === true
                ? "default"
                : repairSuccess === false
                  ? "destructive"
                  : "default"
            }
            className="my-4"
          >
            <AlertTitle className="flex items-center gap-2">
              {repairSuccess === true && <AlertCircle className="h-4 w-4" />}
              {repairSuccess === false && <AlertTriangle className="h-4 w-4" />}
              {repairSuccess === null && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Repair Status
            </AlertTitle>
            <AlertDescription>{repairStatus}</AlertDescription>

            {backupPath && (
              <div className="mt-2 text-xs opacity-80">
                A backup was created at: {backupPath}
              </div>
            )}
          </Alert>
        )}

        {!healthData && !isCheckingHealth && (
          <Button
            variant="outline"
            onClick={checkDatabaseHealth}
            className="w-full mb-4"
            disabled={isAttemptingRepair || isCheckingHealth}
          >
            {isCheckingHealth ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking database...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Check Database Health
              </>
            )}
          </Button>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="w-full sm:w-auto"
            disabled={isAttemptingRepair}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="default"
            onClick={handleRepairAttempt}
            disabled={isAttemptingRepair}
            className="w-full sm:w-auto"
          >
            {isAttemptingRepair && repairStatus.includes("repair") ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Repairing...
              </>
            ) : (
              <>
                <Wrench className="mr-2 h-4 w-4" />
                Attempt Repair
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={handleFullReset}
            disabled={isAttemptingRepair}
            className="w-full sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Full Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
