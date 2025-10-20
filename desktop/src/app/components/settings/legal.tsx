import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { Shield, FileText, ExternalLink, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';
import { Alert, AlertDescription } from '@/ui/alert';
import { Badge } from '@/ui/badge';
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
      await open(`https://plantocode.com${url}`);
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
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 rounded-xl bg-primary/10">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Legal Documents</h2>
          <p className="text-sm text-muted-foreground">
            Review and accept our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription>
          <p className="font-medium mb-1 text-foreground">Legal Compliance Required</p>
          <p className="text-muted-foreground">
            You must accept our Terms of Service and Privacy Policy to continue using PlanToCode.
            These documents outline your rights and our commitments to protecting your data.
          </p>
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {documents.map((doc) => {
          const isAccepted = doc.acceptedVersion && doc.acceptedVersion === doc.currentVersion;
          
          return (
            <Card
              key={`${doc.docType}-${doc.region}`}
              className="rounded-xl border border-border/60 bg-card hover:shadow-soft-md transition-all duration-300"
            >
              <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className={`p-2 rounded-xl ${
                    isAccepted 
                      ? 'bg-success/10' 
                      : 'bg-warning/10'
                  }`}>
                    <FileText className={`w-5 h-5 ${
                      isAccepted 
                        ? 'text-success' 
                        : 'text-warning'
                    }`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg text-foreground">
                        {doc.docType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                      </h3>
                      <Badge variant="secondary" className="text-xs">
                        {doc.region.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Current version:</span>
                        <span className="text-sm text-foreground font-medium">{doc.currentVersion}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Your version:</span>
                        <span className="text-sm text-foreground">{doc.acceptedVersion || 'Not accepted'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-muted-foreground">Last updated:</span>
                        <span className="text-sm text-foreground">{new Date(doc.effectiveAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDocument(doc.url)}
                      >
                        <ExternalLink className="w-3 h-3 mr-1.5" />
                        View Document
                      </Button>
                      
                      {!isAccepted && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleAccept(doc.docType)}
                          disabled={isAccepting === doc.docType}
                          isLoading={isAccepting === doc.docType}
                          loadingText="Accepting..."
                        >
                          <Check className="w-3 h-3 mr-1.5" />
                          Accept Latest
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                
                {isAccepted && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Accepted
                  </Badge>
                )}
              </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {status && status.allConsented && (
        <Alert className="bg-success/10 border-success/20">
          <Check className="h-4 w-4 text-success" />
          <AlertDescription>
            <p className="font-medium text-foreground">All Legal Documents Accepted</p>
            <p className="text-muted-foreground">You have accepted all required legal documents for your region.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default LegalSettings;