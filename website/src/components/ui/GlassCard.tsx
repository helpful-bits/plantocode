'use client';

import { forwardRef, HTMLAttributes, useRef, useState, useCallback, MouseEvent, memo, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
  variant?: 'default' | 'subtle' | 'elevated' | 'intense';
}

const GlassCardComponent = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, highlighted = false, variant = 'default', children, onClick, ...props }, ref) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
    const [isHovered, setIsHovered] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    
    // Detect mobile device for optimized interactions
    useEffect(() => {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);
    
    const glassClass = 
      variant === 'subtle' ? 'glass-subtle' : 
      variant === 'elevated' ? 'glass-elevated' : 
      variant === 'intense' ? 'glass-intense' :
      'glass';
    
    
    const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      
      const rect = cardRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      
      // Only add ripples on non-mobile devices for performance
      if (!isMobile) {
        setRipples(prev => [...prev, { x, y, id }]);
        
        // Remove ripple after animation with optimized timing
        setTimeout(() => {
          setRipples(prev => prev.filter(ripple => ripple.id !== id));
        }, 800); // Shorter duration for better performance
      }
      
      // Call original onClick if provided
      onClick?.(e);
    }, [onClick, isMobile]);
    
    const handleMouseEnter = useCallback(() => {
      if (!isMobile) {
        setIsHovered(true);
      }
    }, [isMobile]);
    
    const handleMouseLeave = useCallback(() => {
      if (!isMobile) {
        setIsHovered(false);
      }
    }, [isMobile]);
    
    return (
      <div 
        ref={(node) => {
          // Handle both refs
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          cardRef.current = node;
        }}
        className={cn(
          "relative rounded-2xl p-6 overflow-hidden transition-all duration-300",
          glassClass,
          highlighted && "glass-elevated scale-105 teal-glow-subtle",
          isHovered && !isMobile && "glass-shimmer",
          "will-change-transform", // Performance hint
          className
        )}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ 
          transform: 'translateZ(0)', // GPU acceleration
          ...props.style 
        }}
        {...props}
      >
        {/* Enhanced ripple effects with GPU acceleration */}
        {!isMobile && ripples.map(ripple => (
          <span
            key={ripple.id}
            className="absolute pointer-events-none"
            style={{
              left: ripple.x,
              top: ripple.y,
              transform: 'translate(-50%, -50%) translateZ(0)',
            }}
          >
            <span 
              className="block rounded-full bg-white/25 dark:bg-white/15 animate-ripple-expand will-change-transform"
              style={{
                width: 0,
                height: 0,
                transform: 'translateZ(0)'
              }}
            />
          </span>
        ))}
        
        {/* Hover glow effect */}
        {isHovered && !isMobile && (
          <div 
            className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.1) 0%, transparent 70%)',
              opacity: 0.6,
              transform: 'translateZ(0)'
            }}
          />
        )}
        
        <div 
          className="relative z-10"
          style={{ transform: 'translateZ(0)' }}
        >
          {children}
        </div>
      </div>
    );
  }
);

GlassCardComponent.displayName = 'GlassCard';

// Memoize the component to prevent unnecessary re-renders
export const GlassCard = memo(GlassCardComponent);

export default GlassCard;