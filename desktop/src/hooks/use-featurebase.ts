import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

declare global {
  interface Window {
    Featurebase?: (action: string, options?: any) => void;
  }
}

interface UseFeaturebaseOptions {
  mode?: 'portal';
  containerId?: string;
  organization?: string;
  theme?: 'light' | 'dark' | '';
  placement?: string;
  locale?: string;
}

interface UseFeaturebaseReturn {
  loading: boolean;
  error: Error | null;
}

window.Featurebase = window.Featurebase || function() {
  (window.Featurebase as any).q = (window.Featurebase as any).q || [];
  (window.Featurebase as any).q.push(arguments);
};

export function useFeaturebase(options: UseFeaturebaseOptions = {}): UseFeaturebaseReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [jwtToken, setJwtToken] = useState<string | null>(null);

  // First effect: Load SDK and get JWT token
  useEffect(() => {
    let mounted = true;

    const loadSDKAndToken = async () => {
      try {
        // Load SDK if not already loaded
        if (!document.getElementById('featurebase-sdk')) {
          const scriptElement = document.createElement('script');
          scriptElement.id = 'featurebase-sdk';
          scriptElement.src = 'https://do.featurebase.app/js/sdk.js';
          scriptElement.async = true;
          
          await new Promise<void>((resolve, reject) => {
            scriptElement.onload = () => resolve();
            scriptElement.onerror = () => reject(new Error('Failed to load Featurebase SDK'));
            document.head.appendChild(scriptElement);
          });
        }

        // Get JWT token
        const token = await invoke<string>('get_featurebase_sso_token');
        
        if (!mounted) return;

        setJwtToken(token);
        setSdkReady(true);
        setLoading(false);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to initialize Featurebase'));
          setLoading(false);
        }
      }
    };

    loadSDKAndToken();

    return () => {
      mounted = false;
    };
  }, []);

  // Second effect: Embed widget once SDK is ready and container exists
  useEffect(() => {
    if (!sdkReady || !jwtToken || loading || error) return;

    // For portal mode, wait for container to exist
    if (options.mode === 'portal' && options.containerId) {
      const checkAndEmbed = () => {
        const container = document.getElementById(options.containerId!);
        if (container) {
          const organization = options.organization || import.meta.env.VITE_FEATUREBASE_ORGANIZATION || 'vibemanager';
          
          const config: any = {
            organization,
            jwtToken,
            theme: options.theme || '',
            placement: options.placement || 'right',
            locale: options.locale || 'en',
            container
          };

          window.Featurebase?.('embed', config);
          return true;
        }
        return false;
      };

      // Try immediately
      if (!checkAndEmbed()) {
        // If container doesn't exist yet, try again after a small delay
        const timer = setTimeout(checkAndEmbed, 100);
        return () => clearTimeout(timer);
      }
    } else {
      // Non-portal mode, embed immediately
      const organization = options.organization || import.meta.env.VITE_FEATUREBASE_ORGANIZATION || 'vibemanager';
      
      const config: any = {
        organization,
        jwtToken,
        theme: options.theme || 'auto',
        placement: options.placement || 'right',
        locale: options.locale || 'en'
      };

      window.Featurebase?.('embed', config);
    }

    return () => {
      window.Featurebase?.('shutdown');
    };
  }, [sdkReady, jwtToken, loading, error, options.mode, options.containerId, options.organization, options.theme, options.placement, options.locale]);

  return {
    loading,
    error
  };
}