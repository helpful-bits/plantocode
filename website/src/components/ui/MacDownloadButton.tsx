'use client';

import { useDownload } from '@/hooks/useDownload';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface MacDownloadButtonProps {
  location: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function MacDownloadButton({
  location,
  size = 'md',
  className,
}: MacDownloadButtonProps) {
  const { handleDownload } = useDownload({ location });
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dimensions = {
    sm: { width: 120, height: 40, fontSize: '13px' },
    md: { width: 140, height: 47, fontSize: '15px' },
    lg: { width: 165, height: 55, fontSize: '17px' },
    xl: { width: 200, height: 67, fontSize: '20px' },
  }[size];

  const iconSize = {
    sm: 28,
    md: 34,
    lg: 40,
    xl: 48,
  }[size];

  if (!mounted) {
    return <div style={{ width: dimensions.width, height: dimensions.height }} />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={handleDownload}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className
      )}
      aria-label="Download PlanToCode for Mac"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        fontSize: dimensions.fontSize,
        padding: '0 12px',
        borderRadius: '12px',
        border: isDark ? '2px solid #ffffff' : '2px solid #000000',
        backgroundColor: isDark ? '#000000' : '#ffffff',
        color: isDark ? '#ffffff' : '#000000',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.85';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      <svg
        aria-hidden="true"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <span style={{ lineHeight: 1, fontWeight: 600 }}>Download for Mac</span>
    </button>
  );
}