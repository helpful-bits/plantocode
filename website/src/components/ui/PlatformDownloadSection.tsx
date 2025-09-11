'use client';

import { DownloadButton } from './DownloadButton';
import { WindowsStoreButton } from './WindowsStoreButton';
import { usePlatformDetection } from '@/hooks/usePlatformDetection';

interface PlatformDownloadSectionProps {
  location: string;
  className?: string;
  redirectToDownloadPage?: boolean; // For sections where we want to redirect on unknown platform
}

export function PlatformDownloadSection({
  location,
  className,
  redirectToDownloadPage = false,
}: PlatformDownloadSectionProps) {
  const { isWindows, isMac, isLoading } = usePlatformDetection();

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
        <DownloadButton
          location={location}
          size="lg"
          variant="cta"
        />
      </div>
    );
  }

  // Show both options for other/unknown platforms OR redirect to download page
  if (redirectToDownloadPage) {
    return (
      <div className={className}>
        <DownloadButton
          location={location}
          size="lg"
          variant="cta"
          showPlatformText={false}
        >
          <a href="/download" className="no-underline">Download</a>
        </DownloadButton>
      </div>
    );
  }

  // Default: show both options stacked (for hero section)
  return (
    <div className={className}>
      <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Mac</span>
          <DownloadButton
            location={location}
            size="md"
            variant="cta"
            showPlatformText={false}
          >
            Download for Mac
          </DownloadButton>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Windows</span>
          <WindowsStoreButton size={location === 'hero_section' || location === 'cta_section' || location === 'demo_screenshots' || location === 'pricing' ? 'medium' : 'small'} />
        </div>
      </div>
    </div>
  );
}