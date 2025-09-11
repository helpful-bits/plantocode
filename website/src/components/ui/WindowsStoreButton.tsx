'use client';

import Script from 'next/script';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface WindowsStoreButtonProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

// TypeScript declaration for the ms-store-badge custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ms-store-badge': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        productid?: string;
        productname?: string;
        'window-mode'?: string;
        theme?: string;
        size?: string;
        language?: string;
        animation?: string;
      };
    }
  }
}

export function WindowsStoreButton({ 
  size = 'medium',
  className 
}: WindowsStoreButtonProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Polyfill crypto.randomUUID if not available
    if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
      (crypto as any).randomUUID = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };
    }
  }, []);

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    const height = size === 'large' ? '48px' : size === 'medium' ? '44px' : '40px';
    return <div className={className} style={{ height }} />; // Placeholder with expected height
  }

  // Map our theme to Microsoft Store theme values
  const storeTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  const sizeClasses = {
    small: 'h-10', // 40px to match Button size="sm"
    medium: 'h-11', // 44px to match Button size="md" 
    large: 'h-12', // 48px to match Button size="lg"
  };

  return (
    <div className={`${className} inline-flex items-center justify-center ${sizeClasses[size]}`}>
      <Script
        src="https://get.microsoft.com/badge/ms-store-badge.bundled.js"
        strategy="lazyOnload"
      />
      {/* @ts-ignore - Custom element from Microsoft Store */}
      <ms-store-badge
        productid="9PCFLDMDJJBX"
        productname="Vibe Manager"
        window-mode="direct"
        theme={storeTheme}
        size={size}
        language="en"
        animation="off"
      />
    </div>
  );
}