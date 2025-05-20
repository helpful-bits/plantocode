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
import { useState, useEffect } from "react";

import {
  type DatabaseErrorCategory,
  type DatabaseErrorSeverity,
} from "@/types/error-types";

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

  useEffect(() => {
    // Listen for database connection errors
    const handleError = (event: CustomEvent<{type?: string; message?: string}>) => {
      if (event.detail && event.detail.type === "database_error") {
        setErrorMessage(event.detail.message || "Database connection failed");
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

        setTimeout(() => {
          window.location.reload();
        }, 2000);
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

        setTimeout(() => {
          window.location.reload();
        }, 2000);
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

  // Generate specific guidance based on health data
  const getRepairGuidance = () => {
    if (!healthData) return null;

    if (!healthData.fileExists) {
      return (
        <Alert className="my-4 bg-warning-background border-warning-border">
          <AlertTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-warning" />
            Database File Missing
          </AlertTitle>
          <AlertDescription>
            <p>
              The database file is missing. A full reset will create a new
              database file.
            </p>
            <p className="mt-2 text-sm">
              Recommended action: <strong>Full Reset</strong>
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
        <Alert className="my-4 bg-warning-background border-warning-border">
          <AlertTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-warning" />
            Permission Issues
          </AlertTitle>
          <AlertDescription>
            <p>
              The database file has incorrect permissions. The repair function
              will attempt to fix this.
            </p>
            <p className="mt-2 text-sm">
              Recommended action: <strong>Attempt Repair</strong>
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    if (healthData.integrityStatus === "invalid") {
      return (
        <Alert className="my-4 bg-warning-background border-warning-border">
          <AlertTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-warning" />
            Database Integrity Issues
          </AlertTitle>
          <AlertDescription>
            <p>
              The database has integrity issues which may cause unexpected
              behavior. The repair function will attempt to fix them.
            </p>
            <p className="mt-2 text-sm">
              If repair doesn&apos;t work, you may need to use{" "}
              <strong>Full Reset</strong>.
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="my-4 bg-warning-background border-warning-border">
        <AlertTitle className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          Database Error
        </AlertTitle>
        <AlertDescription>
          <p>
            The database encountered an error. Try the repair function first. If
            that fails, a full reset may be necessary.
          </p>
          <p className="mt-2 text-sm">
            Full reset will delete all stored sessions and data.
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
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Database Connection Error
          </DialogTitle>
          <DialogDescription>
            The application has encountered an issue connecting to its database.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="my-4">
          <AlertTitle>Error details</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {errorMessage}
          </AlertDescription>
        </Alert>

        {healthData && getRepairGuidance()}

        {healthData && (
          <div className="my-4 text-sm border rounded-md p-3 bg-gray-50">
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
