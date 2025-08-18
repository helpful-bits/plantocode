import React, { CSSProperties } from 'react';
import { OffthreadVideo, useCurrentFrame } from 'remotion';

interface SpeedRampVideoProps {
  src: string;
  speedFunction: (frame: number) => number;
  trimStart?: number;
  trimEnd?: number;
  muted?: boolean;
  objectFit?: CSSProperties['objectFit'];
}

export const SpeedRampVideo: React.FC<SpeedRampVideoProps> = ({
  src,
  speedFunction,
  trimStart = 0,
  trimEnd,
  muted = true,
  objectFit = 'cover'
}) => {
  const frame = useCurrentFrame();
  
  // Calculate accumulated elapsed source frames via speedFunction
  let elapsed = 0;
  for (let i = 0; i < frame; i++) {
    elapsed += speedFunction(i);
  }
  
  // Calculate the current playback rate
  const currentRate = speedFunction(frame);
  
  // Calculate the effective frame position in the source video
  const effectiveTrimBefore = trimStart + Math.round(elapsed);
  
  // Only apply trimAfter if it's defined and valid
  const effectiveTrimAfter = trimEnd && trimEnd > effectiveTrimBefore 
    ? trimEnd - effectiveTrimBefore 
    : undefined;
  
  return (
    <OffthreadVideo
      src={src}
      muted={muted}
      playbackRate={currentRate}
      trimBefore={effectiveTrimBefore}
      trimAfter={effectiveTrimAfter}
      style={{
        width: '100%',
        height: '100%',
        objectFit
      }}
    />
  );
};