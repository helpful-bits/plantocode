'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { useDownload } from '@/hooks/useDownload';
import { usePlatformDetection } from '@/hooks/usePlatformDetection';
import { cn } from '@/lib/utils';

interface DownloadButtonProps extends Omit<ButtonProps, 'onClick' | 'size'> {
  location: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPlatformText?: boolean;
}

const sizeMap = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  xl: 'xl',
} as const;

export function DownloadButton({
  location,
  size = 'md',
  variant = 'default',
  className,
  showPlatformText = true,
  children,
  ...props
}: DownloadButtonProps) {
  const { handleDownload } = useDownload({ location });
  const { isWindows, isMac, isLoading } = usePlatformDetection();

  const getButtonText = () => {
    if (children) return children;
    
    if (!showPlatformText) return 'Download';
    
    if (isLoading) return 'Download';
    if (isWindows) return 'Download for Windows';
    if (isMac) return 'Download for Mac';
    return 'Download';
  };

  return (
    <Button
      variant={variant}
      size={sizeMap[size]}
      className={cn(className)}
      onClick={handleDownload}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      {...props}
    >
      {getButtonText()}
    </Button>
  );
}