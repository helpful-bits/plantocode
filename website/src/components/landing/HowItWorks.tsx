'use client';

import React, { useEffect, useState, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import Reveal from '@/components/motion/Reveal';

interface SubStep {
  title: string;
  video: string;
  poster: string;
}

interface Step {
  title: string;
  description: string;
  video?: string;
  poster?: string;
  subSteps?: SubStep[];
}

interface HowItWorksProps {
  steps?: Step[];
}

const defaultSteps: Step[] = [];

function OptimizedVideo({ video, poster }: { video: string; poster: string }) {
  const [loadError, setLoadError] = useState(false);
  const [posterError, setPosterError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onerror = () => setPosterError(true);
    img.src = poster;
  }, [poster]);


  const webmVideo = video.replace('.mp4', '_vp9.webm');

  return (
    <div className="w-full max-w-full overflow-hidden">
      <video
        ref={videoRef}
        controls
        controlsList="nodownload"
        muted
        playsInline
        className="block object-contain bg-gradient-to-br from-background/5 to-background/10 w-full"
        poster={posterError ? undefined : poster}
        preload="metadata"
        onError={() => setLoadError(true)}
        style={{
          aspectRatio: '16/9'
        }}
        {...({ allowFullScreen: true } as any)}
      >
        <source src={webmVideo} type="video/webm; codecs=vp9" />
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
              <div className="relative overflow-visible">
                {/* Text Content in Glass Card - Full Width on Mobile */}
                <GlassCard className="overflow-visible rounded-t-2xl rounded-b-none sm:rounded-2xl">
                  <div className="p-4 sm:p-6 md:p-8 lg:p-10">
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
                </GlassCard>

                {/* Videos - Break Out Completely */}
                <Reveal 
                  className="relative -mt-2.5 bg-gradient-to-br from-card/95 via-card/98 to-card backdrop-blur-sm" 
                  delay={0.15 + index * 0.05}
                >
                  {step.subSteps ? (
                    <div className="space-y-0">
                      {step.subSteps.map((subStep, subIndex) => (
                        <div key={subIndex} className="relative">
                          {/* Subtitle Header - Full Width */}
                          <div className="bg-background/95 backdrop-blur border-t border-primary/10 py-3 px-4 sm:px-6 md:px-8 lg:px-10">
                            <h4 className="text-base sm:text-lg font-semibold text-foreground max-w-5xl mx-auto">
                              {subStep.title}
                            </h4>
                          </div>
                          {/* Video - Absolute Full Width */}
                          <OptimizedVideo poster={subStep.poster} video={subStep.video} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <OptimizedVideo poster={step.poster!} video={step.video!} />
                  )}
                </Reveal>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}