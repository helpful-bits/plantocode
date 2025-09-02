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
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/motion/Reveal';
import { trackVideo } from '@/lib/track';
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
  index
}: { 
  step: Step & { isSubStep?: boolean }, 
  index: number
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
            poster={step.poster}
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
            onPlay={() => trackVideo(step.title, 'play')}
            onEnded={(e) => {
              const video = e.currentTarget;
              trackVideo(step.title, 'complete', video.duration);
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
  const demoStartTracked = useRef(false);

  // Track demo_start event when section comes into view
  useEffect(() => {
    if (demoStartTracked.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !demoStartTracked.current) {
            trackVideo('demo_start', 'play');
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
  }, []);

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

        {/* Vibe Manager Panels Flow - Core Features */}
        <div className="vibe-panels-container mb-16">
          {/* Screen reader description for features */}
          <div id="features-description" className="sr-only">
            Three core features: 1) Find Files - AI discovers and analyzes the exact files you need, 
            2) Parallel Planning - Multiple AI models create competing implementation plans,
            3) Plan for Claude Code - Generate blueprints your coding agent can execute.
          </div>
          
          {/* Desktop Static Layout */}
          <div className="hidden lg:flex items-center justify-center gap-6">
            <div className="vibe-panel">
              <h2 className="vibe-panel__title">Find Files</h2>
              
              <div className="vibe-intent-box">
                <div className="vibe-intent-box__item">Regex Filter</div>
                <div className="vibe-intent-box__item">File Content Relevance</div>
                <div className="vibe-intent-box__item">Dependencies</div>
              </div>

              <p className="vibe-panel__description">
                AI reads your code, not just names. Finds dependencies you forgot existed.
                From 1,000 files to the 10 that matter. Results persist - use them forever.
              </p>
            </div>

            <div className="vibe-chevron">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
              <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
              
              <div className="vibe-models-container">
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Claude 4</span>
                    <span className="vibe-model-card__progress">85%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '85%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Analyzing patterns...</div>
                </div>
                
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">GPT-5</span>
                    <span className="vibe-model-card__progress">72%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '72%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Structuring approach...</div>
                </div>
                
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Gemini 2.5 Pro</span>
                    <span className="vibe-model-card__progress">91%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '91%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Reviewing trade-offs...</div>
                </div>
              </div>

              <p className="vibe-panel__description">
                15+ models compete. Same task, different approaches. 
                Pick the winner or merge them all. Best ideas win, bad ideas die.
              </p>
            </div>

            <div className="vibe-chevron">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="vibe-panel">
              <h2 className="vibe-panel__title">Plan for Claude Code</h2>
              
              <div className="vibe-code-block">
                <pre className="vibe-code-block__content">{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
      <validation>tests</validation>
    </file_operation>
  </step>
  <step>
    <file_operation>
      <path>docs/README.md</path>
    </file_operation>
  </step>
</plan>`}</pre>
              </div>

              <p className="vibe-panel__description">
                Blueprint your agent understands. Copy straight to Claude Code or Cursor.
                Merge multiple approaches into one perfect plan.
              </p>
            </div>
          </div>

          {/* Mobile/Tablet - Responsive Cards */}
          <div className="lg:hidden">
            <div className="flex flex-col items-center">
              {/* Card 1: Find Files */}
              <div className="vibe-panel w-full max-w-md mx-auto">
                <h2 className="vibe-panel__title">Find Files</h2>
                
                <div className="vibe-intent-box">
                  <div className="vibe-intent-box__item">Regex Filter</div>
                  <div className="vibe-intent-box__item">File Content Relevance</div>
                  <div className="vibe-intent-box__item">Dependencies</div>
                </div>

                <p className="vibe-panel__description">
                  AI reads your code, not just names. Finds dependencies you forgot existed.
                  From 1,000 files to the 10 that matter. Results persist - use them forever.
                </p>
              </div>

              {/* Chevron Arrow Down */}
              <div className="vibe-chevron my-6 rotate-90">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M8 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Card 2: Parallel Planning */}
              <div className="vibe-panel vibe-panel--accent vibe-panel--glow w-full max-w-md mx-auto">
                <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
                
                <div className="vibe-models-container">
                  <div className="vibe-model-card">
                    <div className="vibe-model-card__header">
                      <span className="vibe-model-card__name">Claude 4</span>
                      <span className="vibe-model-card__progress">85%</span>
                    </div>
                    <div className="vibe-progress-bar">
                      <div className="vibe-progress-bar__fill" style={{width: '85%'}}></div>
                    </div>
                    <div className="vibe-model-card__status">Analyzing patterns...</div>
                  </div>
                  
                  <div className="vibe-model-card">
                    <div className="vibe-model-card__header">
                      <span className="vibe-model-card__name">GPT-5</span>
                      <span className="vibe-model-card__progress">72%</span>
                    </div>
                    <div className="vibe-progress-bar">
                      <div className="vibe-progress-bar__fill" style={{width: '72%'}}></div>
                    </div>
                    <div className="vibe-model-card__status">Structuring approach...</div>
                  </div>
                  
                  <div className="vibe-model-card">
                    <div className="vibe-model-card__header">
                      <span className="vibe-model-card__name">Gemini 2.5 Pro</span>
                      <span className="vibe-model-card__progress">91%</span>
                    </div>
                    <div className="vibe-progress-bar">
                      <div className="vibe-progress-bar__fill" style={{width: '91%'}}></div>
                    </div>
                    <div className="vibe-model-card__status">Reviewing trade-offs...</div>
                  </div>
                </div>

                <p className="vibe-panel__description">
                  15+ models compete. Same task, different approaches. 
                  Pick the winner or merge them all. Best ideas win, bad ideas die.
                </p>
              </div>

              {/* Chevron Arrow Down */}
              <div className="vibe-chevron my-6 rotate-90">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M8 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Card 3: Plan for Claude Code */}
              <div className="vibe-panel w-full max-w-md mx-auto">
                <h2 className="vibe-panel__title">Plan for Claude Code</h2>
                
                <div className="vibe-code-block">
                  <pre className="vibe-code-block__content">{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
      <validation>tests</validation>
    </file_operation>
  </step>
  <step>
    <file_operation>
      <path>docs/README.md</path>
    </file_operation>
  </step>
</plan>`}</pre>
                </div>

                <p className="vibe-panel__description">
                  Blueprint your agent understands. Copy straight to Claude Code or Cursor.
                  Merge multiple approaches into one perfect plan.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button after panels */}
        <div className="flex justify-center mt-12 mb-16">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button asChild size="xl" variant="cta">
              <Link href="/demo" className="no-hover-effect cursor-pointer">
                Try the interactive demo
              </Link>
            </Button>
          </motion.div>
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