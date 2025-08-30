/**
 * HowItWorks - Video-based workflow demonstration component.
 * 
 * Features:
 * - Video-based demonstration with optimized playback
 * - Accessibility compliance with ARIA labels and semantic structure
 * - Performance optimizations with dynamic imports and lazy loading
 * - Reduced motion support respecting user preferences
 * - Robust error handling with graceful fallbacks
 */
'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { usePlausible } from '@/hooks/usePlausible';
import { ScreenshotGallery } from '@/components/demo/ScreenshotGallery';

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
      className="flex-none w-96 bg-card/60 border border-border/50 rounded-lg p-5"
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
            className="w-full h-full object-cover rounded-lg relative z-10 cursor-pointer"
            poster={step.poster?.replace(/\.(jpg|jpeg)$/i, '.webp') || step.poster}
            controls
            preload="metadata"
            playsInline
            onClick={(e) => {
              const video = e.currentTarget;
              // Prevent default click behavior
              e.preventDefault();
              
              // Cross-browser fullscreen support
              if (video.requestFullscreen) {
                video.requestFullscreen();
              } else if ((video as any).webkitRequestFullscreen) {
                // Safari/old Chrome
                (video as any).webkitRequestFullscreen();
              } else if ((video as any).mozRequestFullScreen) {
                // Firefox
                (video as any).mozRequestFullScreen();
              } else if ((video as any).msRequestFullscreen) {
                // IE/Edge
                (video as any).msRequestFullscreen();
              } else if ((video as any).webkitEnterFullscreen) {
                // iOS Safari
                (video as any).webkitEnterFullscreen();
              }
            }}
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
      <div className="flex gap-2 mb-3">
        <span className="text-primary font-bold text-base">{index + 1}</span>
        <h4 className="text-base font-semibold">{step.title}</h4>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-3">{step.description}</p>
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
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 sm:mb-6 text-primary font-bold"
            delay={prefersReducedMotion ? 0 : 0}
          >
            How It Works
          </Reveal>
        </div>

        {/* Screenshot Gallery Section */}
        <ScreenshotGallery />

        {/* Videos Section */}
        <div className="mt-16 mb-8">
          <Reveal 
            as="h3" 
            className="text-2xl sm:text-3xl md:text-4xl mb-4 text-center text-primary font-bold"
            delay={prefersReducedMotion ? 0 : 0}
          >
            Watch It In Action
          </Reveal>
          <Reveal 
            as="p" 
            className="text-base sm:text-lg text-center text-muted-foreground mb-8"
            delay={prefersReducedMotion ? 0 : 0.05}
          >
            Explore each feature with interactive video demos
          </Reveal>
        </div>

        {/* Full-width scrollable video container */}
        <div className="w-full overflow-hidden relative">
          {/* Scroll indicator for mobile */}
          <div className="sm:hidden absolute right-4 top-0 z-10 flex items-center gap-2 text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-full">
            <span>Swipe for more</span>
            <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </div>
          
          {/* Video container with improved mobile UX */}
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
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
          
          {/* Gradient fade indicators for desktop */}
          <div className="hidden sm:block absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
          <div className="hidden sm:block absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
        </div>

      </div>
    </section>
  );
});

// Default export for easier importing
export default HowItWorks;