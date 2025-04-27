"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { 
  Loader2, RefreshCw, Hammer, CheckCircle, 
  ChevronUp, ChevronDown, Search, AlertCircle, Eye, Trash2
} from "lucide-react";
import path from 'path';
import { useProject } from "@/lib/contexts/project-context";
import { IdeIntegration } from "../gemini-processor/ide-integration";
import { normalizePath } from "@/lib/path-utils";
import { applyXmlChangesFromFileAction } from "@/actions/apply-xml-changes-action";
import { previewXmlChangesFromFileAction } from "@/actions/preview-xml-changes-action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { safeFetch } from '@/lib/utils';
import { RequireProjectDirectory } from "@/components/with-project-directory";

// Define types for XML files
interface XmlFile {
  id: string;
  patchPath: string;
  displayName?: string;
  lastModified?: number;
  format?: string;
}

interface XmlChangesResult {
  requestId: string;
  isSuccess: boolean;
  message: string;
  changes: string[];
}

interface XmlPreviewResult {
  requestId: string;
  isSuccess: boolean;
  message: string;
  report: string;
}

function XmlChangesPanelContent() {
  const { projectDirectory } = useProject();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [xmlFiles, setXmlFiles] = useState<XmlFile[]>([]);
  const [xmlSearchTerm, setXmlSearchTerm] = useState("");
  const [xmlSortOrder, setXmlSortOrder] = useState<"newest" | "oldest" | "name">("newest");
  
  // State for XML application
  const [applyingXmlId, setApplyingXmlId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<XmlChangesResult | null>(null);
  const [showChangesMap, setShowChangesMap] = useState<Record<string, boolean>>({});
  const [loadingFormatId, setLoadingFormatId] = useState<string | null>(null);
  
  // State for XML preview
  const [previewingXmlId, setPreviewingXmlId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<XmlPreviewResult | null>(null);
  const [showPreviewMap, setShowPreviewMap] = useState<Record<string, boolean>>({});

  // State for deleting XML file
  const [deletingXmlId, setDeletingXmlId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{id: string, path: string} | null>(null);

  // Function to load XML files from patches directory
  const loadXmlFiles = useCallback(async () => {
    if (!projectDirectory) {
      setErrorMessage("No project directory selected");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    
    try {
      const response = await safeFetch('/api/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          directory: projectDirectory,
          extensions: ['.xml', '.config', '.xaml', '.xsl', '.xslt', '.svg', '.resx', '.csproj', '.props', '.html']
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load files: ${response.status}`);
      }
      
      const data = await response.json();
      setXmlFiles(data.files);
    } catch (err) {
      setErrorMessage(`Failed to load XML files: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Error loading XML files:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory]);

  // Function to handle applying XML changes with improved error handling
  const handleApplyXmlChanges = useCallback(async (fileId: string, xmlPath: string) => {
    if (!xmlPath || !projectDirectory) {
      setErrorMessage("Missing XML changes file or project directory");
      return;
    }
    
    setApplyingXmlId(fileId);
    setApplyResult(null);
    setShowChangesMap(prev => ({ ...prev, [fileId]: false }));
    
    const maxRetries = 3;
    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`Applying XML changes, attempt ${attempt}/${maxRetries}`);
        
        const result = await applyXmlChangesFromFileAction(xmlPath, projectDirectory);
        
        setApplyResult({
          requestId: fileId,
          isSuccess: result.isSuccess,
          message: result.message || (result.isSuccess ? "Changes applied successfully!" : "Failed to apply changes."),
          changes: result.data?.changes || []
        });
        
        if (result.isSuccess && result.data?.changes) {
          setShowChangesMap(prev => ({ ...prev, [fileId]: true }));
        }
        
        // If successful, break out of retry loop
        break;
      } catch (error: any) {
        console.error(`Error applying XML changes (attempt ${attempt}/${maxRetries}):`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If we haven't reached max retries yet, wait a bit before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // If we've exhausted all retries and still have an error, report it
    if (attempt >= maxRetries && lastError) {
      setApplyResult({
        requestId: fileId,
        isSuccess: false,
        message: `Error applying changes after ${maxRetries} attempts: ${lastError.message}`,
        changes: []
      });
    }
    
    setApplyingXmlId(null);
  }, [projectDirectory]);

  // Function to toggle showing changes for a specific file
  const toggleShowChanges = useCallback((fileId: string) => {
    setShowChangesMap(prev => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  }, []);

  // Function to detect XML format
  const detectXmlFormat = useCallback(async (fileId: string, xmlPath: string) => {
    if (!xmlPath) {
      return;
    }

    setLoadingFormatId(fileId);
    
    try {
      const readResponse = await safeFetch('/api/read-xml-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: xmlPath })
      });
      
      if (!readResponse.ok) {
        throw new Error(`Failed to read XML file: ${readResponse.status}`);
      }
      
      const { content } = await readResponse.json();
      
      const detectResponse = await safeFetch('/api/detect-xml-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filePath: xmlPath,
          content: content
        })
      });
      
      if (!detectResponse.ok) {
        throw new Error(`Failed to detect XML format: ${detectResponse.status}`);
      }
      
      const { format } = await detectResponse.json();
      
      setXmlFiles(prevFiles => 
        prevFiles.map(file => 
          file.id === fileId ? { ...file, format } : file
        )
      );
    } catch (error) {
      console.error("Error detecting XML format:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to detect XML format");
    } finally {
      setLoadingFormatId(null);
    }
  }, []);

  // Function to handle previewing XML changes with improved error handling
  const handlePreviewXmlChanges = useCallback(async (fileId: string, xmlPath: string) => {
    if (!xmlPath || !projectDirectory) {
      setErrorMessage("Missing XML changes file or project directory");
      return;
    }
    
    setPreviewingXmlId(fileId);
    setPreviewResult(null);
    setShowPreviewMap(prev => ({ ...prev, [fileId]: false }));
    
    const maxRetries = 3;
    let attempt = 0;
    let lastError: Error | null = null;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`Previewing XML changes, attempt ${attempt}/${maxRetries}`);
        
        const result = await previewXmlChangesFromFileAction(xmlPath, projectDirectory);
        
        setPreviewResult({
          requestId: fileId,
          isSuccess: result.isSuccess,
          message: result.message || (result.isSuccess ? "Preview generated successfully!" : "Failed to preview changes."),
          report: result.data?.report || ""
        });
        
        if (result.isSuccess && result.data?.report) {
          setShowPreviewMap(prev => ({ ...prev, [fileId]: true }));
        }
        
        // If successful, break out of retry loop
        break;
      } catch (error: any) {
        console.error(`Error previewing XML changes (attempt ${attempt}/${maxRetries}):`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If we haven't reached max retries yet, wait a bit before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // If we've exhausted all retries and still have an error, report it
    if (attempt >= maxRetries && lastError) {
      setPreviewResult({
        requestId: fileId,
        isSuccess: false,
        message: `Error previewing changes after ${maxRetries} attempts: ${lastError.message}`,
        report: ""
      });
    }
    
    setPreviewingXmlId(null);
  }, [projectDirectory]);

  // Function to toggle showing preview for a specific file
  const toggleShowPreview = useCallback((fileId: string) => {
    setShowPreviewMap(prev => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  }, []);

  // Function to open delete confirmation dialog
  const confirmDeleteXmlFile = useCallback((fileId: string, xmlPath: string) => {
    setFileToDelete({ id: fileId, path: xmlPath });
    setDeleteConfirmOpen(true);
  }, []);

  // Function to handle deleting XML file after confirmation
  const handleDeleteXmlFile = useCallback(async () => {
    if (!fileToDelete) {
      return;
    }
    
    const { id, path } = fileToDelete;
    setDeletingXmlId(id);
    setDeleteConfirmOpen(false);
    
    try {
      const response = await safeFetch('/api/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status}`);
      }
      
      setXmlFiles(prevFiles => prevFiles.filter(file => file.id !== id));
      
    } catch (error) {
      console.error("Error deleting XML file:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete XML file");
    } finally {
      setDeletingXmlId(null);
      setFileToDelete(null);
    }
  }, [fileToDelete]);

  // Load XML files when component mounts or project directory changes
  useEffect(() => {
    if (projectDirectory) {
      loadXmlFiles();
    }
  }, [projectDirectory, loadXmlFiles]);

  // Get filtered and sorted XML files
  const filteredAndSortedFiles = xmlFiles
    .filter(file => {
      // Apply search filter
      if (!xmlSearchTerm) return true;
      return file.patchPath.toLowerCase().includes(xmlSearchTerm.toLowerCase()) ||
             (file.displayName?.toLowerCase().includes(xmlSearchTerm.toLowerCase()));
    })
    .sort((a, b) => {
      // Apply sort order
      if (xmlSortOrder === "newest") {
        return (b.lastModified || 0) - (a.lastModified || 0);
      } else if (xmlSortOrder === "oldest") {
        return (a.lastModified || 0) - (b.lastModified || 0);
      } else { // "name"
        return (a.displayName || a.patchPath).localeCompare(b.displayName || b.patchPath);
      }
    });

  return (
    <div className="w-full">
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">XML Change Files</h2>
          <div className="flex items-center gap-2">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search files..."
                className="pl-8 h-9 w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={xmlSearchTerm}
                onChange={(e) => setXmlSearchTerm(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadXmlFiles} 
              disabled={isLoading}
              className="h-9"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>
        
        {errorMessage && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {errorMessage}
          </div>
        )}
        
        {!projectDirectory ? (
          <div className="text-center p-6 border border-dashed rounded-md border-border">
            <p className="text-muted-foreground">Select a project directory to view XML change files.</p>
          </div>
        ) : xmlFiles.length === 0 && !isLoading ? (
          <div className="text-center p-6 border border-dashed rounded-md border-border">
            <p className="text-muted-foreground">No XML files found in the patches directory.</p>
            <p className="text-xs text-muted-foreground mt-2">When you generate changes, they will appear here.</p>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-muted-foreground">
                {filteredAndSortedFiles.length} {filteredAndSortedFiles.length === 1 ? 'file' : 'files'} found
              </div>
              <select
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={xmlSortOrder}
                onChange={(e) => setXmlSortOrder(e.target.value as "newest" | "oldest" | "name")}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
            
            <div className="space-y-3">
              {filteredAndSortedFiles.map((file) => (
                <div key={file.id} className="border rounded-md p-3 bg-card">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm bg-muted px-2 py-1 rounded-md truncate max-w-[300px]">
                        {file.displayName}
                      </div>
                      {file.format && (
                        <Badge variant="outline" className="h-6">
                          {file.format}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!file.format && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          disabled={loadingFormatId === file.id}
                          onClick={() => detectXmlFormat(file.id, file.patchPath)}
                          className="h-8"
                        >
                          {loadingFormatId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Detect Format"}
                        </Button>
                      )}
                      <Button 
                        variant="outline"
                        size="sm"
                        disabled={previewingXmlId === file.id}
                        onClick={() => handlePreviewXmlChanges(file.id, file.patchPath)}
                        className="h-8"
                      >
                        {previewingXmlId === file.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        ) : (
                          <Eye className="h-3 w-3 mr-2" />
                        )}
                        Preview
                      </Button>
                      <Button 
                        variant="default"
                        size="sm"
                        disabled={applyingXmlId === file.id}
                        onClick={() => handleApplyXmlChanges(file.id, file.patchPath)}
                        className="h-8"
                      >
                        {applyingXmlId === file.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                        ) : (
                          <Hammer className="h-3 w-3 mr-2" />
                        )}
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFileToDelete({ id: file.id, path: file.patchPath });
                          setDeleteConfirmOpen(true);
                        }}
                        className="h-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Show Apply results if available for this file */}
                  {applyResult && applyResult.requestId === file.id && (
                    <div className={`mt-2 text-xs p-2 rounded-md ${
                      applyResult.isSuccess ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}>
                      <p className={`font-medium ${applyResult.isSuccess ? 'text-green-700' : 'text-red-700'}`}>
                        {applyResult.message}
                      </p>
                      
                      {applyResult.changes.length > 0 && (
                        <div className="mt-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => toggleShowChanges(file.id)}
                            className="text-xs p-0 h-auto mb-1 font-medium"
                          >
                            {showChangesMap[file.id] ? "Hide Details" : "Show Details"}
                            {showChangesMap[file.id] ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                          </Button>
                          
                          {showChangesMap[file.id] && (
                            <ul className="space-y-1 max-h-32 overflow-y-auto bg-white/50 p-1 rounded text-xs">
                              {applyResult.changes.map((change, idx) => (
                                <li key={`change-${file.id}-${idx}`} className={
                                  change.startsWith("Error") || change.startsWith("Warning") 
                                    ? "text-amber-600" 
                                    : "text-foreground"
                                }>
                                  {change}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Preview result */}
                  {previewResult && previewResult.requestId === file.id && (
                    <div className={`mt-2 px-2 py-1.5 text-xs rounded ${
                      previewResult.isSuccess 
                        ? 'bg-green-100 dark:bg-green-950/20 text-green-800 dark:text-green-300' 
                        : 'bg-red-100 dark:bg-red-950/20 text-red-800 dark:text-red-300'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span>{previewResult.message}</span>
                        {previewResult.report && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 p-1"
                            onClick={() => toggleShowPreview(file.id)}
                          >
                            {showPreviewMap[file.id] ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                      
                      {showPreviewMap[file.id] && previewResult.report && (
                        <div className="mt-2 p-2 rounded bg-background/50 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-tight">
                          {previewResult.report}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The file will be permanently deleted from the system.
            </AlertDialogDescription>
            {fileToDelete && (
              <div className="mt-2 p-2 bg-muted rounded-md font-mono text-xs break-all">
                {fileToDelete.path}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteXmlFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Wrapper component that requires a project directory
export function XmlChangesPanel() {
  return (
    <RequireProjectDirectory>
      <XmlChangesPanelContent />
    </RequireProjectDirectory>
  );
}