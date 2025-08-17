'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useInView } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';

interface Step {
  title: string;
  description: string;
  video: string;
  poster: string;
}

interface HowItWorksProps {
  steps?: Step[];
}

const defaultSteps: Step[] = [];

function OptimizedVideo({ video, poster }: { video: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadError, setLoadError] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const inView = useInView(videoRef, { margin: '100px' });

  useEffect(() => {
    if (videoRef.current) {
      if (inView) {
        videoRef.current.play().catch(() => {
          // Autoplay was prevented.
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [inView]);

  // Preload poster image to check if it's accessible
  useEffect(() => {
    const img = new Image();
    img.onerror = () => setPosterError(true);
    img.src = poster;
  }, [poster]);

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        loop
        muted
        playsInline
        controls={false}
        className="w-full aspect-video relative z-10 block bg-gradient-to-br from-background/5 to-background/10"
        poster={posterError ? undefined : poster}
        preload="none"
        onError={() => setLoadError(true)}
      >
        <source src={video} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-background/80 to-background/60 backdrop-blur-sm">
          <div className="bg-background/90 backdrop-blur px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-sm text-muted-foreground font-medium shadow-lg ring-1 ring-primary/10">
            Video will be available soon
          </div>
        </div>
      )}
    </div>
  );
}

export function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="how-it-works">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 sm:mb-6 text-primary-emphasis font-bold">
            How It Works
          </Reveal>
          <Reveal as="p" className="text-base sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 px-4 sm:px-0" delay={0.05}>
            From task description to implementation plan in minutes
          </Reveal>
        </div>

        <div className="space-y-8 sm:space-y-12 md:space-y-16 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <Reveal
              key={index}
              className="how-it-works-step group"
              delay={0.1 + index * 0.05}
            >
              <GlassCard className="overflow-hidden">
                <div className="p-6 sm:p-8 md:p-10 lg:p-12">
                  <div className="mb-6 sm:mb-8">
                    <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <span className="flex-shrink-0 text-3xl sm:text-4xl md:text-5xl font-bold text-primary/30 leading-none">
                        {index + 1}
                      </span>
                      <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground leading-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm sm:text-base md:text-lg leading-relaxed text-foreground/80 max-w-3xl">
                      {step.description}
                    </p>
                  </div>

                  <Reveal className="relative group" delay={0.15 + index * 0.05}>
                    <div className="relative -mx-6 sm:-mx-8 md:-mx-10 lg:-mx-12 mt-6 sm:mt-8 md:mt-10 overflow-hidden">
                      <OptimizedVideo poster={step.poster} video={step.video} />
                    </div>
                  </Reveal>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}