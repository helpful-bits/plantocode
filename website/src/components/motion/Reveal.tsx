'use client';

import { motion, useReducedMotion, type MotionStyle } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  as?: 'div' | 'section' | 'article' | 'main' | 'header' | 'footer' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  delay?: number;
  duration?: number;
  amount?: number;
  once?: boolean;
  children: ReactNode;
  className?: string;
  style?: MotionStyle;
  id?: string;
}

export default function Reveal({
  as = 'div',
  delay = 0,
  duration,
  amount = 0.25,
  once = true,
  className,
  children,
  style,
  id
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion();
  
  // If reduced motion is enabled, render without animation
  if (shouldReduceMotion) {
    // Use a simple div for reduced motion
    // Convert MotionStyle to CSSProperties if needed
    const cssStyle = style as React.CSSProperties | undefined;
    return (
      <div className={className} style={cssStyle} id={id}>
        {children}
      </div>
    );
  }

  const MotionComponent = motion[as] as typeof motion.div;

  return (
    <MotionComponent
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{
        once,
        amount,
        margin: '-10% 0px'
      }}
      transition={{
        delay,
        duration,
        // Will inherit from MotionConfig if not specified
      }}
      className={className}
      {...(style && { style })}
      id={id}
    >
      {children}
    </MotionComponent>
  );
}