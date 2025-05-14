/**
 * Desktop Bridge Provider
 * 
 * This provider acts as a bridge between the core application and desktop-specific functionality.
 * It injects desktop implementations of repositories, services, and other dependencies
 * into the core application context.
 * 
 * It also monkey-patches certain core functionality to work in the desktop environment.
 */

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useAuth } from '@/auth/auth-context';
import { SessionRepositoryAdapter } from '@/adapters/session-repository-adapter';
import { jobQueueAdapter } from '@/adapters/job-queue-adapter';
import { GeminiClientAdapter, ClaudeClientAdapter, GroqClientAdapter } from '@/adapters/api-client-adapter';
import * as fsAdapter from '@/adapters/fs-adapter';
import { message } from '@tauri-apps/plugin-dialog';

// Define the shape of the context
interface DesktopBridgeContextType {
  sessionRepository: SessionRepositoryAdapter;
  jobQueue: typeof jobQueueAdapter;
  geminiClient: GeminiClientAdapter;
  claudeClient: ClaudeClientAdapter;
  groqClient: GroqClientAdapter;
  fsAdapter: typeof fsAdapter;
  isDesktop: boolean;
}

// Create the context
const DesktopBridgeContext = createContext<DesktopBridgeContextType | undefined>(undefined);

// Provider component
export function DesktopBridgeProvider({ children }: { children: ReactNode }) {
  // Get auth context if available (might be null in some testing scenarios)
  const auth = useContext(useAuth as any);
  
  // Create repository and service instances
  const sessionRepository = new SessionRepositoryAdapter();
  const geminiClient = new GeminiClientAdapter();
  const claudeClient = new ClaudeClientAdapter();
  const groqClient = new GroqClientAdapter();
  
  // Handle deep link URL
  const handleDeepLink = async (url: string) => {
    console.log('[Desktop] Deep link received:', url);
    
    try {
      // Parse the URL to get the path and query params
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const params = new URLSearchParams(urlObj.search);
      
      // Check for different types of deep links
      
      // OAuth redirect (contains code and state params)
      if (params.has('code') && params.has('state')) {
        console.log('[Desktop] Processing OAuth redirect URL');
        
        if (auth && typeof auth.handleRedirectResult === 'function') {
          auth.handleRedirectResult(url).catch((err: any) => {
            console.error('[Desktop] Failed to handle OAuth redirect:', err);
          });
        } else {
          console.warn('[Desktop] Auth context not available for handling OAuth redirect');
        }
        return;
      }
      
      // Stripe checkout session success
      if (pathParts[0] === 'auth-success' && params.has('session_id')) {
        console.log('[Desktop] Processing Stripe checkout success');
        const sessionId = params.get('session_id');
        
        // Show success message
        // We don't need to do anything else - the subscription was already processed by the webhook
        await message('Your subscription has been successfully activated!', {
          title: 'Subscription Activated',
          kind: 'info'
        });
        return;
      }
      
      // Stripe checkout canceled
      if (pathParts[0] === 'auth-cancelled') {
        console.log('[Desktop] Processing Stripe checkout cancellation');
        
        // Show cancellation message
        await message('Your subscription process was cancelled.', {
          title: 'Subscription Cancelled',
          kind: 'info'
        });
        return;
      }
      
      // Billing portal return
      if (pathParts[0] === 'billing-return') {
        console.log('[Desktop] Processing billing portal return');
        
        // Show confirmation message
        await message('Your subscription changes have been processed.', {
          title: 'Subscription Updated',
          kind: 'info'
        });
        return;
      }
      
      // Unknown deep link
      console.log('[Desktop] Unknown deep link format:', url);
    } catch (error) {
      console.error('[Desktop] Failed to process deep link:', error);
    }
  };
  
  // Initialize the job queue and setup deep link handler
  useEffect(() => {
    // Initialize the job queue
    jobQueueAdapter.initialize().catch(console.error);
    
    // Setup deep link handler with the v2 plugin
    const setupDeepLinkHandler = async () => {
      try {
        // Listen for deep-link events from Tauri
        const { listen } = await import('@tauri-apps/api/event');
        
        // These are fired by the Tauri backend in main.rs
        const unlistenDeepLink = await listen('deep-link', (event: any) => {
          const url = event.payload as string;
          handleDeepLink(url);
        });
        
        // Clean up listener on unmount
        return () => {
          unlistenDeepLink();
        };
      } catch (error) {
        console.error('[Desktop] Failed to set up deep link handler:', error);
      }
    };
    
    setupDeepLinkHandler();
    
    // Monkey-patch the core API clients to use our adapters
    patchApiClients();
  }, [auth]); // Re-run effect if auth context changes
  
  // Function to patch the core API clients to use our adapters
  const patchApiClients = async () => {
    try {
      // Patch the client factory
      const { default: clientFactory } = await import('@core/lib/api/client-factory');
      
      // Store the original getApiClient method
      const originalGetApiClient = clientFactory.getApiClient;
      
      // Override the getApiClient method
      clientFactory.getApiClient = function(type: string) {
        // If we're in the desktop app, return our adapters
        if (typeof window !== 'undefined' && (window as any).isDesktopApp) {
          switch (type) {
            case 'gemini':
              return geminiClient;
            case 'claude':
              return claudeClient;
            case 'groq':
              return groqClient;
            default:
              return originalGetApiClient.call(this, type);
          }
        }
        
        // Otherwise, use the original method
        return originalGetApiClient.call(this, type);
      };
      
      console.log('[Desktop] API client factory patched successfully');
      
      // Patch the Node.js path/fs modules with browser-compatible versions
      patchNodeModules();
    } catch (error) {
      console.error('[Desktop] Failed to patch API client factory:', error);
    }
  };
  
  // Function to patch Node.js modules with browser-compatible versions
  const patchNodeModules = async () => {
    try {
      // Patch path-utils.ts module to use our browser-compatible version
      const pathUtilsModule = await import('@core/lib/path-utils');
      const fsManagerModule = await import('@core/lib/file/fs-manager');
      
      // Monkey patch the path utility functions
      pathUtilsModule.normalizePath = fsAdapter.normalizePath;
      pathUtilsModule.getAppOutputFilesDirectory = fsAdapter.getAppDirectory;
      pathUtilsModule.resolveOutputFilePath = fsAdapter.createUniqueFilePath;
      pathUtilsModule.join = fsAdapter.joinPaths;
      pathUtilsModule.basename = fsAdapter.getBasename;
      pathUtilsModule.dirname = fsAdapter.getDirname;
      pathUtilsModule.extname = fsAdapter.getExtname;
      
      // Replace the fs-manager with our version
      Object.defineProperty(fsManagerModule, 'default', {
        value: fsAdapter.getFsManager(),
        writable: false
      });
      
      console.log('[Desktop] Node.js modules patched successfully with browser-compatible versions');
    } catch (error) {
      console.error('[Desktop] Failed to patch Node.js modules:', error);
    }
  };
  
  // Expose the repositories and services to the application
  const value = {
    sessionRepository,
    jobQueue: jobQueueAdapter,
    geminiClient,
    claudeClient,
    groqClient,
    fsAdapter,
    isDesktop: true
  };
  
  // Inject a global marker that this is the desktop app
  if (typeof window !== 'undefined') {
    (window as any).isDesktopApp = true;
  }
  
  return (
    <DesktopBridgeContext.Provider value={value}>
      {children}
    </DesktopBridgeContext.Provider>
  );
}

// Hook to use the context
export function useDesktopBridge() {
  const context = useContext(DesktopBridgeContext);
  if (context === undefined) {
    throw new Error('useDesktopBridge must be used within a DesktopBridgeProvider');
  }
  return context;
}