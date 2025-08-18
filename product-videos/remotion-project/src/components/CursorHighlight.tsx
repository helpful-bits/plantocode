import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { brand, colors } from '../config/brand';

interface CursorHighlightProps {
  x: number;
  y: number;
  visible: boolean;
}

export const CursorHighlight: React.FC<CursorHighlightProps> = ({
  x,
  y,
  visible
}) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(
    frame % 60,
    [0, 30, 60],
    [1, 1.2, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  if (!visible) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${pulse})`
      }}
    >
      <div
        style={{
          width: brand.cursorHighlight.radius * 2,
          height: brand.cursorHighlight.radius * 2,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${brand.cursorHighlight.color || colors.tealBright}${Math.round(brand.cursorHighlight.opacity * 255).toString(16)}, transparent)`,
          boxShadow: `0 0 20px ${colors.tealBright.replace(')', ' / 0.3)')}`,
          filter: 'blur(1px)'
        }}
      />
    </div>
  );
};