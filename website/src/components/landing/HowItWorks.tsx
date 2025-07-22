"use client";

import React, { useEffect, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import Image from 'next/image';
import { useTheme } from 'next-themes';

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

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded) {
            setIsLoaded(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(videoElement);

    return () => {
      observer.disconnect();
    };
  }, [isLoaded]);

  return (
    <video
      ref={videoRef}
      className="w-full aspect-video relative z-10"
      controls
      poster={poster}
      preload="metadata"
      playsInline
      muted
      loop
      style={{ width: '100%', height: 'auto' }}
    >
      {isLoaded && (
        <>
          <source src={video.replace('.mp4', '.webm')} type="video/webm" />
          <source src={video} type="video/mp4" />
        </>
      )}
      Your browser does not support the video tag.
    </video>
  );
}

export function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  return (
    <section id="how-it-works" className="relative py-16 px-4 overflow-hidden">
      {/* Theme-based background images */}
      {mounted && (
        <Image
          src={resolvedTheme === 'dark' ? '/images/features-background-dark.png' : '/images/features-background.png'}
          alt="Section background"
          fill
          quality={100}
          className="object-cover object-top z-0"
        />
      )}
      {/* Gradient overlay for better text contrast and smooth transition */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/90 via-background/50 to-background/90 dark:from-background/95 dark:via-background/70 dark:to-background/95" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent dark:from-background/90" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/10 to-transparent backdrop-blur-sm" />
      
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-teal-900 dark:text-white">How It Works</h2>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-teal-950 dark:text-gray-100">
            From task description to implementation plan in minutes
          </p>
        </div>
        
        <div className="space-y-12">
          {steps.map((step, index) => (
            <GlassCard key={index}>
                <div className="p-8">
                  {/* Header with step number and title */}
                  <div className="mb-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 dark:from-emerald-400/10 dark:to-emerald-500/20 ring-1 ring-emerald-500/30 dark:ring-emerald-400/20 rounded-full flex items-center justify-center font-bold text-xl text-emerald-700 dark:text-emerald-400 shadow-lg">
                        {index + 1}
                      </div>
                      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                    </div>
                    <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-200 max-w-3xl">
                      {step.description}
                    </p>
                  </div>
                  
                  {/* Video taking full width */}
                  <div className="relative group">
                    {/* Video glow effect */}
                    <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative rounded-xl overflow-hidden shadow-2xl">
                      <OptimizedVideo video={step.video} poster={step.poster} />
                    </div>
                  </div>
                </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}