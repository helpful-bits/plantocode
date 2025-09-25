'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { VideoModal } from './VideoModal';

interface VideoButtonProps {
  buttonText?: string;
  videoPath?: string;
  className?: string;
  size?: 'sm' | 'base' | 'lg';
}

export function VideoButton({
  buttonText = 'Watch 60s Demo',
  videoPath = '/assets/videos/hero-section-16by9.mp4',
  className = '',
  size = 'base'
}: VideoButtonProps) {
  const [showVideo, setShowVideo] = useState(false);

  const sizeClasses = {
    sm: 'h-9 px-4 text-sm',
    base: 'h-11 px-6 text-base',
    lg: 'h-12 px-8 text-lg'
  };

  return (
    <>
      <button
        onClick={() => setShowVideo(true)}
        className={`justify-center whitespace-nowrap rounded-xl transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-98 bg-gradient-to-r from-[oklch(0.48_0.15_195)] via-[oklch(0.50_0.14_190)] to-[oklch(0.52_0.13_185)] hover:from-[oklch(0.42_0.17_195)] hover:via-[oklch(0.44_0.16_190)] hover:to-[oklch(0.46_0.15_185)] text-white font-bold shadow-md hover:shadow-lg shadow-[oklch(0.48_0.15_195_/_0.3)] hover:shadow-[oklch(0.48_0.15_195_/_0.4)] dark:from-[oklch(0.58_0.12_195)] dark:via-[oklch(0.60_0.11_190)] dark:to-[oklch(0.62_0.10_185)] dark:hover:from-[oklch(0.55_0.13_195)] dark:hover:via-[oklch(0.57_0.12_190)] dark:hover:to-[oklch(0.59_0.11_185)] dark:text-white flex items-center gap-2 ${sizeClasses[size]} ${className}`}
      >
        <Play className="w-4 h-4" />
        {buttonText}
      </button>

      <VideoModal
        isOpen={showVideo}
        onClose={() => setShowVideo(false)}
        videoPath={videoPath}
      />
    </>
  );
}