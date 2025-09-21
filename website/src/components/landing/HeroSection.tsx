'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { track } from '@/lib/track';
import { cdnUrl } from '@/lib/cdn';
import { Play, X } from 'lucide-react';
import Link from 'next/link';

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const desktopVideoRef = useRef<HTMLVideoElement>(null);

  // Start with null to match server/client
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Set initial values and handle resize
  useEffect(() => {
    const checkMobile = () => window.innerWidth < 640;
    const checkDesktop = () => window.innerWidth >= 1024;

    // Set initial values
    setIsMobile(checkMobile());
    setIsDesktop(checkDesktop());

    const handleResize = () => {
      setIsMobile(checkMobile());
      setIsDesktop(checkDesktop());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const handlePlayVideo = () => {
    if (isMobile) {
      // On mobile, immediately play fullscreen
      if (videoRef.current) {
        // Reset video state for replay
        videoRef.current.currentTime = 0;

        // Set source if not already set
        if (!videoRef.current.src) {
          videoRef.current.src = cdnUrl('/assets/videos/hero-section.mp4');
        }

        videoRef.current.play().then(() => {
          if (videoRef.current?.requestFullscreen) {
            videoRef.current.requestFullscreen();
          } else if ((videoRef.current as any)?.webkitEnterFullscreen) {
            (videoRef.current as any).webkitEnterFullscreen();
          }
        }).catch(err => {
          // Fallback to modal if fullscreen fails
          console.log('Fullscreen failed, using modal', err);
          setShowVideoModal(true);
        });
      }
    } else {
      // Desktop keeps the modal
      setShowVideoModal(true);
      setTimeout(() => {
        if (desktopVideoRef.current) {
          desktopVideoRef.current.play();
        }
      }, 100);
    }
    track({
      event: 'hero_video_play',
      props: {
        location: 'hero_section',
        trigger: 'user_click',
        device: isMobile ? 'mobile' : 'desktop'
      }
    });
  };

  const handleCloseVideo = () => {
    setShowVideoModal(false);
    if (desktopVideoRef.current) {
      desktopVideoRef.current.pause();
      desktopVideoRef.current.currentTime = 0;
      desktopVideoRef.current.controls = false;
    }
  };


  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-6 sm:pb-8 w-full">
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
          Serious AI Architect Studio for Large & Legacy Codebases
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-foreground/80 max-w-4xl mx-auto">
          Multi-model planning with real code context - then execute via integrated terminal. Ship features and fixes safely, without regressions.
        </p>
      </div>

      {/* Hero Content with Panels */}
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto relative">
          
          {/* Panels Container - Responsive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={isMobile === true ? "flex flex-col gap-6 pb-8 w-full" : "flex items-center justify-center gap-3 lg:gap-4 pb-6"}
          >
                {/* Panel 1: Find Files */}
                {isMobile ? (
              <div className="vibe-panel w-full" style={{minHeight: 'fit-content'}}>
                <h2 className="vibe-panel__title">Code-Aware Discovery</h2>
                <p className="text-foreground/80 text-base leading-relaxed">
                  From 1,000 files to the <strong>true impact surface</strong>. AI finds deps, patterns, and non-obvious links. Built for heavy coding-agent users. <Link href="/file-finder" className="text-primary hover:underline">Learn more →</Link>
                </p>
              </div>
            ) : (
              <div className="vibe-panel flex-shrink-0" style={{width: 'min(320px, 28vw)', height: 'min(380px, 45vh)'}}>
                <h2 className="vibe-panel__title">Code-Aware Discovery</h2>
                <div className="vibe-intent-box">
                  <div className="vibe-intent-box__item text-base">Impact Surface</div>
                  <div className="vibe-intent-box__item text-base">Dependencies</div>
                  <div className="vibe-intent-box__item text-base">Legacy Patterns</div>
                </div>
                <p className="vibe-panel__description text-base">
                  True context for heavy coding-agent users. <Link href="/file-finder" className="text-primary hover:underline">Learn more →</Link>
                </p>
              </div>
            )}

            {/* Arrow between Panel 1 and 2 - Desktop only with spacer */}
            {isDesktop && (
              <div className="flex items-center justify-center px-2 relative" style={{ minWidth: '56px', minHeight: '40px' }}>
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

            {/* Panel 2: Multi-Model Planning */}
            <div className={isMobile ? "vibe-panel vibe-panel--accent vibe-panel--glow w-full" : "vibe-panel vibe-panel--accent vibe-panel--glow flex-shrink-0"} style={isMobile ? {minHeight: '166px'} : {width: 'min(300px, 30vw)', height: 'min(380px, 45vh)'}}>
              <h2 className="vibe-panel__title vibe-panel__title--accent">Council of LLMs</h2>
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
                    <span className="vibe-model-card__name">Claude Sonnet 4</span>
                    <span className="vibe-model-card__progress">85%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '85%'}}></div>
                  </div>
                  <div className="vibe-model-card__status">Analyzing patterns...</div>
                </div>
              </div>
              <p className="vibe-panel__description">
                Generate multiple plans. <Link href="/docs" className="text-primary hover:underline">Merge with your instructions →</Link>
              </p>
            </div>

            {/* Arrow between Panel 2 and 3 - Desktop only with spacer */}
            {isDesktop && (
              <div className="flex items-center justify-center px-2 relative" style={{ minWidth: '56px', minHeight: '40px' }}>
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

            {/* Panel 3: Integrated Terminal - Always render to prevent layout shift */}
            <div className={isMobile ? "vibe-panel w-full" : "vibe-panel flex-shrink-0"} style={isMobile ? {minHeight: '166px'} : {width: 'min(320px, 28vw)', height: 'min(380px, 45vh)'}}>
              <h2 className="vibe-panel__title">Integrated Terminal</h2>
                <div className="vibe-code-block">
                  <pre className="vibe-code-block__content">{`$ codex | claude | cursor | aider
> Voice dictation for prompts
> Edit plans in Monaco editor
> Execute with approvals
> Full session transcripts`}</pre>
                </div>
                <p className="vibe-panel__description">
                  Run <Link href="/docs/integrated-terminal-cli-orchestration" className="text-primary hover:underline">codex</Link>, <Link href="/docs/integrated-terminal-cli-orchestration" className="text-primary hover:underline">claude</Link>, <Link href="/docs/integrated-terminal-cli-orchestration" className="text-primary hover:underline">cursor</Link>, <Link href="/docs/integrated-terminal-cli-orchestration" className="text-primary hover:underline">aider</Link> directly. No context switch.
                </p>
                </div>
          </motion.div>
          
          {/* Simple CTAs */}
          <div className="flex flex-col items-center gap-4 pb-8">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Link
                href="/downloads"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all"
              >
                Download Free
              </Link>
              <button
                onClick={handlePlayVideo}
                className="flex items-center gap-2 px-4 py-2 text-foreground/70 hover:text-foreground transition-all"
                aria-label="Watch demo video"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                <span>Watch demo</span>
              </button>
            </div>
            <div className="text-sm text-foreground/50">
              macOS & Windows • $10 free credits
            </div>
          </div>
        </div>
      </div>

      {/* Hidden video for mobile fullscreen */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        controls
        poster={cdnUrl('/assets/images/hero-mobile-poster.jpg')}
        onEnded={() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            if (document.fullscreenElement) {
              document.exitFullscreen?.();
            }
          }
        }}
        onPause={() => {
          // Reset video when paused (user exited fullscreen)
          if (videoRef.current && !document.fullscreenElement) {
            videoRef.current.currentTime = 0;
          }
        }}
      />

      {/* Video Modal - Desktop only */}
      <AnimatePresence>
        {showVideoModal && !isMobile && (
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
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[1600px]"
              style={{
                aspectRatio: '16/9',
                maxHeight: '90vh'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={desktopVideoRef}
                className="w-full h-full object-contain"
                style={{
                  filter: 'brightness(1.2) contrast(1.1)',
                  WebkitFilter: 'brightness(1.2) contrast(1.1)'
                }}
                poster={cdnUrl('/assets/images/hero-desktop-poster.jpg')}
                playsInline
                onClick={(e) => {
                  const video = e.currentTarget;
                  if (!video.controls) {
                    video.controls = true;
                  }
                }}
              >
                <source src={cdnUrl('/assets/videos/hero-section-16by9_vp9.webm')} type="video/webm; codecs=vp9" />
                <source src={cdnUrl('/assets/videos/hero-section-16by9.mp4')} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


    </section>
  );
}