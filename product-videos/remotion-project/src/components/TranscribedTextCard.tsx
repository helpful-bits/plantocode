import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { brand } from '../config/brand';

interface TranscribedTextCardProps {
  text: string;
  appearFromFrame: number;
  disappearAtFrame?: number;
}

export const TranscribedTextCard: React.FC<TranscribedTextCardProps> = ({
  text,
  appearFromFrame,
  disappearAtFrame
}) => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(
    frame,
    [appearFromFrame, appearFromFrame + 10],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = disappearAtFrame 
    ? interpolate(
        frame,
        [disappearAtFrame - 10, disappearAtFrame],
        [opacity, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : opacity;

  if (frame < appearFromFrame || (disappearAtFrame && frame > disappearAtFrame)) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: brand.safeArea + 80,
        left: brand.safeArea,
        right: brand.safeArea,
        padding: `${brand.caption.padding.y}px ${brand.caption.padding.x}px`,
        borderRadius: brand.caption.borderRadius,
        fontFamily: brand.caption.fontFamily,
        fontSize: brand.caption.fontSize,
        fontWeight: brand.caption.fontWeight,
        color: 'white',
        background: brand.caption.background,
        backdropFilter: brand.caption.backdropFilter,
        WebkitBackdropFilter: brand.caption.backdropFilter,
        border: brand.caption.border,
        boxShadow: brand.caption.boxShadow,
        textAlign: 'center',
        opacity: finalOpacity,
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
      }}
    >
      {text}
    </div>
  );
};