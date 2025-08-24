'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { usePlausible } from '@/hooks/usePlausible';

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
  const { trackEvent } = usePlausible();

  const handleDownloadClick = () => {
    trackEvent('download_click', { location: 'hero_section' });
  };


  return (
    <section className="relative h-auto sm:min-h-screen flex items-start sm:items-center justify-center overflow-hidden bg-transparent py-20 sm:py-16 md:py-14 lg:py-14">
      <div className="relative text-center px-4 sm:px-6 lg:px-8 w-full max-w-7xl mx-auto my-8">
        {/* Primary heading */}
        <Reveal as="h1" className="relative text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight" delay={0.1}>
          <span className="text-hero-title-gradient">
            Capture intent → ship the right change.
          </span>
        </Reveal>

        {/* Subtitle */}
        <Reveal as="p" className="text-xl sm:text-2xl md:text-3xl text-description-muted mb-8 leading-relaxed" delay={0.2}>
          Holds the map: relevant files, then a reviewable plan.
        </Reveal>

        {/* Vibe Manager Panels Flow - Exact ad design with website colors */}
        <div className="vibe-panels-container">
          {/* Screen reader description for carousel */}
          <div id="carousel-description" className="sr-only">
            This carousel demonstrates the three-step workflow: 1) Capture Intent where you describe goals and constraints, 
            2) Parallel Planning where multiple AI models create competing plans, and 3) Merge Plan where you get a machine-usable blueprint.
          </div>
          {/* Desktop Static Layout */}
          <div className="hidden lg:flex items-center justify-center gap-6">
            <div className="vibe-panel">
              <h2 className="vibe-panel__title">1. Capture Intent</h2>
              
              <div className="vibe-intent-box">
                <div className="vibe-intent-box__item">Goals</div>
                <div className="vibe-intent-box__item">Constraints</div>
                <div className="vibe-intent-box__item">Affected Areas</div>
              </div>

              <p className="vibe-panel__description">
                Type or talk your mental flow. We structure goals, constraints, and
                affected areas. Video optional - great when complex.
              </p>
            </div>

            <VibeChevron />

            <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
              <h2 className="vibe-panel__title vibe-panel__title--accent">2. Parallel Planning</h2>
              
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
                  <div className="vibe-model-card__status">Generating plans...</div>
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
                Leading models draft competing plans with explicit trade-offs.
                2 button clicks - find files and create implementation plan.
              </p>
            </div>

            <VibeChevron />

            <div className="vibe-panel">
              <h2 className="vibe-panel__title">3. Merge a Machine-Usable Plan</h2>
              
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
                One blueprint with exact file ops, diffs, and validation checkpoints.
                Honest work, ready to ship.
              </p>
            </div>
          </div>

          {/* Mobile Auto-Scrolling News Ticker Style Cards */}
          <div className="block lg:hidden">
            <div className="vibe-ticker-container">
              <div className="vibe-ticker-track">
                
                {/* Card 1: Capture Intent */}
                <div className="vibe-ticker-card">
                  <div className="vibe-panel">
                    <h2 className="vibe-panel__title">1. Capture Intent</h2>
                    
                    <div className="vibe-intent-box">
                      <div className="vibe-intent-box__item">Goals</div>
                      <div className="vibe-intent-box__item">Constraints</div>
                      <div className="vibe-intent-box__item">Affected Areas</div>
                    </div>

                    <p className="vibe-panel__description">
                      Type or talk your mental flow. We structure goals, constraints, and
                      affected areas. Video optional - great when complex.
                    </p>
                  </div>
                </div>

                {/* Card 2: Parallel Planning (Accent with Glow) */}
                <div className="vibe-ticker-card">
                  <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
                    <h2 className="vibe-panel__title vibe-panel__title--accent">2. Parallel Planning</h2>
                    
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
                        <div className="vibe-model-card__status">Generating plans...</div>
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
                      Leading models draft competing plans with explicit trade-offs.
                      2 button clicks - find files and create implementation plan.
                    </p>
                  </div>
                </div>

                {/* Card 3: Merge Plan */}
                <div className="vibe-ticker-card">
                  <div className="vibe-panel">
                    <h2 className="vibe-panel__title">3. Merge a Machine-Usable Plan</h2>
                    
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
                      One blueprint with exact file ops, diffs, and validation checkpoints.
                      Honest work, ready to ship.
                    </p>
                  </div>
                </div>

                {/* Duplicate cards for seamless loop */}
                <div className="vibe-ticker-card">
                  <div className="vibe-panel">
                    <h2 className="vibe-panel__title">1. Capture Intent</h2>
                    
                    <div className="vibe-intent-box">
                      <div className="vibe-intent-box__item">Goals</div>
                      <div className="vibe-intent-box__item">Constraints</div>
                      <div className="vibe-intent-box__item">Affected Areas</div>
                    </div>

                    <p className="vibe-panel__description">
                      Type or talk your mental flow. We structure goals, constraints, and
                      affected areas. Video optional - great when complex.
                    </p>
                  </div>
                </div>

                <div className="vibe-ticker-card">
                  <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
                    <h2 className="vibe-panel__title vibe-panel__title--accent">2. Parallel Planning</h2>
                    
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
                        <div className="vibe-model-card__status">Generating plans...</div>
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
                      Leading models draft competing plans with explicit trade-offs.
                      2 button clicks - find files and create implementation plan.
                    </p>
                  </div>
                </div>

                <div className="vibe-ticker-card">
                  <div className="vibe-panel">
                    <h2 className="vibe-panel__title">3. Merge a Machine-Usable Plan</h2>
                    
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
                      One blueprint with exact file ops, diffs, and validation checkpoints.
                      Honest work, ready to ship.
                    </p>
                  </div>
                </div>
                
              </div>
            </div>
          </div>

        </div>

        {/* Story - Hidden by default, expandable */}
        <Reveal className="max-w-3xl mx-auto mb-8" delay={0.35}>
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
        </Reveal>

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Reveal delay={0.3}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button asChild className="relative overflow-hidden" size="xl" variant="cta" onClick={handleDownloadClick}>
                  <Link href="/download" prefetch={false} className="no-hover-effect cursor-pointer">
                    Download for Mac
                  </Link>
                </Button>
              </motion.div>
            </Reveal>

            <Reveal delay={0.35}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button asChild size="lg" variant="gradient-outline">
                  <Link href="#how-it-works" className="no-hover-effect cursor-pointer">
                    See How It Works
                  </Link>
                </Button>
              </motion.div>
            </Reveal>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">Windows coming soon</span>
        </div>

        {/* Trust indicators */}
        <Reveal className="mt-8 sm:mt-12 flex flex-wrap gap-x-8 gap-y-4 justify-center text-sm text-muted-foreground" delay={0.4}>
          <span className="flex items-center gap-2">
            <span className="text-primary">✓</span> Built by a developer, for developers
          </span>
          <span className="flex items-center gap-2">
            <span className="text-primary">✓</span> 100% local-first
          </span>
          <span className="flex items-center gap-2">
            <span className="text-primary">✓</span> No subscriptions
          </span>
        </Reveal>
      </div>

    </section>
  );
}