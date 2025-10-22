'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import Reveal from '@/components/motion/Reveal';

export function FounderProof() {

  return (
    <section className="relative pt-4 pb-8 sm:pt-6 sm:pb-12 lg:pt-8 lg:pb-16 px-4">
      <div className="container mx-auto max-w-4xl relative z-10">
        <Reveal>
          <GlassCard>
            <div className="p-4 sm:p-6">
              <p className="text-center text-base sm:text-lg lg:text-xl font-medium text-foreground/90 mb-4 leading-relaxed">
                "I built PlanToCode because my models kept losing the plot in big repos - now I use it daily." - Kiri, creator of PlanToCode
              </p>
              
              {/* Story - Hidden by default, expandable */}
              <details className="group mb-4">
                <summary className="cursor-pointer list-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl">
                  <div className="relative overflow-hidden rounded-xl bg-background/30 backdrop-blur-sm border border-border/30 hover:border-border/50 transition-all duration-300 hover:shadow-md hover:shadow-primary/5 group-hover:bg-background/40">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.01] via-transparent to-primary/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative px-4 py-3 flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground/90 transition-colors duration-200">
                        The story behind PlanToCode
                      </span>
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-all duration-200 group-open:rotate-180">
                        <svg className="w-3 h-3 text-primary/60 group-hover:text-primary/70 transition-colors duration-200" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </summary>
                <div className="mt-4 relative">
                  <div className="rounded-xl bg-background/20 backdrop-blur-sm border border-border/20 p-5 sm:p-6 space-y-4">
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/[0.005] to-transparent" />
                    <div className="relative space-y-4 text-sm sm:text-base text-description-muted leading-relaxed">
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
                        PlanToCode was born from hitting that wall. Hard. Agents don't need more rules - they need the right files,
                        real context, and clear tasks.
                      </p>
                    </div>
                  </div>
                </div>
              </details>
              
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center justify-center gap-3">
                  <span className="text-lg flex-shrink-0">🇩🇪</span>
                  <span className="text-foreground/80 text-sm sm:text-base">Made in Germany</span>
                </div>
                
                {/* Product Hunt Badge */}
                {/* <div className="flex justify-center" style={{ minHeight: '43px' }}>
                  <a
                    href="https://www.producthunt.com/products/plantocode?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-plantocode"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block hover:opacity-90 transition-opacity"
                    style={{ width: '200px', height: '43px' }}
                  >
                    {mounted ? (
                      <img
                        src={
                          resolvedTheme === 'dark'
                            ? "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1009288&theme=dark&t=1757410274822"
                            : "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1009288&theme=light&t=1757410294950"
                        }
                        alt="PlanToCode - Context control for AI coding sessions | Product Hunt"
                        width="200"
                        height="43"
                        style={{ width: '200px', height: '43px' }}
                        loading="eager"
                      />
                    ) : (
                      // Placeholder to prevent layout shift while theme loads
                      <div style={{ width: '200px', height: '43px', backgroundColor: 'transparent' }} />
                    )}
                  </a>
                </div> */}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}