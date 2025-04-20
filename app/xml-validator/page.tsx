'use client';

import { useState } from 'react';
import { XmlValidator } from '@/components/XmlValidator';
import { Button } from '@/components/ui/button';
import { applyXmlChangesFromFileAction } from '@/actions/apply-xml-changes-action';

export default function XmlValidatorPage() {
  const [xmlPath, setXmlPath] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [isValidated, setIsValidated] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleApplyChanges = async () => {
    if (!isValidated) {
      setApplyResult({
        success: false,
        message: 'Please validate the XML changes first.'
      });
      return;
    }

    try {
      setIsApplying(true);
      const result = await applyXmlChangesFromFileAction(xmlPath, projectPath);
      setApplyResult({
        success: result.isSuccess,
        message: result.message || (result.isSuccess 
          ? 'Changes applied successfully!' 
          : 'Failed to apply changes.')
      });
    } catch (error) {
      setApplyResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">XML Changes Validator &amp; Applicator</h1>
      
      <div className="grid gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="xmlPath" className="text-sm font-medium">
              XML File Path
            </label>
            <input
              id="xmlPath"
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              value={xmlPath}
              onChange={(e) => setXmlPath(e.target.value)}
              placeholder="/path/to/changes.xml"
            />
            <p className="text-xs text-muted-foreground">
              Full path to the XML changes file
            </p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="projectPath" className="text-sm font-medium">
              Project Directory
            </label>
            <input
              id="projectPath"
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/project"
            />
            <p className="text-xs text-muted-foreground">
              Path to the project directory where changes will be applied
            </p>
          </div>
        </div>
        
        {xmlPath && projectPath && (
          <div className="border rounded-lg p-6 bg-card">
            <XmlValidator 
              xmlPath={xmlPath} 
              projectPath={projectPath} 
              onValidated={setIsValidated} 
            />
            
            <div className="mt-6 pt-6 border-t">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">Apply Changes</h3>
                  <p className="text-sm text-muted-foreground">
                    Apply the validated XML changes to your project
                  </p>
                </div>
                <Button
                  onClick={handleApplyChanges}
                  disabled={!isValidated || isApplying}
                  variant={isValidated ? "default" : "outline"}
                >
                  {isApplying ? 'Applying...' : 'Apply Changes'}
                </Button>
              </div>
              
              {applyResult && (
                <div className={`mt-4 p-4 rounded-md ${
                  applyResult.success 
                    ? 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300' 
                    : 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                }`}>
                  {applyResult.message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 