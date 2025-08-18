import React from 'react';
import { brand, colors } from '../config/brand';

interface CTAProps {
  text?: string;
}

export const CTA: React.FC<CTAProps> = ({
  text = "See How It Works"
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: brand.safeArea,
        left: '50%',
        transform: 'translateX(-50%)',
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
        border: `1px solid ${colors.tealLight}`,
        boxShadow: brand.caption.boxShadow,
        color: 'white',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
      }}
    >
      {text}
    </div>
  );
};