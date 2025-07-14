'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ParticleCanvasWrapper } from '@/components/ParticleCanvasWrapper';

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [touchPosition, setTouchPosition] = useState({ x: 50, y: 50 });
  const [isMobile, setIsMobile] = useState(false);
  const { theme } = useTheme();
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 768);
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        if (touch) {
          const x = ((touch.clientX - rect.left) / rect.width) * 100;
          const y = ((touch.clientY - rect.top) / rect.height) * 100;
          setTouchPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current && window.innerWidth >= 768) {
        const rect = heroRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setTouchPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (!mounted) {
    return (
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <ParticleCanvasWrapper />
        <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            AI-Powered Context Curation for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              Large Codebases
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase. 
            4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
          </p>
        </div>
      </section>
    );
  }

  const parallaxOffset = scrollY * 0.5;

  return (
    <section 
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ 
        transform: `translateY(${parallaxOffset}px)`,
        willChange: 'transform'
      }}
    >
      {/* Layered gradient backgrounds with OKLCH */}
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0 opacity-80"
          style={{
            background: theme === 'dark' 
              ? `linear-gradient(135deg, 
                  oklch(0.15 0.02 206) 0%, 
                  oklch(0.18 0.02 206) 25%, 
                  oklch(0.20 0.03 195) 50%, 
                  oklch(0.22 0.04 195) 75%, 
                  oklch(0.18 0.02 206) 100%)`
              : `linear-gradient(135deg, 
                  oklch(0.99 0.005 195) 0%, 
                  oklch(1 0 0) 30%, 
                  oklch(0.985 0.01 195) 70%, 
                  oklch(0.99 0.005 195) 100%)`
          }}
        />
        <div 
          className="absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(circle at 30% 40%, 
              oklch(0.52 0.09 195 / 0.15) 0%, 
              transparent 50%),
            radial-gradient(circle at 70% 80%, 
              oklch(0.65 0.08 195 / 0.1) 0%, 
              transparent 50%)`
          }}
        />
      </div>

      <ParticleCanvasWrapper />
      
      {/* Glass morphism overlay */}
      <div 
        className="absolute inset-0 z-5"
        style={{
          background: theme === 'dark' 
            ? `linear-gradient(135deg, 
                transparent 0%, 
                oklch(0.15 0.02 206 / 0.1) 50%, 
                transparent 100%)`
            : `linear-gradient(135deg, 
                transparent 0%, 
                oklch(1 0 0 / 0.1) 50%, 
                transparent 100%)`,
          backdropFilter: isMobile ? 'blur(0.3px)' : 'blur(0.5px)',
        }}
      />

      {/* Main content with parallax text animations */}
      <div 
        className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto"
        style={{
          transform: `translateY(${scrollY * 0.2}px)`,
          willChange: 'transform'
        }}
      >
        {/* Primary heading with staggered reveal */}
        <h1 
          className="text-hero mb-6 leading-tight"
          style={{
            background: theme === 'dark'
              ? `linear-gradient(135deg, 
                  oklch(0.9 0 0) 0%, 
                  oklch(0.85 0 0) 25%,
                  oklch(0.65 0.08 195) 50%, 
                  oklch(0.85 0 0) 75%,
                  oklch(0.9 0 0) 100%)`
              : `linear-gradient(135deg, 
                  oklch(0.15 0 0) 0%, 
                  oklch(0.52 0.09 195) 50%, 
                  oklch(0.15 0 0) 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          <span 
            className="inline-block transition-all duration-700 delay-100"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(20px)'
            }}
          >
            AI-Powered Context Curation
          </span>
          <br />
          <span 
            className="inline-block transition-all duration-700 delay-300"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(20px)'
            }}
          >
            for{' '}
            <span 
              className="relative inline-block"
              style={{
                background: theme === 'dark'
                  ? `linear-gradient(135deg, 
                      oklch(0.65 0.08 195) 0%, 
                      oklch(0.7 0.1 195) 50%, 
                      oklch(0.65 0.08 195) 100%)`
                  : `linear-gradient(135deg, 
                      oklch(0.52 0.09 195) 0%, 
                      oklch(0.45 0.08 195) 50%, 
                      oklch(0.52 0.09 195) 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Large Codebases
            </span>
          </span>
        </h1>

        {/* Subtitle with delayed reveal */}
        <p 
          className="text-subhero mb-8 max-w-3xl mx-auto transition-all duration-700 delay-500"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            color: theme === 'dark' 
              ? 'oklch(0.62 0 0)' 
              : 'oklch(0.4 0 0)'
          }}
        >
          Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase. 
          4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
        </p>

        {/* Action buttons with glass effects */}
        <div 
          className="flex flex-col sm:flex-row gap-4 justify-center items-center transition-all duration-700 delay-700"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)'
          }}
        >
          <Link
            href="/download"
            className="group relative px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95"
            style={{
              background: theme === 'dark'
                ? `linear-gradient(135deg, 
                    oklch(0.65 0.08 195) 0%, 
                    oklch(0.6 0.07 195) 50%, 
                    oklch(0.65 0.08 195) 100%)`
                : `linear-gradient(135deg, 
                    oklch(0.52 0.09 195) 0%, 
                    oklch(0.48 0.08 195) 50%, 
                    oklch(0.52 0.09 195) 100%)`,
              color: theme === 'dark' 
                ? 'oklch(0.12 0.02 206)' 
                : 'oklch(0.98 0 0)',
              boxShadow: theme === 'dark'
                ? `0 4px 20px oklch(0.65 0.08 195 / 0.3), 
                   0 8px 40px oklch(0.65 0.08 195 / 0.2)`
                : `0 4px 20px oklch(0.52 0.09 195 / 0.3), 
                   0 8px 40px oklch(0.52 0.09 195 / 0.2)`,
              backdropFilter: 'blur(8px)',
              border: `1px solid oklch(0.65 0.08 195 / 0.3)`
            }}
          >
            <span className="relative z-10">Download Vibe Manager Free</span>
            <div 
              className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: theme === 'dark'
                  ? `linear-gradient(135deg, 
                      oklch(0.7 0.1 195) 0%, 
                      oklch(0.65 0.08 195) 100%)`
                  : `linear-gradient(135deg, 
                      oklch(0.55 0.1 195) 0%, 
                      oklch(0.5 0.08 195) 100%)`
              }}
            />
          </Link>
          
          <Link
            href="#features"
            className="group relative px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 active:scale-95"
            style={{
              background: theme === 'dark'
                ? `linear-gradient(135deg, 
                    oklch(0.22 0.02 206 / 0.8) 0%, 
                    oklch(0.18 0.02 206 / 0.9) 100%)`
                : `linear-gradient(135deg, 
                    oklch(1 0 0 / 0.8) 0%, 
                    oklch(0.99 0.005 195 / 0.9) 100%)`,
              color: theme === 'dark' 
                ? 'oklch(0.85 0 0)' 
                : 'oklch(0.4 0 0)',
              backdropFilter: 'blur(12px)',
              border: theme === 'dark'
                ? `1px solid oklch(0.34 0.02 206 / 0.5)`
                : `1px solid oklch(0.92 0 0 / 0.5)`
            }}
          >
            <span className="relative z-10">Learn More</span>
            <div 
              className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: theme === 'dark'
                  ? `linear-gradient(135deg, 
                      oklch(0.28 0.02 206 / 0.9) 0%, 
                      oklch(0.24 0.02 206 / 0.9) 100%)`
                  : `linear-gradient(135deg, 
                      oklch(0.97 0.01 195 / 0.9) 0%, 
                      oklch(0.985 0.01 195 / 0.9) 100%)`
              }}
            />
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 transition-all duration-700 delay-1000"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(20px)'
        }}
      >
        <div 
          className="animate-bounce p-2 rounded-full"
          style={{
            background: theme === 'dark'
              ? `linear-gradient(135deg, 
                  oklch(0.22 0.02 206 / 0.6) 0%, 
                  oklch(0.18 0.02 206 / 0.8) 100%)`
              : `linear-gradient(135deg, 
                  oklch(1 0 0 / 0.6) 0%, 
                  oklch(0.99 0.005 195 / 0.8) 100%)`,
            backdropFilter: 'blur(8px)',
            border: theme === 'dark'
              ? `1px solid oklch(0.34 0.02 206 / 0.4)`
              : `1px solid oklch(0.92 0 0 / 0.4)`
          }}
        >
          <svg 
            className="w-6 h-6" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            style={{
              color: theme === 'dark' 
                ? 'oklch(0.62 0 0)' 
                : 'oklch(0.4 0 0)'
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      {/* Interactive touch/mouse overlay */}
      <div 
        className="absolute inset-0 z-20 pointer-events-none transition-all duration-300"
        style={{
          background: `radial-gradient(circle at ${touchPosition.x}% ${touchPosition.y}%, 
            oklch(0.65 0.08 195 / 0.08) 0%, 
            oklch(0.65 0.08 195 / 0.02) 20%,
            transparent 40%)`,
          opacity: mounted ? 1 : 0
        }}
      />
    </section>
  );
}