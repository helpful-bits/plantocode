'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion, useInView } from 'framer-motion';
import { variants } from '@/lib/animations';

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

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        loop
        muted
        playsInline
        controls={false}
        className="w-full aspect-video relative z-10 rounded-lg"
        poster={poster}
        preload="none"
        onError={() => setLoadError(true)}
      >
        <source src={video} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {loadError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-cover bg-center bg-no-repeat rounded-lg"
          style={{ backgroundImage: `url(${poster})` }}
        >
          <div className="bg-background/80 px-4 py-2 rounded-lg text-sm text-muted-foreground">
            Unable to load video
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
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          whileInView="visible"
          variants={variants.section}
          viewport={{ once: true, amount: 0.5 }}
        >
          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold"
            variants={variants.item}
          >
            How It Works
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80"
            variants={variants.item}
          >
            From task description to implementation plan in minutes
          </motion.p>
        </motion.div>

        <motion.div
          className="space-y-16 max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          variants={variants.section}
          viewport={{ once: true, amount: 0.1 }}
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              className="how-it-works-step group"
              variants={variants.item}
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

                  <div className="relative group">
                    <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-primary/10 group-hover:ring-primary/20">
                      <OptimizedVideo poster={step.poster} video={step.video} />
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}