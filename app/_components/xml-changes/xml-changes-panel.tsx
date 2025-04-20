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

export function XmlChangesPanel() {
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
      // Determine the patches directory at the repository root
      const patchesDir = path.join(projectDirectory, 'patches');
      
      // Call API to list XML files from patches directory
      const response = await fetch('/api/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          directory: patchesDir,
          pattern: '**/*.xml',
          includeStats: true  // Request file stats to get lastModified date
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load XML files (${response.status})`);
      }
      
      const { files, stats } = await response.json();
      
      // Transform file paths into XmlFile objects
      const xmlFileObjects = (files || []).map((filePath: string, index: number) => {
        const fileName = path.basename(filePath);
        const fileStats = stats?.[index] || {};
        
        return {
          id: `file-${Math.random().toString(36).substring(2, 11)}`,
          patchPath: filePath,
          displayName: fileName,
          lastModified: fileStats.mtimeMs || Date.now() // Use actual file modification time if available
        };
      });
      
      setXmlFiles(xmlFileObjects);
      
      if (xmlFileObjects.length === 0) {
        console.log("No XML files found in patches directory");
      }
    } catch (error) {
      console.error("Error loading XML files:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load XML files");
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory]);

  // Function to handle applying XML changes
  const handleApplyXmlChanges = useCallback(async (fileId: string, xmlPath: string) => {
    if (!xmlPath || !projectDirectory) {
      setErrorMessage("Missing XML changes file or project directory");
      return;
    }
    
    setApplyingXmlId(fileId);
    setApplyResult(null);
    setShowChangesMap(prev => ({ ...prev, [fileId]: false }));
    
    try {
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
    } catch (error: any) {
      setApplyResult({
        requestId: fileId,
        isSuccess: false,
        message: `Error applying changes: ${error.message}`,
        changes: []
      });
    } finally {
      setApplyingXmlId(null);
    }
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
      // First, read the XML file content
      const readResponse = await fetch('/api/read-xml-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: xmlPath })
      });
      
      if (!readResponse.ok) {
        const errorData = await readResponse.json();
        throw new Error(errorData.error || `Failed to read XML file (${readResponse.status})`);
      }
      
      const { content } = await readResponse.json();
      
      // Then, detect the format
      const detectResponse = await fetch('/api/detect-xml-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      
      if (!detectResponse.ok) {
        const errorData = await detectResponse.json();
        throw new Error(errorData.error || `Failed to detect XML format (${detectResponse.status})`);
      }
      
      const { format } = await detectResponse.json();
      
      // Update the xmlFiles state with the detected format
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

  // Function to handle previewing XML changes
  const handlePreviewXmlChanges = useCallback(async (fileId: string, xmlPath: string) => {
    if (!xmlPath || !projectDirectory) {
      setErrorMessage("Missing XML changes file or project directory");
      return;
    }
    
    setPreviewingXmlId(fileId);
    setPreviewResult(null);
    setShowPreviewMap(prev => ({ ...prev, [fileId]: false }));
    
    try {
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
    } catch (error: any) {
      setPreviewResult({
        requestId: fileId,
        isSuccess: false,
        message: `Error previewing changes: ${error.message}`,
        report: ""
      });
    } finally {
      setPreviewingXmlId(null);
    }
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
      const response = await fetch('/api/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to delete file (${response.status})`);
      }
      
      // Remove the file from state if deletion was successful
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
    <>
      <div className="w-full border rounded-md overflow-hidden shadow-sm mt-4">
        <div className="bg-muted px-3 py-2 font-medium text-sm border-b flex justify-between items-center">
          <span className="flex items-center">
            <span className="font-semibold">Project XML Changes</span>
            <span className="ml-2 text-sm text-muted-foreground">
              ({xmlFiles.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadXmlFiles}
              disabled={isLoading}
              title="Refresh XML Files"
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}/>
            </Button>
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : xmlFiles.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No XML files found in patches directory. {errorMessage ? `Error: ${errorMessage}` : ''}
            </div>
          ) : (
            <>
              {/* Filter and sort controls */}
              <div className="p-2 border-b bg-background/50">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Search XML files..."
                        value={xmlSearchTerm}
                        onChange={(e) => setXmlSearchTerm(e.target.value)}
                        className="w-full px-3 py-1 pr-8 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Sort:</span>
                    <select 
                      value={xmlSortOrder}
                      onChange={(e) => setXmlSortOrder(e.target.value as any)}
                      className="text-xs border rounded px-1 py-0.5 bg-background"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="name">By filename</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* XML Files List */}
              <div className="divide-y">
                {filteredAndSortedFiles.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    No XML files match your search criteria.
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {filteredAndSortedFiles.map((file) => (
                      <div key={file.id} className="bg-white p-2 rounded border text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-1 mb-1">
                              <CheckCircle className="h-3 w-3 text-green-600" />
                              <span className="font-medium">
                                {file.displayName || path.basename(file.patchPath)}
                              </span>
                              {file.format && (
                                <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-sm">
                                  {file.format}
                                </span>
                              )}
                            </div>
                            <div className="font-mono bg-muted p-1 rounded truncate">
                              {normalizePath(file.patchPath)}
                            </div>
                          </div>
                          <div className="flex gap-2 items-center">
                            <IdeIntegration
                              filePath={file.patchPath}
                              tooltip="Open XML file"
                              onError={(msg) => setErrorMessage(msg)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreviewXmlChanges(file.id, file.patchPath)}
                              disabled={previewingXmlId === file.id}
                              className="flex items-center gap-1 text-xs"
                              title="Preview XML changes"
                            >
                              {previewingXmlId === file.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 mr-1" />
                              )}
                              <span className="text-xs">Preview</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyXmlChanges(file.id, file.patchPath)}
                              disabled={applyingXmlId === file.id}
                              className="flex items-center gap-1 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                              title="Apply these XML changes to your project files"
                            >
                              {applyingXmlId === file.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Hammer className="h-3 w-3 mr-1" />
                              )}
                              <span>Apply XML</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => confirmDeleteXmlFile(file.id, file.patchPath)}
                              disabled={deletingXmlId === file.id}
                              className="flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10"
                              title="Delete this XML file"
                            >
                              {deletingXmlId === file.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Trash2 className="h-3 w-3 mr-1" />
                              )}
                              <span>Delete</span>
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
                                      <li key={idx} className={
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
                )}
              </div>
            </>
          )}
        </div>
        
        {/* Show general component-level errors */}
        {errorMessage && !isLoading && xmlFiles.length > 0 && (
          <div className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-red-600 flex items-center justify-center gap-1 break-words max-w-full">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mr-1"/> {errorMessage}
          </div>
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
    </>
  );
} 