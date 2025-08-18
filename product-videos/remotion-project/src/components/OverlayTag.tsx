import React from 'react';
import { brand, colors } from '../config/brand';

interface OverlayTagProps {
  text: string;
  position?: 'top-left' | 'top-right';
}

export const OverlayTag: React.FC<OverlayTagProps> = ({
  text,
  position = 'top-left'
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: brand.safeArea,
        left: position === 'top-left' ? brand.safeArea : undefined,
        right: position === 'top-right' ? brand.safeArea : undefined,
        padding: '8px 16px',
        borderRadius: brand.callouts.radius,
        fontWeight: 600,
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: 'white',
        border: brand.callouts.border,
        backgroundColor: brand.callouts.bg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: `0 4px 12px ${colors.tealLight.replace(')', ' / 0.15)')}`,
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
      }}
    >
      {text}
    </div>
  );
};