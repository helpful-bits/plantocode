'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion, useInView } from 'framer-motion';

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
  const inView = useInView(videoRef, { once: true, margin: '100px' });

  useEffect(() => {
    if (inView && videoRef.current) {
      videoRef.current.load();
    }
  }, [inView]);

  return (
    <motion.div
      animate={{ opacity: inView ? 1 : 0.8, transform: 'translateZ(0)' }}
      className="relative w-full"
      initial={{ opacity: 0, transform: 'translateZ(0)' }}
      style={{
        transform: 'translateZ(0)',
        willChange: inView ? 'auto' : 'opacity, transform',
      }}
      transition={{
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      <video
        ref={videoRef}
        controls
        loop
        muted
        playsInline
        className="w-full aspect-video relative z-10 rounded-lg"
        poster={poster}
        preload="none"
        style={{
          width: '100%',
          height: 'auto',
          transform: 'translateZ(0)',
        }}
        onError={() => setLoadError(true)}
      >
        <source src={video.replace('.mp4', '.webm')} type="video/webm" />
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
    </motion.div>
  );
}

export function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const containerVariants = {
    hidden: {
      opacity: 0,
      transform: 'translate3d(0, 0, 0)',
    },
    visible: {
      opacity: 1,
      transform: 'translate3d(0, 0, 0)',
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.05,
        ease: [0.4, 0, 0.2, 1],
        duration: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 15,
      scale: 0.99,
      transform: 'translate3d(0, 0, 0)',
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transform: 'translate3d(0, 0, 0)',
      transition: {
        type: 'tween',
        duration: 0.35,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  };

  return (
    <section className="relative py-20 px-4 overflow-hidden" id="how-it-works">

      <div className="container mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20, scale: 0.97, transform: 'translate3d(0, 0, 0)' }}
          style={{
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform, opacity',
          }}
          transition={{
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1],
          }}
          viewport={{ once: true, margin: '-20px' }}
          whileInView={{ opacity: 1, y: 0, scale: 1, transform: 'translate3d(0, 0, 0)' }}
        >
          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            How It Works
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1 }}
          >
            From task description to implementation plan in minutes
          </motion.p>
        </motion.div>

        <motion.div
          className="space-y-16 max-w-5xl mx-auto"
          initial="hidden"
          variants={containerVariants}
          viewport={{ once: true, margin: '-100px' }}
          whileInView="visible"
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              style={{
                transform: 'translate3d(0, 0, 0)',
                willChange: 'transform',
              }}
              variants={itemVariants}
              whileHover={{
                scale: 1.008,
                y: -2,
                transition: {
                  duration: 0.12,
                  ease: [0.4, 0, 0.2, 1],
                },
              }}
            >
              <GlassCard className="overflow-hidden">
                <div className="p-8 sm:p-10 lg:p-12">
                  <motion.div
                    className="mb-8"
                    initial={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    viewport={{ once: true }}
                    whileInView={{ opacity: 1, x: 0 }}
                  >
                    <div className="flex items-center gap-6 mb-6">
                      <motion.div
                        className="relative"
                        style={{
                          transform: 'translate3d(0, 0, 0)',
                          willChange: 'transform',
                        }}
                        whileHover={{
                          scale: 1.08,
                          transition: {
                            duration: 0.15,
                            ease: [0.4, 0, 0.2, 1],
                          },
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/60 rounded-full blur-xl opacity-60" />
                        <div className="relative w-14 h-14 bg-gradient-to-br from-primary/30 to-primary/50 ring-2 ring-primary/40 rounded-full flex items-center justify-center font-bold text-2xl text-primary-foreground shadow-xl">
                          {index + 1}
                        </div>
                      </motion.div>
                      <h3 className="text-2xl sm:text-3xl font-bold text-foreground">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-lg leading-relaxed text-foreground/80 max-w-3xl pl-20">
                      {step.description}
                    </p>
                  </motion.div>

                  <motion.div
                    className="relative group"
                    initial={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.8, delay: 0.2 + index * 0.1 }}
                    viewport={{ once: true }}
                    whileInView={{ opacity: 1, y: 0 }}
                  >
                    <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ transform: 'translate3d(0, 0, 0)' }} />
                    <div className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-primary/10 group-hover:ring-primary/20 transition-all duration-500">
                      <OptimizedVideo poster={step.poster} video={step.video} />
                    </div>
                  </motion.div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}