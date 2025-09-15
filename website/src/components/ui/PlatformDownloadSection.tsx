'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { DownloadButton } from './DownloadButton';
import { MacDownloadButton } from './MacDownloadButton';
import { WindowsStoreButton } from './WindowsStoreButton';
import { usePlatformDetection } from '@/hooks/usePlatformDetection';

interface PlatformDownloadSectionProps {
  location?: string;
  className?: string;
  redirectToDownloadPage?: boolean; // For sections where we want to redirect on unknown platform
}

export function PlatformDownloadSection({
  location = 'default',
  className,
  redirectToDownloadPage = false,
}: PlatformDownloadSectionProps) {
  const { isWindows, isMac, isLoading, platform } = usePlatformDetection();

  if (isLoading) {
    return (
      <div className={className}>
        <DownloadButton
          location={location}
          size="lg"
          variant="cta"
          showPlatformText={false}
        >
          Download
        </DownloadButton>
      </div>
    );
  }

  // Show Windows Store button for Windows users
  if (isWindows) {
    return (
      <div className={className}>
        <WindowsStoreButton size={location === 'hero_section' || location === 'cta_section' || location === 'demo_screenshots' || location === 'pricing' ? 'medium' : 'small'} />
      </div>
    );
  }

  // Show Mac download button for Mac users
  if (isMac) {
    return (
      <div className={className}>
        <MacDownloadButton
          location={location}
          size="lg"
        />
      </div>
    );
  }

  // If platform is unknown and redirect is enabled, show download page link
  if (platform === 'other' && redirectToDownloadPage) {
    return (
      <div className={className}>
        <Link
          href="/downloads"
          className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4 mr-2" />
          Download Vibe Manager
        </Link>
      </div>
    );
  }

  // Default: show both options stacked (for hero section)
  return (
    <div className={className}>
      <div className="flex flex-col gap-6 sm:gap-4 w-full max-w-md mx-auto">
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Mac</span>
          <MacDownloadButton
            location={location}
            size="md"
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Windows</span>
          <WindowsStoreButton size={location === 'hero_section' || location === 'cta_section' || location === 'demo_screenshots' || location === 'pricing' ? 'medium' : 'small'} />
        </div>
      </div>
    </div>
  );
}