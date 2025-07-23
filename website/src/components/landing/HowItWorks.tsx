"use client";

import React, { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';

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
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            if (!isLoaded) {
              setIsLoaded(true);
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    observer.observe(videoElement);

    return () => {
      observer.disconnect();
    };
  }, [isLoaded]);

  useEffect(() => {
    if (isLoaded && videoRef.current) {
      videoRef.current.load();
    }
  }, [isLoaded]);

  return (
    <motion.div
      initial={{ opacity: 0, transform: 'translateZ(0)' }}
      animate={{ opacity: isInView ? 1 : 0, transform: 'translateZ(0)' }}
      transition={{ 
        duration: 0.4, 
        ease: [0.4, 0, 0.2, 1],
        willChange: 'opacity'
      }}
      className="relative w-full"
      style={{ transform: 'translateZ(0)' }}
    >
      <video
        ref={videoRef}
        className="w-full aspect-video relative z-10 rounded-lg"
        controls
        poster={poster}
        preload="none"
        playsInline
        muted
        loop
        onError={() => setLoadError(true)}
        style={{ width: '100%', height: 'auto' }}
      >
        {isLoaded && !loadError && (
          <>
            <source src={video.replace('.mp4', '.webm')} type="video/webm" />
            <source src={video} type="video/mp4" />
          </>
        )}
        Your browser does not support the video tag.
      </video>
      {isLoaded && !isInView && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent rounded-lg" />
      )}
    </motion.div>
  );
}

export function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const containerVariants = {
    hidden: { 
      opacity: 0,
      transform: 'translateZ(0)' // GPU acceleration
    },
    visible: {
      opacity: 1,
      transform: 'translateZ(0)', // GPU acceleration
      transition: {
        staggerChildren: 0.2,  // Optimized stagger timing
        delayChildren: 0.05,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  };

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,  // Further reduced distance
      scale: 0.98,
      transform: 'translateZ(0)' // GPU acceleration
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transform: 'translateZ(0)', // GPU acceleration
      transition: {
        type: "tween",
        duration: 0.4, // Faster animation
        ease: [0.4, 0, 0.2, 1], // Optimized easing
        willChange: 'transform, opacity'
      }
    }
  };
  
  return (
    <section id="how-it-works" className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 z-1 bg-transparent dark:bg-gradient-to-b dark:from-background/95 dark:via-background/70 dark:to-background/95" />
      
      <motion.div 
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
      >
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </motion.div>
      
      <div className="container mx-auto relative z-10">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20, scale: 0.97, transform: 'translateZ(0)' }}
          whileInView={{ opacity: 1, y: 0, scale: 1, transform: 'translateZ(0)' }}
          transition={{ 
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1],
            willChange: 'transform, opacity'
          }}
          viewport={{ once: true, margin: "-20px" }}
          style={{ transform: 'translateZ(0)' }}
        >
          <motion.h2 
            className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>
          <motion.p 
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            From task description to implementation plan in minutes
          </motion.p>
        </motion.div>
        
        <motion.div 
          className="space-y-16 max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ 
                scale: 1.01, 
                y: -3,
                transition: { 
                  duration: 0.15, 
                  ease: [0.4, 0, 0.2, 1],
                  willChange: 'transform' 
                }
              }}
              style={{ transform: 'translateZ(0)' }}
            >
              <GlassCard className="overflow-hidden">
                <div className="p-8 sm:p-10 lg:p-12">
                  <motion.div 
                    className="mb-8"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <div className="flex items-center gap-6 mb-6">
                      <motion.div 
                        className="relative"
                        whileHover={{ 
                          scale: 1.1,
                          transition: { 
                            duration: 0.2, 
                            ease: [0.4, 0, 0.2, 1],
                            willChange: 'transform'
                          }
                        }}
                        style={{ transform: 'translateZ(0)' }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/60 rounded-full blur-xl opacity-60" />
                        <div className="relative w-14 h-14 bg-gradient-to-br from-primary/30 to-primary/50 ring-2 ring-primary/40 rounded-full flex items-center justify-center font-bold text-2xl text-primary-foreground shadow-xl">
                          {index + 1}
                        </div>
                      </motion.div>
                      <h3 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-lg leading-relaxed text-muted-foreground max-w-3xl pl-20">
                      {step.description}
                    </p>
                  </motion.div>
                  
                  <motion.div 
                    className="relative group"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 + index * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-700" />
                    <div className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-primary/10 group-hover:ring-primary/20 transition-all duration-500">
                      <OptimizedVideo video={step.video} poster={step.poster} />
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