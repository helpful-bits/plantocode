import React from 'react';
import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import { brand } from '../config/brand';

interface CaptionProps {
  text: string;
  timing?: 'fade' | 'static';
  fadeInDuration?: number;
  fadeOutDuration?: number;
  appearFromFrame?: number;
  disappearAtFrame?: number;
}

export const Caption: React.FC<CaptionProps> = ({
  text,
  timing = 'fade',
  fadeInDuration = 15,
  fadeOutDuration = 15,
  appearFromFrame,
  disappearAtFrame
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  
  const start = appearFromFrame ?? 0;
  const end = disappearAtFrame ?? durationInFrames;
  
  // Calculate opacity based on available frames
  let opacity = 0;
  
  if (timing === 'fade') {
    const duration = end - start;
    
    // If the sequence is too short for fades, just show/hide
    if (duration <= fadeInDuration + fadeOutDuration) {
      // Simple fade for very short sequences
      if (duration <= 2) {
        opacity = frame >= start && frame < end ? 1 : 0;
      } else {
        // Use a simple linear fade
        const middle = start + Math.floor(duration / 2);
        opacity = interpolate(
          frame,
          [start, middle, end],
          [0, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
    } else {
      // Normal fade with proper spacing
      const fadeInEnd = start + fadeInDuration;
      const fadeOutStart = end - fadeOutDuration;
      opacity = interpolate(
        frame,
        [start, fadeInEnd, fadeOutStart, end],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    }
  } else {
    opacity = frame >= start && frame < end ? 1 : 0;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: brand.safeArea,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity,
        fontFamily: brand.caption.fontFamily,
        fontSize: brand.caption.fontSize,
        fontWeight: brand.caption.fontWeight,
        backgroundColor: brand.caption.background,
        borderRadius: brand.caption.borderRadius,
        paddingLeft: brand.caption.padding.x,
        paddingRight: brand.caption.padding.x,
        paddingTop: brand.caption.padding.y,
        paddingBottom: brand.caption.padding.y,
        backdropFilter: brand.caption.backdropFilter,
        WebkitBackdropFilter: brand.caption.backdropFilter,
        border: brand.caption.border,
        boxShadow: brand.caption.boxShadow,
        color: 'white',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
      }}
    >
      {text}
    </div>
  );
};