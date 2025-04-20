'use client';

import { useState } from 'react';
import { validateXmlChangesFromFileAction } from '@/actions/apply-xml-changes-action';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface XmlValidatorProps {
  xmlPath: string;
  projectPath: string;
  onValidated?: (isValid: boolean) => void;
}

export function XmlValidator({ xmlPath, projectPath, onValidated }: XmlValidatorProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<{
    isSuccess: boolean;
    message: string;
    changes: string[];
  } | null>(null);

  const handleValidate = async () => {
    try {
      setIsValidating(true);
      const result = await validateXmlChangesFromFileAction(xmlPath, projectPath);
      setResults({
        isSuccess: result.isSuccess,
        message: result.message || '',
        changes: result.data?.changes || [],
      });
      if (onValidated) {
        onValidated(result.isSuccess);
      }
    } catch (error) {
      setResults({
        isSuccess: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        changes: [],
      });
      if (onValidated) {
        onValidated(false);
      }
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">XML Changes Validator</h3>
          <Button 
            onClick={handleValidate} 
            disabled={isValidating}
            variant="outline"
            size="sm"
          >
            {isValidating ? 'Validating...' : 'Validate Changes'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Performs a dry run to validate XML changes without applying them
        </p>
      </div>

      {results && (
        <div className="space-y-4">
          <Alert variant={results.isSuccess ? "default" : "destructive"}>
            <div className="flex items-center gap-2">
              {results.isSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {results.isSuccess ? 'Validation Successful' : 'Validation Failed'}
              </AlertTitle>
            </div>
            <AlertDescription>{results.message}</AlertDescription>
          </Alert>

          {results.changes.length > 0 && (
            <div className="border rounded-md p-4 bg-muted/30">
              <h4 className="text-sm font-medium mb-2">Change Details</h4>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {results.changes.map((change, i) => (
                  <div 
                    key={i} 
                    className={`text-xs p-1.5 rounded ${
                      change.startsWith('Warning') 
                        ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300' 
                        : change.startsWith('Error') 
                          ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                          : 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                    }`}
                  >
                    {change}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 