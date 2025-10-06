'use client';

import { track } from '@/lib/track';
import { trackXEvent } from '@/components/analytics/XPixel';
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

    // Track with Plausible (server-side, cookie-free)
    track({
      event: 'download_click',
      props: {
        location,
        platform,
        version: 'latest',
      },
    });

    // Track with X Pixel (client-side, if loaded)
    const xPixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;
    const xEventId = process.env.NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID;
    if (xPixelId && xEventId) {
      trackXEvent(`tw-${xPixelId}-${xEventId}`, {
        conversion_id: `download-${Date.now()}`,
      });
    }

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