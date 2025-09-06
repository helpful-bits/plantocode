'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { track } from '@/lib/track';
import { cdnUrl } from '@/lib/cdn';

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  
  useEffect(() => {
    // Check if window is available (client-side)
    if (typeof window !== 'undefined') {
      // Initial check
      const checkMobile = () => window.innerWidth < 640; // sm breakpoint is 640px in Tailwind
      setIsMobile(checkMobile());
      
      // Update on resize
      const handleResize = () => {
        setIsMobile(checkMobile());
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
  const handleVideoClick = () => {
    setShowControls(!showControls);
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    // Track download click on client-side to preserve user context
    await track({ 
      event: 'download_click', 
      props: { 
        location: 'hero_section',
        platform: 'mac',
        version: 'latest'
      } 
    });
    // Redirect to download endpoint
    window.location.href = '/api/download/mac?source=hero_section';
  };
  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading positioned above the video */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-4 sm:pb-6 w-full">
        <h1 
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent" 
          style={{ 
            contentVisibility: 'auto',
            backgroundImage: 'linear-gradient(135deg, var(--color-adaptive-primary), var(--color-adaptive-accent), var(--teal-bright))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          From idea to <span className="solid-highlight">solid</span> plan. <span className="fast-velocity">
            <span className="fast-letter" style={{ animationDelay: '0ms' }}>F</span>
            <span className="fast-letter" style={{ animationDelay: '50ms' }}>a</span>
            <span className="fast-letter" style={{ animationDelay: '100ms' }}>s</span>
            <span className="fast-letter" style={{ animationDelay: '150ms' }}>t</span>
            <span className="fast-dot">.</span>
          </span>
        </h1>
      </div>

      {/* Video Container - responsive with different videos for different screen sizes */}
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        {/* Render only the appropriate video based on screen size */}
        {isMobile === null ? (
          // During SSR or initial load, show a placeholder to prevent layout shift
          <div className="max-w-6xl mx-auto aspect-video sm:aspect-video aspect-[9/16] sm:aspect-[16/9]" />
        ) : isMobile ? (
          // Mobile Video - Portrait aspect ratio
          <div className="max-w-md mx-auto">
            <video
              ref={videoRef}
              className="w-full h-auto object-cover cursor-pointer rounded-lg shadow-2xl"
              autoPlay
              loop
              muted
              playsInline
              controls={showControls}
              onClick={handleVideoClick}
            >
              {/* VP9 WebM for better compression and quality - primary source */}
              <source src={cdnUrl('/assets/videos/hero-section_vp9.webm')} type="video/webm; codecs=vp9" />
              {/* H.264 MP4 fallback for broader compatibility */}
              <source src={cdnUrl('/assets/videos/hero-section.mp4')} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        ) : (
          // Desktop/Tablet Video - 16:9 aspect ratio
          <div className="max-w-6xl mx-auto">
            <video
              ref={videoRef}
              className="w-full h-auto object-cover cursor-pointer rounded-lg shadow-2xl"
              autoPlay
              loop
              muted
              playsInline
              controls={showControls}
              onClick={handleVideoClick}
            >
              {/* VP9 WebM for better compression and quality - primary source */}
              <source src={cdnUrl('/assets/videos/hero-section-16by9_vp9.webm')} type="video/webm; codecs=vp9" />
              {/* H.264 MP4 fallback for broader compatibility */}
              <source src={cdnUrl('/assets/videos/hero-section-16by9.mp4')} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
      </div>

      {/* Previous hero content now below the video */}
      <div className="relative text-center px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto mt-12">
        {/* Subtitle */}
        <p className="text-xl sm:text-2xl md:text-3xl text-description-muted mb-8 leading-relaxed max-w-4xl mx-auto">
          Tell it what you want to build. Type it out, describe it 10x faster with voice, or capture bugs instantly on screen. AI finds the right files, generates plans with multiple models, and gives you a blueprint your coding agent can actually use.
        </p>

        {/* Product Hunt Badge */}
        <div className="flex justify-center mb-8">
          <a 
            href="https://www.producthunt.com/products/vibe-manager?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-vibe-manager" 
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-90 transition-opacity"
          >
            <img 
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1009288&theme=light&t=1756883029716" 
              alt="Vibe Manager - Context control for AI coding sessions | Product Hunt" 
              width="250" 
              height="54"
              className="dark:brightness-90 dark:contrast-110"
            />
          </a>
        </div>

        {/* Story - Hidden by default, expandable */}
        <div className="max-w-3xl mx-auto mb-8">
          <details className="group">
            <summary className="cursor-pointer list-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl">
              <div className="relative overflow-hidden rounded-2xl bg-background/60 backdrop-blur-md border border-border/40 hover:border-border/60 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 group-hover:bg-background/80">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.02] via-transparent to-primary/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative px-6 py-4 flex items-center justify-center gap-3">
                  <span className="text-base font-medium text-foreground/90 group-hover:text-foreground transition-colors duration-200">
                    The story behind Vibe Manager
                  </span>
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-all duration-200 group-open:rotate-180">
                    <svg className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors duration-200" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
              </div>
            </summary>
            <div className="mt-6 relative">
              <div className="rounded-2xl bg-background/40 backdrop-blur-sm border border-border/30 p-6 space-y-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/[0.01] to-transparent" />
                <div className="relative space-y-4 text-description-muted leading-relaxed">
                  <p>
                    You know the feeling. You're "vibe coding" with an AI agent - the ideas are flowing, it's magical... until it's not. 
                    The agent gets hopelessly lost in your codebase, starts ignoring instructions, hallucinates APIs.
                  </p>
                  <p className="text-foreground font-bold">
                    That magic moment is gone. Now you're a babysitter writing novels of documentation.
                  </p>
                  <p>
                    Here's the thing: your code IS the documentation. But AI has limited context. It wastes time searching through 
                    irrelevant files, missing the crucial ones, or trying to understand everything at once.
                  </p>
                  <p className="font-medium text-foreground/90">
                    Vibe Manager was born from hitting that wall. Hard. Agents don't need more rules - they need the right files, 
                    real context, and clear tasks.
                  </p>
                </div>
              </div>
            </div>
          </details>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
                <Button className="relative overflow-hidden" size="xl" variant="cta" onClick={handleDownloadClick}>
                  <span className="no-hover-effect cursor-pointer">
                    Download for Mac
                  </span>
                </Button>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
                <Button asChild size="lg" variant="gradient-outline">
                  <Link href="/demo" className="no-hover-effect cursor-pointer">
                    Try the interactive demo
                  </Link>
                </Button>
            </motion.div>
          </div>
          <div className="flex flex-col items-center gap-2 mt-2">
            <em className="text-xs text-muted-foreground">
              <a className="hover:text-primary" target="_blank" rel="noreferrer noopener" href="https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web">
                Signed & notarized for macOS - safer installs via Gatekeeper.
              </a>
            </em>
            <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-sm text-muted-foreground hover:text-primary transition-colors">Join the Windows waitlist</a>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="mt-8 sm:mt-12 mb-8">
          <div className="flex flex-wrap gap-x-2 gap-y-2 justify-center items-center text-sm text-muted-foreground">
            <Link href="/local-first" className="px-2 py-1 hover:text-primary transition-colors">Local-first</Link>
            <span className="select-none text-primary/50" aria-hidden="true">•</span>
            <Link href="/security/notarization" className="px-2 py-1 hover:text-primary transition-colors">Apple-notarized</Link>
            <span className="select-none text-primary/50" aria-hidden="true">•</span>
            <Link href="#pricing" className="px-2 py-1 hover:text-primary transition-colors">Free credits</Link>
            <span className="select-none text-primary/50" aria-hidden="true">•</span>
            <Link href="/changelog" className="px-2 py-1 hover:text-primary transition-colors">Changelog</Link>
          </div>
        </div>
      </div>

    </section>
  );
}