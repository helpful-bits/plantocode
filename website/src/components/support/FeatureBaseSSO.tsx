'use client';

import { useState } from 'react';
import { useWebAuth } from '../auth/WebAuthProvider';
import { FEATUREBASE_BASE_URL } from '@/lib/brand';

interface FeatureBaseSSOProps {
  className?: string;
  children: React.ReactNode;
  returnTo?: string;
}

export function FeatureBaseSSOButton({ className = '', children, returnTo }: FeatureBaseSSOProps) {
  const { isAuthenticated, signIn } = useWebAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSSOLogin = async () => {
    setIsLoading(true);
    
    try {
      // Check if user is authenticated first
      if (!isAuthenticated) {
        // Sign in first, then retry FeatureBase SSO
        await signIn();
        // The signIn process will update auth state, let's wait a moment
        // In a real implementation, you'd listen for auth state changes
        setTimeout(() => {
          if (isAuthenticated) {
            handleSSOLogin(); // Retry after authentication
          }
        }, 1000);
        return;
      }

      // Get SSO token from your secure server endpoint
      const response = await fetch('/api/featurebase/sso-token', {
        method: 'GET',
        credentials: 'include', // Include secure httpOnly cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, sign in again
          await signIn();
          return;
        }
        throw new Error('Failed to get SSO token');
      }
      
      const { token } = await response.json();
      
      if (!token) {
        throw new Error('No SSO token received');
      }

      // Construct secure FeatureBase SSO URL
      const finalReturnTo = returnTo || FEATUREBASE_BASE_URL;
      const ssoUrl = `${FEATUREBASE_BASE_URL}/api/v1/auth/access/jwt?jwt=${encodeURIComponent(token)}&return_to=${encodeURIComponent(finalReturnTo)}`;
      
      // Open FeatureBase with SSO token in secure way
      window.open(ssoUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('SSO login failed:', error);
      // Secure fallback: direct FeatureBase login (no sensitive data exposed)
      window.open(FEATUREBASE_BASE_URL, '_blank', 'noopener,noreferrer');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSSOLogin}
      className={className}
      type="button"
      disabled={isLoading}
    >
      {isLoading ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {isAuthenticated ? 'Opening Support...' : 'Signing In...'}
        </div>
      ) : (
        children
      )}
    </button>
  );
}

interface FeatureBaseLinkProps {
  href?: 'help' | 'roadmap' | 'changelog' | 'feedback';
  className?: string;
  children: React.ReactNode;
  target?: '_blank' | '_self';
}

export function FeatureBaseLink({
  href = 'help',
  className = '',
  children,
  target = '_blank'
}: FeatureBaseLinkProps) {
  const baseUrl = FEATUREBASE_BASE_URL;

  const urls = {
    help: baseUrl,
    roadmap: `${baseUrl}/roadmap`,
    changelog: `${baseUrl}/changelog`,
    feedback: `${baseUrl}/feedback`
  };

  return (
    <a
      href={urls[href]}
      className={className}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

