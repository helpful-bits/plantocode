'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useParallax } from 'react-scroll-parallax';

export function HeroSection() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Parallax for title with depth
  const titleLayer = useParallax<HTMLDivElement>({
    translateY: [0, -45],
    translateX: [0, -10],
    scale: [1, 0.96],
    opacity: [1, 0.85],
    easing: 'easeOutQuint',
  });
  
  // Subtitle with different parallax speed for depth
  const subtitleRef = useParallax<HTMLDivElement>({
    translateY: [0, -60],
    opacity: [1, 0.7],
    scale: [1, 0.94],
    easing: 'easeOutQuint',
  });
  
  // Buttons with subtle parallax
  const buttonsRef = useParallax<HTMLDivElement>({
    translateY: [0, -20],
    opacity: [1, 0.9],
    easing: 'easeOutQuint',
  });
  
  // Simple debounce implementation
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };
  
  // Debounced mouse position update
  const updateMousePosition = useCallback(
    debounce((x: number, y: number) => {
      setMousePosition({ x, y });
    }, 16), // ~60fps
    []
  );
  
  // Remove mouse tracking to prevent text shifting
  // The parallax scroll effects are sufficient for depth
  
  return (
    <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Transparent background to show 3D particles */}

      {/* Main content */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Primary heading with parallax */}
        <h1 className="relative text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
          {/* Main layer with depth effect */}
          <div 
            ref={titleLayer.ref}
            className="relative"
          >
            <span className="inline-block transition-all duration-700 delay-100 opacity-100 translate-y-0">
              <span className="text-hero-title">
                AI-Powered Context Curation
              </span>
            </span>
            <br />
            <span 
              className="inline-block transition-all duration-700 delay-300 opacity-100 translate-y-0"
            >
              <span className="text-subtitle-soft">for</span>{' '}
              <span className="text-accent-highlight">
                Large Codebases
              </span>
            </span>
          </div>
        </h1>

        {/* Subtitle with parallax */}
        <div 
          ref={subtitleRef.ref}
          className="relative mb-8 max-w-3xl mx-auto"
        >
          <div className="transition-all duration-700 delay-500 opacity-100 translate-y-0">
            <p className="relative text-lg sm:text-xl text-description-muted leading-relaxed">
              Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase. 
              4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
            </p>
          </div>
        </div>

        {/* Action buttons with subtle parallax */}
        <div 
          ref={buttonsRef.ref}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <div className="transition-all duration-700 delay-700 opacity-100 translate-y-0">
            <Button asChild variant="primary" size="xl">
              <Link href="/download">
                Download Vibe Manager Free
              </Link>
            </Button>
          </div>
          
          <div className="transition-all duration-700 delay-800 opacity-100 translate-y-0">
            <Button asChild variant="gradient-outline" size="lg">
              <Link href="#features">
                Learn More
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Scroll indicator with subtle parallax */}
      <div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 transition-all duration-700 delay-1000 opacity-100"
      >
        <div className="animate-bounce p-2 rounded-full glass-subtle">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
}