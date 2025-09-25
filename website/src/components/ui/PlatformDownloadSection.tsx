'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button } from './button';
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
      <div className={`flex justify-center ${className || ''}`}>
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
      <div className={`flex justify-center ${className || ''}`}>
        <WindowsStoreButton size={location === 'hero_section' || location === 'cta_section' || location === 'demo_screenshots' || location === 'pricing' ? 'medium' : 'small'} />
      </div>
    );
  }

  // Show Mac download button for Mac users
  if (isMac) {
    return (
      <div className={`flex justify-center ${className || ''}`}>
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
      <div className={`flex justify-center ${className || ''}`}>
        <Button variant="cta" size="lg" asChild>
          <Link href="/downloads" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Vibe Manager
          </Link>
        </Button>
      </div>
    );
  }

  // Default: show both options stacked (for hero section)
  return (
    <div className={`flex justify-center ${className || ''}`}>
      <div className="flex flex-col gap-6 sm:gap-4 w-full max-w-md">
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Mac • Signed & Notarized</span>
          <MacDownloadButton
            location={location}
            size="md"
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Windows • Microsoft Store Verified</span>
          <WindowsStoreButton size={location === 'hero_section' || location === 'cta_section' || location === 'demo_screenshots' || location === 'pricing' ? 'medium' : 'small'} />
        </div>
        <div className="flex flex-col items-center gap-1 mt-2">
          <span className="text-xs text-muted-foreground">$5 Free Credits • Pay-as-you-go</span>
          <span className="text-xs text-muted-foreground">Local Session History • No Subscriptions</span>
        </div>
      </div>
    </div>
  );
}