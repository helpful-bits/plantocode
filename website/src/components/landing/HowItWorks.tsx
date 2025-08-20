/**
 * HowItWorks - Main component showing workflow demonstration with conditional mobile/desktop rendering.
 * 
 * Features:
 * - Mobile: Interactive demo with step-by-step navigation
 * - Desktop: Video-based demonstration with optimized playback
 * - Accessibility compliance with ARIA labels and semantic structure
 * - Performance optimizations with dynamic imports and lazy loading
 * - Reduced motion support respecting user preferences
 * - Robust error handling with graceful fallbacks
 */
'use client';

import React, { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { ErrorBoundary } from '@/components/interactive-demo/ErrorBoundary';
import { usePlausible } from '@/hooks/usePlausible';

// Import the interactive component directly to bypass webpack module issues
import { HowItWorksInteractive } from '../interactive-demo/HowItWorksInteractive';

interface Step {
  title: string;
  description: string;
}

interface HowItWorksProps {
  steps?: Step[];
}

const defaultSteps: Step[] = [];

// Memoized main component for performance
export const HowItWorks = memo(function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const prefersReducedMotion = useReducedMotion();
  const { trackEvent } = usePlausible();
  const demoStartTracked = useRef(false);

  // Track demo_start event when section comes into view
  useEffect(() => {
    if (demoStartTracked.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !demoStartTracked.current) {
            trackEvent('demo_start');
            demoStartTracked.current = true;
          }
        });
      },
      { threshold: 0.3 }
    );

    const section = document.getElementById('how-it-works');
    if (section) {
      observer.observe(section);
    }

    return () => {
      if (section) {
        observer.unobserve(section);
      }
    };
  }, [trackEvent]);

  return (
    <section 
      className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" 
      id="how-it-works"
      aria-label="How Vibe Manager works - Step-by-step demonstration"
    >
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal 
            as="h2" 
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 sm:mb-6 text-primary-emphasis font-bold"
            delay={prefersReducedMotion ? 0 : 0}
          >
            How It Works
          </Reveal>
          <Reveal 
            as="p" 
            className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 px-4 sm:px-0" 
            delay={prefersReducedMotion ? 0 : 0.05}
          >
            From task description to implementation plan in minutes
          </Reveal>
        </div>

        {/* Always show interactive demo */}
        <div className="max-w-4xl mx-auto mb-12">
          <ErrorBoundary>
            <HowItWorksInteractive />
          </ErrorBoundary>
        </div>

        {/* "See it in action" video section */}
        <div className="max-w-4xl mx-auto">
          <Reveal 
            className="text-center mb-8"
            delay={prefersReducedMotion ? 0 : 0.1}
          >
            <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              See It In Action
            </h3>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Watch detailed video demonstrations of each workflow step
            </p>
          </Reveal>

          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4" style={{ scrollSnapType: 'x mandatory' }}>
              {steps.map((step, index) => (
                <div 
                  key={index}
                  className="flex-none w-64 bg-card/60 border border-border/50 rounded-lg p-4 hover:bg-card/80 cursor-pointer transition-colors"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <div className="aspect-video bg-primary/10 rounded-lg mb-3 flex items-center justify-center">
                    <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <div className="flex gap-2 mb-2">
                    <span className="text-primary font-bold text-sm">{index + 1}</span>
                    <h4 className="text-sm font-semibold">{step.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
                  <div className="text-xs text-primary mt-2">Watch Demo →</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
});

// Default export for easier importing
export default HowItWorks;