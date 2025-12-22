'use client';

interface AppStoreButtonProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function AppStoreButton({
  size = 'medium',
  className
}: AppStoreButtonProps) {
  // Size mappings for the badge
  const height = size === 'large' ? 60 : size === 'medium' ? 48 : 36;

  return (
    <a
      href="https://apps.apple.com/app/plantocode-remote/id6752567525"
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded`}
      style={{ display: 'inline-block', lineHeight: 0, minHeight: '44px' }}
      aria-label="Download PlanToCode Remote from App Store"
    >
      <img
        src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
        alt="Download on the App Store"
        height={height}
        style={{ display: 'block', height: `${height}px`, width: 'auto' }}
      />
    </a>
  );
}
