'use client';

import { useState, useEffect } from 'react';

type Platform = 'windows' | 'mac' | 'other';

interface PlatformDetection {
  isWindows: boolean;
  isMac: boolean;
  isLoading: boolean;
  platform: Platform;
}

export function usePlatformDetection(): PlatformDetection {
  const [platform, setPlatform] = useState<Platform>('other');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    let detectedPlatform: Platform = 'other';

    try {
      // Try modern navigator.userAgentData.platform first
      if ('userAgentData' in navigator && (navigator as any).userAgentData?.platform) {
        const platformInfo = (navigator as any).userAgentData.platform.toLowerCase();
        if (platformInfo.includes('win')) {
          detectedPlatform = 'windows';
        } else if (platformInfo.includes('mac')) {
          detectedPlatform = 'mac';
        }
      } else if (navigator.platform) {
        // Fallback to navigator.platform
        const platformInfo = navigator.platform.toLowerCase();
        if (platformInfo.includes('win')) {
          detectedPlatform = 'windows';
        } else if (platformInfo.includes('mac')) {
          detectedPlatform = 'mac';
        }
      } else {
        // Final fallback to user agent string
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('win')) {
          detectedPlatform = 'windows';
        } else if (userAgent.includes('mac')) {
          detectedPlatform = 'mac';
        }
      }
    } catch (error) {
      console.debug('Platform detection failed:', error);
    }

    setPlatform(detectedPlatform);
    setIsLoading(false);
  }, []);

  return {
    isWindows: platform === 'windows',
    isMac: platform === 'mac',
    isLoading,
    platform,
  };
}