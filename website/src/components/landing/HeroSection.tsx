'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, BarChart3, CheckCircle2, Target, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { trackCTA } from '@/lib/track';

export function HeroSection() {

  // Start with null to match server/client
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

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


  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-6 sm:pb-8 w-full">
        <h2
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent max-w-5xl mx-auto"
          style={{
            contentVisibility: 'auto',
            backgroundImage: 'linear-gradient(135deg, var(--color-adaptive-primary), var(--color-adaptive-accent), var(--teal-bright))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Plan Complex Changes Without Breaking Production
        </h2>
        <p className="mt-6 text-lg sm:text-xl text-foreground/80 max-w-4xl mx-auto">
          AI generates detailed implementation plans with exact file paths.
          You review and approve every change before execution.
          Zero risk, full control.
        </p>
      </div>

      {/* Hero Content with Panels */}
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="w-full mx-auto relative">
          
          {/* Panels Container - Responsive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={isMobile === true ? "flex flex-col gap-6 pb-8 w-full" : "flex items-center justify-center gap-1 pb-6"}
          >
                {/* Panel 1: Find Files */}
                {isMobile ? (
              <div className="vibe-panel w-full" style={{minHeight: 'auto'}}>
                <h2 className="vibe-panel__title">File discovery workflow</h2>
                <p className="text-foreground/80 text-base leading-relaxed">
                  Generate search patterns, run relevance scoring, and review staged results before including files in your plan. <LinkWithArrow href="/features/file-discovery">See how it works</LinkWithArrow>
                </p>
              </div>
            ) : (
              <div className="vibe-panel flex-shrink-0" style={{width: 'min(380px, 32vw)', height: 'min(420px, 50vh)'}}>
                <h2 className="vibe-panel__title">File discovery workflow</h2>
                <div className="vibe-intent-box">
                  <div className="vibe-intent-box__item text-base flex items-center gap-3 justify-start">
                    <Search className="w-5 h-5 text-foreground/60" />
                    <span>Pattern groups</span>
                  </div>
                  <div className="vibe-intent-box__item text-base flex items-center gap-3 justify-start">
                    <BarChart3 className="w-5 h-5 text-foreground/60" />
                    <span>Relevance scores</span>
                  </div>
                  <div className="vibe-intent-box__item text-base flex items-center gap-3 justify-start">
                    <CheckCircle2 className="w-5 h-5 text-foreground/60" />
                    <span>Stage reviews</span>
                  </div>
                  <div className="vibe-intent-box__item text-base flex items-center gap-3 justify-start">
                    <Target className="w-5 h-5 text-foreground/60" />
                    <span>Context optimization</span>
                  </div>
                  <div className="vibe-intent-box__item text-base flex items-center gap-3 justify-start">
                    <Zap className="w-5 h-5 text-foreground/60" />
                    <span>Real-time progress</span>
                  </div>
                </div>
                <p className="vibe-panel__description text-base">
                  Surface the right files before you write prompts. <LinkWithArrow href="/features/file-discovery">Learn more</LinkWithArrow>
                </p>
              </div>
            )}

            {/* Arrow between Panel 1 and 2 - Desktop only with spacer */}
            {isDesktop && (
              <div className="flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
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
            <div className={isMobile ? "vibe-panel vibe-panel--accent vibe-panel--glow w-full" : "vibe-panel vibe-panel--accent vibe-panel--glow flex-shrink-0"} style={isMobile ? {minHeight: 'auto'} : {width: 'min(360px, 32vw)', height: 'min(420px, 50vh)'}}>
              <h2 className="vibe-panel__title vibe-panel__title--accent">Multi-model planning</h2>
              <div className="vibe-models-container">
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">GPT-5</span>
                    <span className="vibe-model-card__progress">72%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '72%'}}></div>
                  </div>
                </div>
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Gemini 2.5 Pro</span>
                    <span className="vibe-model-card__progress">91%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '91%'}}></div>
                  </div>
                </div>
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">Claude Sonnet 4</span>
                    <span className="vibe-model-card__progress">85%</span>
                  </div>
                  <div className="vibe-progress-bar">
                    <div className="vibe-progress-bar__fill" style={{width: '85%'}}></div>
                  </div>
                </div>
              </div>
              <p className="vibe-panel__description">
                Generate implementation plans from GPT-5, Gemini 2.5 Pro, Claude 4 Sonnet, Grok 4, and DeepSeek R1 and merge the best ideas. <LinkWithArrow href="/docs">Explore the workflow</LinkWithArrow>
              </p>
            </div>

            {/* Arrow between Panel 2 and 3 - Desktop only with spacer */}
            {isDesktop && (
              <div className="flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
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
            <div className={isMobile ? "vibe-panel w-full" : "vibe-panel flex-shrink-0"} style={isMobile ? {minHeight: 'auto'} : {width: 'min(380px, 32vw)', height: 'min(420px, 50vh)'}}>
              <h2 className="vibe-panel__title">Integrated terminal</h2>
                <div className="vibe-code-block">
                  <pre className="vibe-code-block__content">{`$ codex | claude | cursor | gemini
> Voice transcription available
> Prompt preview before run
> Token guardrails in place
> Logs persist locally`}</pre>
                </div>
                <p className="vibe-panel__description">
                  Launch claude, cursor, codex, or gemini without leaving the workspace. Health monitoring and recovery keep long jobs running. <LinkWithArrow href="/docs/terminal-sessions">Terminal details</LinkWithArrow>
                </p>
                </div>
          </motion.div>
          
          {/* Simple CTAs */}
          <div className="flex flex-col items-center gap-4 pb-8">
            <Button
              variant="cta"
              size="lg"
              asChild
              onClick={() => trackCTA('hero', 'Try Interactive Demo', '/demo')}
            >
              <Link href="/demo">Try Interactive Demo →</Link>
            </Button>

            <Button
              variant="outline"
              size="lg"
              asChild
              onClick={() => trackCTA('hero', 'Download for Free', '/downloads')}
            >
              <Link href="/downloads">Download for Free</Link>
            </Button>

            <Link
              href="/how-it-works"
              className="text-sm text-foreground/60 hover:text-foreground/80 underline"
            >
              See how it works
            </Link>

            {/* Social Proof - Commented out for now */}
            {/*
            <div className="flex flex-col items-center gap-4 py-8 border-t border-foreground/10 mt-8">
              <p className="text-xs text-foreground/50 uppercase tracking-wider">
                Trusted by teams managing complex codebases
              </p>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  500+ plans reviewed this week
                </p>
              </div>
            </div>
            */}
          </div>
        </div>
      </div>

      {/* Hero Demo Video - Coming Soon */}
      {/*
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="relative rounded-lg overflow-hidden shadow-2xl">
          <video
            ref={videoRef}
            className="w-full"
            playsInline
            autoPlay
            loop
            muted
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
        </div>
        <p className="text-center text-sm text-foreground/60 mt-3">
          Watch: 5-minute first win (ready soon)
        </p>
      </div>
      */}

    </section>
  );
}