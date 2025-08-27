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

import React, { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { ErrorBoundary } from '@/components/interactive-demo/ErrorBoundary';
import { usePlausible } from '@/hooks/usePlausible';

// Import the interactive component directly to bypass webpack module issues
import { HowItWorksInteractive } from '../interactive-demo/HowItWorksInteractive';

interface Step {
  title: string;
  description: string;
  video?: string;
  poster?: string;
  subSteps?: {
    title: string;
    video: string;
    poster: string;
  }[];
}

interface HowItWorksProps {
  steps?: Step[];
}

const defaultSteps: Step[] = [];

// Memoized video card component with lazy loading
const VideoCard = memo(function VideoCard({ 
  step, 
  index, 
  trackVideoPlay,
  trackVideoComplete
}: { 
  step: Step & { isSubStep?: boolean }, 
  index: number, 
  trackVideoPlay: (title: string) => void,
  trackVideoComplete: (title: string, duration?: number) => void
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { 
        setIsVisible(true); 
        io.disconnect(); 
      }
    }, { rootMargin: '200px 0px', threshold: 0.2 });
    io.observe(cardRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <div 
      ref={cardRef}
      className="flex-none w-80 bg-card/60 border border-border/50 rounded-lg p-4"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div 
        className="aspect-video bg-primary/10 rounded-lg mb-3 overflow-hidden relative"
        style={{
          backgroundImage: step.poster ? `url(${step.poster})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {step.video && isVisible ? (
          <video 
            className="w-full h-full object-cover rounded-lg relative z-10"
            poster={step.poster?.replace(/\.(jpg|jpeg)$/i, '.webp') || step.poster}
            controls
            preload="metadata"
            playsInline
            onPlay={() => trackVideoPlay(step.title)}
            onEnded={(e) => {
              const video = e.currentTarget;
              trackVideoComplete(step.title, video.duration);
            }}
            onError={(e) => {
              console.log('Video error handled:', e);
            }}
            onAbort={(e) => {
              console.log('Video abort handled:', e);
            }}
          >
            <source src={step.video} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="w-full h-full flex items-center justify-center absolute inset-0 z-20">
            <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        )}
      </div>
      <div className="flex gap-2 mb-2">
        <span className="text-primary font-bold text-sm">{index + 1}</span>
        <h4 className="text-sm font-semibold">{step.title}</h4>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
    </div>
  );
});

// Memoized main component for performance
export const HowItWorks = memo(function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const prefersReducedMotion = useReducedMotion();
  const { trackVideoPlay, trackVideoComplete } = usePlausible();
  const demoStartTracked = useRef(false);

  // Track demo_start event when section comes into view
  useEffect(() => {
    if (demoStartTracked.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !demoStartTracked.current) {
            trackVideoPlay('demo_start');
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
  }, [trackVideoPlay]);

  // Flatten steps to include substeps as individual items
  const flattenedSteps = React.useMemo(() => {
    const flattened: Array<Step & { isSubStep?: boolean }> = [];
    
    steps.forEach((step) => {
      if (step.subSteps && step.subSteps.length > 0) {
        // Add substeps as individual items
        step.subSteps.forEach((subStep) => {
          flattened.push({
            title: subStep.title,
            description: step.description, // Use parent description
            video: subStep.video,
            poster: subStep.poster,
            isSubStep: true
          });
        });
      } else {
        // Add regular step
        flattened.push(step);
      }
    });
    
    return flattened;
  }, [steps]);

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
            className="text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-foreground/80 px-4 sm:px-0" 
            delay={prefersReducedMotion ? 0 : 0.05}
          >
            Experience Vibe Manager's complete workflow through this interactive demonstration. 
            Each step shows exactly how the tool helps you find the right files, generate better plans, and ship correct changes.
          </Reveal>
        </div>

        {/* Always show interactive demo */}
        <div className="max-w-4xl mx-auto mb-12">
          <ErrorBoundary>
            <HowItWorksInteractive />
          </ErrorBoundary>
        </div>

        {/* "See it in action" video section */}
        <div className="max-w-4xl mx-auto mb-8">
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
        </div>

        {/* Full-width scrollable video container */}
        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex gap-4 pb-4 px-4" style={{ scrollSnapType: 'x mandatory', width: 'max-content' }}>
              {flattenedSteps.map((step, index) => (
                <VideoCard 
                  key={index} 
                  step={step} 
                  index={index} 
                  trackVideoPlay={trackVideoPlay}
                  trackVideoComplete={trackVideoComplete}
                />
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