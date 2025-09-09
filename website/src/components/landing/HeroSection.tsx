'use client';

import React, { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { track } from '@/lib/track';
import { cdnUrl } from '@/lib/cdn';
import { Play, X } from 'lucide-react';
import { useTheme } from 'next-themes';

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const checkMobile = () => window.innerWidth < 640;
      const checkDesktop = () => window.innerWidth >= 1024; // lg breakpoint
      setIsMobile(checkMobile());
      setIsDesktop(checkDesktop());
      
      const handleResize = () => {
        setIsMobile(checkMobile());
        setIsDesktop(checkDesktop());
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  
  const handlePlayVideo = () => {
    setShowVideoModal(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play();
      }
    }, 100);
    track({ 
      event: 'hero_video_play', 
      props: { 
        location: 'hero_section',
        trigger: 'user_click'
      } 
    });
  };

  const handleCloseVideo = () => {
    setShowVideoModal(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      videoRef.current.controls = false;
    }
  };

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    await track({ 
      event: 'download_click', 
      props: { 
        location: 'hero_section',
        platform: 'mac',
        version: 'latest'
      } 
    });
    window.location.href = '/api/download/mac?source=hero_section';
  };

  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading */}
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

      {/* Hero Content with Panels */}
      <div className="relative w-full px-2 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto relative">
          {/* Blurred poster background */}
          <div 
            className="absolute inset-0 -z-10 rounded-xl overflow-hidden"
            style={{
              backgroundImage: `url(${isMobile ? cdnUrl('/assets/images/hero-mobile-poster.jpg') : cdnUrl('/assets/images/hero-desktop-poster.jpg')})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(20px)',
              opacity: 0.3,
              transform: 'scale(1.1)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background/90" />
          </div>
          
          {/* Panels Container - Responsive */}
          <div className={isMobile ? "flex flex-col gap-4 pb-6 w-full" : "flex items-center justify-center gap-4 lg:gap-6 pb-6"}>
            {/* Panel 1: Find Files */}
            {isMobile ? (
              <div className="vibe-panel w-full">
                <h2 className="vibe-panel__title">Find Files</h2>
                <p className="text-foreground/80 text-sm leading-relaxed">
                  AI uses <strong>Regex Filter</strong>, <strong>Content Relevance</strong>, and <strong>Dependencies</strong> to read actual code. From 1,000 files to the 10 that matter.
                </p>
              </div>
            ) : (
              <div className="vibe-panel flex-shrink-0" style={{width: 'min(300px, 30vw)', height: 'min(380px, 45vh)'}}>
                <h2 className="vibe-panel__title">Find Files</h2>
                <div className="vibe-intent-box">
                  <div className="vibe-intent-box__item">Regex Filter</div>
                  <div className="vibe-intent-box__item">Content Relevance</div>
                  <div className="vibe-intent-box__item">Dependencies</div>
                </div>
                <p className="vibe-panel__description">
                  AI reads actual code. From 1,000 files to the 10 that matter.
                </p>
              </div>
            )}

            {/* Arrow between Panel 1 and 2 - Desktop only */}
            {isDesktop && (
              <div className="flex items-center justify-center px-2 relative">
                <div className="relative">
                  <svg 
                    className="w-10 h-10 animate-pulse" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{
                      filter: 'drop-shadow(0 0 8px color-mix(in oklch, var(--color-primary) 40%, transparent))',
                    }}
                  >
                    <defs>
                      <linearGradient id="arrow-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                        <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      </linearGradient>
                    </defs>
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M13 7l5 5m0 0l-5 5m5-5H6" 
                      stroke="url(#arrow-gradient-1)"
                      strokeWidth="2.5"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                  </div>
                </div>
              </div>
            )}

            {/* Panel 2: Parallel Planning */}
            <div className={isMobile ? "vibe-panel vibe-panel--accent vibe-panel--glow w-full" : "vibe-panel vibe-panel--accent vibe-panel--glow flex-shrink-0"} style={isMobile ? {} : {width: 'min(300px, 30vw)', height: 'min(380px, 45vh)'}}>
              <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
              <div className="vibe-models-container">
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">GPT-5</span>
                    <span className="vibe-model-card__progress">72%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '72%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Structuring approach...</div>
                </div>
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Gemini 2.5 Pro</span>
                    <span className="vibe-model-card__progress">91%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '91%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Reviewing trade-offs...</div>
                </div>
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Claude 4</span>
                    <span className="vibe-model-card__progress">85%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '85%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Analyzing patterns...</div>
                </div>
              </div>
              <p className="vibe-panel__description">
                Click multiple times for more plans. Merge the best ideas.
              </p>
            </div>

            {/* Arrow between Panel 2 and 3 - Desktop only */}
            {isDesktop && (
              <div className="flex items-center justify-center px-2 relative">
                <div className="relative">
                  <svg 
                    className="w-10 h-10 animate-pulse" 
                    fill="none" 
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    style={{
                      filter: 'drop-shadow(0 0 8px color-mix(in oklch, var(--color-primary) 40%, transparent))',
                      animationDelay: '0.5s'
                    }}
                  >
                    <defs>
                      <linearGradient id="arrow-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                        <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      </linearGradient>
                    </defs>
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      d="M13 7l5 5m0 0l-5 5m5-5H6" 
                      stroke="url(#arrow-gradient-2)"
                      strokeWidth="2.5"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                  </div>
                </div>
              </div>
            )}

            {/* Panel 3: Ready for Agents - Show on mobile too */}
            {(isMobile || !isMobile) && (
              <div className={isMobile ? "vibe-panel w-full" : "vibe-panel flex-shrink-0"} style={isMobile ? {} : {width: 'min(300px, 30vw)', height: 'min(380px, 45vh)'}}>
                <h2 className="vibe-panel__title">Ready for Agents</h2>
                <div className="vibe-code-block">
                  <pre className="vibe-code-block__content">{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
    </file_operation>
  </step>
</plan>`}</pre>
                </div>
                <p className="vibe-panel__description">
                  Copy to Claude Code, Cursor, or OpenAI Codex. Ready to ship.
                </p>
              </div>
            )}
          </div>
          
          {/* Watch Demo button - below the cards */}
          <div className="flex justify-center pb-2">
            <button
              onClick={handlePlayVideo}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary/15 backdrop-blur-md text-primary rounded-full text-base font-semibold border-2 border-primary/40 hover:bg-primary/25 hover:border-primary/60 hover:scale-105 transition-all group animate-pulse-glow"
              style={{
                boxShadow: '0 0 30px color-mix(in oklch, var(--color-primary) 25%, transparent), 0 0 50px color-mix(in oklch, var(--color-primary) 15%, transparent), 0 8px 16px -8px rgba(0, 0, 0, 0.2)',
                animation: 'pulse-glow 4s ease-in-out infinite alternate'
              }}
              aria-label="Watch demo video"
            >
              <Play className="w-5 h-5 group-hover:text-primary-foreground transition-colors" fill="currentColor" />
              <span>Watch Short Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Video Modal */}
      <AnimatePresence>
        {showVideoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-xl"
            onClick={handleCloseVideo}
          >
            <button
              onClick={handleCloseVideo}
              className="fixed top-24 right-4 z-[110] p-3 text-white hover:text-white transition-colors bg-black/70 rounded-full backdrop-blur-sm border border-white/20"
              aria-label="Close video"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isMobile ? 'w-[100vw]' : 'w-[90vw] max-w-[1600px]'}`}
              style={{
                aspectRatio: isMobile ? '9/16' : '16/9',
                maxHeight: isMobile ? '100vh' : '90vh'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                style={{
                  filter: 'brightness(1.2) contrast(1.1)',
                  WebkitFilter: 'brightness(1.2) contrast(1.1)'
                }}
                poster={isMobile ? cdnUrl('/assets/images/hero-mobile-poster.jpg') : cdnUrl('/assets/images/hero-desktop-poster.jpg')}
                playsInline
                onClick={(e) => {
                  const video = e.currentTarget;
                  if (!video.controls) {
                    video.controls = true;
                  }
                }}
              >
                {isMobile === true ? (
                  <>
                    <source src={cdnUrl('/assets/videos/hero-section_vp9.webm')} type="video/webm; codecs=vp9" />
                    <source src={cdnUrl('/assets/videos/hero-section.mp4')} type="video/mp4" />
                  </>
                ) : isMobile === false ? (
                  <>
                    <source src={cdnUrl('/assets/videos/hero-section-16by9_vp9.webm')} type="video/webm; codecs=vp9" />
                    <source src={cdnUrl('/assets/videos/hero-section-16by9.mp4')} type="video/mp4" />
                  </>
                ) : (
                  <>
                    {/* Default to vertical video during initial load */}
                    <source src={cdnUrl('/assets/videos/hero-section_vp9.webm')} type="video/webm; codecs=vp9" />
                    <source src={cdnUrl('/assets/videos/hero-section.mp4')} type="video/mp4" />
                  </>
                )}
                Your browser does not support the video tag.
              </video>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Previous hero content below */}
      <div className="relative text-center px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto mt-2">
        {/* Subtitle */}
        <p className="text-xl sm:text-2xl md:text-3xl text-foreground/90 dark:text-foreground/95 mb-8 leading-relaxed max-w-4xl mx-auto font-medium">
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
            {mounted ? (
              <img 
                src={
                  resolvedTheme === 'dark' 
                    ? "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1009288&theme=dark&t=1757410274822"
                    : "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1009288&theme=light&t=1757410294950"
                } 
                alt="Vibe Manager - Context control for AI coding sessions | Product Hunt" 
                width="250" 
                height="54"
                style={{ width: '250px', height: '54px' }}
              />
            ) : (
              // Placeholder to prevent layout shift while theme loads
              <div style={{ width: '250px', height: '54px' }} />
            )}
          </a>
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
            <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-sm text-muted-foreground hover:text-primary transition-colors mb-8">Join the Windows waitlist</a>
          </div>
        </div>

      </div>

    </section>
  );
}