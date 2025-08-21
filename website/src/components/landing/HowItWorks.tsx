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

// Memoized main component for performance
export const HowItWorks = memo(function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const prefersReducedMotion = useReducedMotion();
  const { trackEvent } = usePlausible();
  const demoStartTracked = useRef(false);
  const [fullScreenVideo, setFullScreenVideo] = React.useState<string | null>(null);

  // Track demo_start event when section comes into view
  useEffect(() => {
    if (demoStartTracked.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !demoStartTracked.current) {
            trackEvent('demo_start', { location: 'how_it_works' });
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

  // Handle full screen video playback
  const handleWatchDemo = (videoUrl: string, stepTitle: string) => {
    if (videoUrl) {
      setFullScreenVideo(videoUrl);
      trackEvent('video_demo_start', { step: stepTitle, location: 'how_it_works' });
    }
  };

  const closeFullScreenVideo = () => {
    setFullScreenVideo(null);
  };

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
                <div 
                  key={index}
                  className="flex-none w-80 bg-card/60 border border-border/50 rounded-lg p-4 hover:bg-card/80 cursor-pointer transition-colors"
                  style={{ scrollSnapAlign: 'start' }}
                  onClick={() => step.video && handleWatchDemo(step.video, step.title)}
                >
                  <div className="aspect-video bg-primary/10 rounded-lg mb-3 overflow-hidden">
                    {step.video ? (
                      <video 
                        className="w-full h-full object-cover"
                        poster={step.poster}
                        preload="metadata"
                        muted
                        playsInline
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      >
                        <source src={step.video} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
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
                  <div className="text-xs text-primary mt-2">Watch Demo →</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Full Screen Video Modal */}
        {fullScreenVideo && (
          <div 
            className="fixed inset-0 z-50 bg-black"
            onClick={closeFullScreenVideo}
          >
            <button
              onClick={closeFullScreenVideo}
              className="absolute top-4 right-4 z-[60] text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2"
              aria-label="Close video"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <video
              className="absolute inset-0 w-full h-full object-contain z-[55]"
              controls
              autoPlay
              preload="metadata"
              onClick={(e) => e.stopPropagation()}
            >
              <source src={fullScreenVideo} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}

      </div>
    </section>
  );
});

// Default export for easier importing
export default HowItWorks;