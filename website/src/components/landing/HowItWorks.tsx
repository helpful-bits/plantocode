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
        className="w-full aspect-video relative z-10 rounded-lg bg-background/10"
        poster={posterError ? undefined : poster}
        preload="none"
        onError={() => setLoadError(true)}
      >
        <source src={video} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-background/50 to-background/30 rounded-lg">
          <div className="bg-background/80 px-4 py-2 rounded-lg text-sm text-muted-foreground">
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
        <div className="text-center mb-16">
          <Reveal as="h2" className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold">
            How It Works
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80" delay={0.05}>
            From task description to implementation plan in minutes
          </Reveal>
        </div>

        <div className="space-y-16 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <Reveal
              key={index}
              className="how-it-works-step group"
              delay={0.1 + index * 0.05}
            >
              <GlassCard className="overflow-hidden">
                <div className="p-8 sm:p-10 lg:p-12">
                  <div className="mb-8">
                    <div className="flex items-center gap-6 mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/60 rounded-full blur-xl opacity-60" />
                        <div className="relative w-14 h-14 bg-gradient-to-br from-primary/30 to-primary/50 ring-2 ring-primary/40 rounded-full flex items-center justify-center font-bold text-2xl text-primary-foreground shadow-xl">
                          {index + 1}
                        </div>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-bold text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-lg leading-relaxed text-foreground/80 max-w-3xl pl-20">
                      {step.description}
                    </p>
                  </div>

                  <Reveal className="relative group" delay={0.15 + index * 0.05}>
                    <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-primary/10 group-hover:ring-primary/20">
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