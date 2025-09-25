'use client';

import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface WindowsStoreButtonProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function WindowsStoreButton({ 
  size = 'medium',
  className 
}: WindowsStoreButtonProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Size mappings for the badge
  const width = size === 'large' ? 250 : size === 'medium' ? 200 : 150;
  const height = size === 'large' ? 61 : size === 'medium' ? 48 : 36;

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return <div className={className} style={{ height: `${height}px`, width: `${width}px` }} />;
  }

  // Use locally hosted badges to avoid third-party cookies
  const badgeUrl = resolvedTheme === 'dark'
    ? '/images/badges/microsoft-store-dark.svg'
    : '/images/badges/microsoft-store-light.svg';

  return (
    <a
      href="https://apps.microsoft.com/detail/9PCFLDMDJJBX?referrer=appbadge&mode=direct"
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded`}
      style={{ display: 'inline-block', lineHeight: 0, minHeight: '44px' }}
      aria-label="Download Vibe Manager from Microsoft Store"
    >
      <img 
        src={badgeUrl}
        alt="Get it from Microsoft"
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </a>
  );
}