'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { track } from '@/lib/track';

const VibeChevron = () => (
  <div className="vibe-chevron">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M8 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

export function HeroSection() {
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
    <section className="relative h-auto sm:min-h-screen flex items-start sm:items-center justify-center overflow-hidden bg-transparent py-20 sm:py-16 md:py-14 lg:py-14">
      <div className="relative text-center px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto my-8">
        {/* Primary heading - Priority content for LCP */}
        <h1 
          className="relative text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent" 
          style={{ 
            contentVisibility: 'auto',
            backgroundImage: 'linear-gradient(135deg, var(--color-adaptive-primary), var(--color-adaptive-accent), var(--teal-bright))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          From idea to solid plan. Fast.
        </h1>

        {/* Subtitle - Priority content for LCP */}
        <p className="text-xl sm:text-2xl md:text-3xl text-description-muted mb-8 leading-relaxed max-w-4xl mx-auto" style={{ contentVisibility: 'auto' }}>
          Tell it what you want to build. Type, talk, or show it on screen. AI finds the right files, generates plans with multiple models, and gives you a blueprint your coding agent can actually use.
        </p>

        {/* Vibe Manager Panels Flow - Two Key Features */}
        <div className="vibe-panels-container">
          {/* Screen reader description for features */}
          <div id="features-description" className="sr-only">
            Two core features: 1) Find Files - AI discovers and analyzes the exact files you need, 
            2) Parallel Planning - Multiple AI models create competing implementation plans.
          </div>
          {/* Desktop Static Layout */}
          <div className="hidden lg:flex items-center justify-center gap-6">
            <div className="vibe-panel">
              <h2 className="vibe-panel__title">Find Files</h2>
              
              <div className="vibe-intent-box">
                <div className="vibe-intent-box__item">Regex Filter</div>
                <div className="vibe-intent-box__item">File Content Relevance</div>
                <div className="vibe-intent-box__item">Dependencies</div>
              </div>

              <p className="vibe-panel__description">
                AI reads your code, not just names. Finds dependencies you forgot existed.
                From 1,000 files to the 10 that matter. Results persist - use them forever.
              </p>
            </div>

            <VibeChevron />

            <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
              <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
              
              <div className="vibe-models-container">
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
              </div>

              <p className="vibe-panel__description">
                15+ models compete. Same task, different approaches. 
                Pick the winner or merge them all. Best ideas win, bad ideas die.
              </p>
            </div>

            <VibeChevron />

            <div className="vibe-panel">
              <h2 className="vibe-panel__title">Plan for Claude Code</h2>
              
              <div className="vibe-code-block">
                <pre className="vibe-code-block__content">{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
      <validation>tests</validation>
    </file_operation>
  </step>
  <step>
    <file_operation>
      <path>docs/README.md</path>
    </file_operation>
  </step>
</plan>`}</pre>
              </div>

              <p className="vibe-panel__description">
                Blueprint your agent understands. Copy straight to Claude Code or Cursor.
                Merge multiple approaches into one perfect plan.
              </p>
            </div>
          </div>

          {/* Mobile - Single Card */}
          <div className="block md:hidden">
            <div className="vibe-mobile-single-container">
              <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
                <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
                
                <div className="vibe-models-container">
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
                </div>

                <p className="vibe-panel__description">
                  15+ models compete. Same task, different approaches. 
                  Pick the winner or merge them all. Best ideas win, bad ideas die.
                </p>
              </div>
            </div>
          </div>

          {/* Tablet - Two Cards Side by Side */}
          <div className="hidden md:block lg:hidden">
            <div className="vibe-mobile-cards-container">
              <div className="vibe-mobile-cards-grid">
                
                {/* Card 1: Parallel Planning */}
                <div className="vibe-mobile-card">
                  <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
                    <h2 className="vibe-panel__title vibe-panel__title--accent">Parallel Planning</h2>
                    
                    <div className="vibe-models-container">
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
                    </div>

                    <p className="vibe-panel__description">
                      15+ models compete. Same task, different approaches. 
                      Pick the winner or merge them all. Best ideas win, bad ideas die.
                    </p>
                  </div>
                </div>

                {/* Card 2: Plan for Claude Code */}
                <div className="vibe-mobile-card">
                  <div className="vibe-panel">
                    <h2 className="vibe-panel__title">Plan for Claude Code</h2>
                    
                    <div className="vibe-code-block">
                      <pre className="vibe-code-block__content">{`<plan>
  <step>
    <file_operation>
      <path>src/components/</path>
      <changes>...</changes>
      <validation>tests</validation>
    </file_operation>
  </step>
  <step>
    <file_operation>
      <path>docs/README.md</path>
    </file_operation>
  </step>
</plan>`}</pre>
                    </div>

                    <p className="vibe-panel__description">
                      Blueprint your agent understands. Copy straight to Claude Code.
                      Merge multiple approaches into one perfect plan.
                    </p>
                  </div>
                </div>
                
              </div>
            </div>
          </div>

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
              <a className="underline hover:text-primary" target="_blank" rel="noreferrer noopener" href="https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web">
                Signed & notarized for macOS - safer installs via Gatekeeper.
              </a>
            </em>
            <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-sm text-muted-foreground underline hover:text-primary transition-colors">Join the Windows waitlist</a>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="mt-8 sm:mt-12">
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