'use client';

import { track } from '@/lib/track';
import { usePlatformDetection } from './usePlatformDetection';

interface UseDownloadOptions {
  location: string;
}

interface UseDownloadReturn {
  handleDownload: (event?: React.MouseEvent) => void;
}

export function useDownload({ location }: UseDownloadOptions): UseDownloadReturn {
  const { platform } = usePlatformDetection();

  const handleDownload = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
    }

    // Track the download click event
    track({
      event: 'download_click',
      props: {
        location,
        platform,
        version: 'latest',
      },
    });

    // Redirect to appropriate endpoint based on platform
    if (platform === 'mac') {
      window.location.href = `/api/download/mac?source=${encodeURIComponent(location)}`;
    } else if (platform === 'windows') {
      window.location.href = `/api/download/windows?source=${encodeURIComponent(location)}`;
    } else {
      // Default to Mac for unknown platforms
      window.location.href = `/api/download/mac?source=${encodeURIComponent(location)}`;
    }
  };

  return { handleDownload };
}