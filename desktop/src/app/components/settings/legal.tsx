import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { Shield, FileText, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/ui/button';
import { useNotification } from '@/contexts/notification-context';
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from '@/utils/error-handling';
import { ConsentStatusResponse, ConsentStatusItem } from '@/types/tauri-commands';

export function LegalSettings() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConsentStatusResponse | null>(null);
  const [documents, setDocuments] = useState<ConsentStatusItem[]>([]);
  const [isAccepting, setIsAccepting] = useState<'terms' | 'privacy' | null>(null);
  const [userRegion, setUserRegion] = useState<'eu' | 'us'>('us');
  const { showNotification } = useNotification();

  useEffect(() => {
    fetchConsentStatus();
  }, []);

  const fetchConsentStatus = async () => {
    try {
      setLoading(true);
      
      // Get user region from settings using invoke directly
      const regionSetting = await invoke<string | null>('get_key_value_command', { key: 'user_legal_region' });
      const region = (regionSetting as 'eu' | 'us') || 'us';
      setUserRegion(region);
      
      const consentStatus = await invoke<ConsentStatusResponse>('get_consent_status_command', {
        region: region
      });

      setStatus(consentStatus);
      setDocuments(consentStatus.items || []);
    } catch (error) {
      const errorInfo = extractErrorInfo(error);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "legal document status");
      
      await logError(error, "Legal.fetchConsentStatus");
      showNotification({
        title: "Legal Status Error",
        message: userMessage,
        type: "error"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (docType: 'terms' | 'privacy') => {
    setIsAccepting(docType);
    
    try {
      await invoke('accept_consent_command', {
        region: userRegion,
        docType,
        metadata: {
          source: 'settings_page',
          timestamp: new Date().toISOString()
        }
      });
      
      showNotification({
        title: "Legal Document Accepted",
        message: `You have successfully accepted the ${docType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}`,
        type: "success"
      });
      
      // Refresh status
      const updatedStatus = await invoke<ConsentStatusResponse>('get_consent_status_command', {
        region: userRegion
      });
      
      setDocuments(updatedStatus.items || []);
      setStatus(updatedStatus);
    } catch (error) {
      const errorInfo = extractErrorInfo(error);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "accepting legal document");
      
      await logError(error, "Legal.handleAccept");
      showNotification({
        title: "Acceptance Error",
        message: userMessage,
        type: "error"
      });
    } finally {
      setIsAccepting(null);
    }
  };

  const handleViewDocument = async (url: string) => {
    try {
      // Open the document URL in the default browser
      await open(`https://vibemanager.app${url}`);
    } catch (error) {
      await logError(error, "Legal.handleViewDocument");
      showNotification({
        title: "Error",
        message: "Failed to open document in browser",
        type: "error"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Shield className="w-6 h-6 text-blue-500" />
        <div>
          <h2 className="text-xl font-semibold">Legal Documents</h2>
          <p className="text-sm text-gray-500">
            Review and accept our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">Legal Compliance Required</p>
            <p>
              You must accept our Terms of Service and Privacy Policy to continue using Vibe Manager.
              These documents outline your rights and our commitments to protecting your data.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {documents.map((doc) => {
          const isAccepted = doc.acceptedVersion && doc.acceptedVersion === doc.currentVersion;
          
          return (
            <div
              key={`${doc.docType}-${doc.region}`}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className={`p-2 rounded-lg ${
                    isAccepted 
                      ? 'bg-green-100 dark:bg-green-900/20' 
                      : 'bg-yellow-100 dark:bg-yellow-900/20'
                  }`}>
                    <FileText className={`w-5 h-5 ${
                      isAccepted 
                        ? 'text-green-600 dark:text-green-400' 
                        : 'text-yellow-600 dark:text-yellow-400'
                    }`} />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-medium text-lg">
                      {doc.docType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                    </h3>
                    <p 
                      className="text-xs text-gray-400"
                      title={doc.docType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                    >
                      {doc.region.toUpperCase()} Region
                    </p>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Current version:</span>
                        <span className="text-sm">{doc.currentVersion}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Your version:</span>
                        <span className="text-sm">{doc.acceptedVersion || 'Not accepted'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Last updated:</span>
                        <span className="text-sm">{new Date(doc.effectiveAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center space-x-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.url)}
                        className="flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View Document</span>
                      </Button>
                      
                      {!isAccepted && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleAccept(doc.docType)}
                          disabled={isAccepting === doc.docType}
                          className="flex items-center space-x-1"
                        >
                          {isAccepting === doc.docType ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                              <span>Accepting...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Accept Latest</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                {isAccepted && (
                  <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                    <Check className="w-4 h-4" />
                    <span className="text-sm font-medium">Accepted</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status && status.allConsented && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <div className="text-sm text-green-800 dark:text-green-200">
              <p className="font-medium">All Legal Documents Accepted</p>
              <p>You have accepted all required legal documents for your region.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LegalSettings;