'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, RefreshCw, Wrench, AlertCircle, Trash2 } from 'lucide-react';

export default function DatabaseErrorHandler() {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAttemptingRepair, setIsAttemptingRepair] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState<boolean | null>(null);
  const [repairStatus, setRepairStatus] = useState('');
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Listen for database connection errors
    const handleError = (event: CustomEvent) => {
      if (event.detail && event.detail.type === 'database_error') {
        setErrorMessage(event.detail.message || 'Database connection failed');
        setIsOpen(true);
        setRepairSuccess(null);
        setRepairStatus('');
        setBackupPath(null);
      }
    };

    // Add event listener
    window.addEventListener('database_error' as any, handleError as EventListener);

    // Clean up listener
    return () => {
      window.removeEventListener('database_error' as any, handleError as EventListener);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleRepairAttempt = async () => {
    setIsAttemptingRepair(true);
    setRepairStatus('Attempting database repair...');
    try {
      const response = await fetch('/api/database/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'repair' }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setRepairSuccess(true);
        setRepairStatus('Database repair was successful. The application will now refresh.');
        setBackupPath(result.backup || null);
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setRepairSuccess(false);
        setRepairStatus(`Repair failed: ${result.error || 'Unknown error'}`);
        setBackupPath(result.backup || null);
      }
    } catch (error) {
      setRepairSuccess(false);
      setRepairStatus('Failed to repair database. Please try a full reset or contact support.');
    } finally {
      setIsAttemptingRepair(false);
    }
  };
  
  const handleFullReset = async () => {
    if (!window.confirm('WARNING: This will completely reset the database and delete all stored data. A backup will be created if possible. Continue?')) {
      return;
    }
    
    setIsAttemptingRepair(true);
    setRepairStatus('Performing full database reset...');
    try {
      const response = await fetch('/api/database/repair', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setRepairSuccess(true);
        setRepairStatus('Database was successfully reset. The application will now refresh.');
        setBackupPath(result.backup || null);
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setRepairSuccess(false);
        setRepairStatus(`Reset failed: ${result.error || 'Unknown error'}`);
        setBackupPath(result.backup || null);
      }
    } catch (error) {
      setRepairSuccess(false);
      setRepairStatus('Failed to reset database. Please contact support.');
    } finally {
      setIsAttemptingRepair(false);
    }
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
          <AlertDescription className="whitespace-pre-wrap">{errorMessage}</AlertDescription>
        </Alert>
        
        {repairStatus && (
          <Alert 
            variant={repairSuccess === true ? "default" : repairSuccess === false ? "destructive" : "default"} 
            className="my-4"
          >
            <AlertTitle className="flex items-center gap-2">
              {repairSuccess === true && <AlertCircle className="h-4 w-4" />}
              {repairSuccess === false && <AlertTriangle className="h-4 w-4" />}
              {repairSuccess === null && <Loader2 className="h-4 w-4 animate-spin" />}
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
            {isAttemptingRepair ? (
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