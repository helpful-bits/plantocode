"use client";

import { useEffect, useRef, useState } from 'react';
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
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="how-it-works" className="relative py-16 px-4 overflow-hidden">
      {/* Background image - changes based on resolvedTheme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="How it works section background"
        fill
        quality={100}
        className="object-cover object-bottom z-0"
      />
      
      {/* Gradient overlay for better text contrast and smooth transition */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background via-transparent to-background/80" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/5 to-background/20 backdrop-blur-[2px]" />
      
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 ${
            resolvedTheme === 'dark' ? "text-white" : "text-teal-900"
          }`}>How It Works</h2>
          <p className={`text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium ${
            resolvedTheme === 'dark' ? 'text-gray-100' : 'text-teal-950'
          }`}
            style={{
              textShadow: resolvedTheme === 'dark' 
                ? `0 0 20px rgba(94, 234, 212, 0.3),
                   0 0 40px rgba(94, 234, 212, 0.2),
                   0 2px 8px rgba(0, 0, 0, 0.4)`
                : `0 0 30px rgba(255, 255, 135, 0.6),
                   0 0 50px rgba(154, 255, 154, 0.4),
                   0 2px 8px rgba(255, 255, 200, 0.7)`
            }}
          >
            From task description to implementation plan in minutes
          </p>
        </div>
        
        <div className="space-y-12">
          {steps.map((step, index) => (
            <div key={index} className="relative group">
              <div className="relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                {/* Solid base layer for consistent readability */}
                <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl backdrop-saturate-150" />
                
                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 via-transparent to-transparent opacity-50" />
                
                {/* Very subtle emerald tint */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald-500/5" />
                
                {/* Glass shine effect */}
                <div className="absolute inset-[1px] bg-gradient-to-br from-white/30 dark:from-white/10 via-transparent to-transparent rounded-[22px] opacity-30" />
                
                {/* Shimmer on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-700" />
                
                {/* Subtle edge highlights */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent" />
                
                {/* Clean border */}
                <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 dark:ring-white/10" />

                <div className="relative p-8">
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}