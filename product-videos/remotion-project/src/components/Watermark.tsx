import React from 'react';
import { brand } from '../config/brand';

export const Watermark: React.FC = () => {
  return (
    <div
      style={{
        position: 'absolute',
        opacity: brand.watermark.opacity,
        bottom: brand.safeArea,
        right: brand.safeArea,
        color: brand.watermark.color || 'white',
        fontSize: '14px',
        fontWeight: 300,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        pointerEvents: 'none',
        letterSpacing: '0.05em'
      }}
    >
      {brand.watermark.text}
    </div>
  );
};