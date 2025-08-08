'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';

export function HeroSection() {

  return (
    <section className="relative h-auto sm:min-h-screen flex items-start sm:items-center justify-center overflow-hidden bg-transparent py-16 sm:py-12 md:py-16 lg:py-0">
      <div className="relative text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto my-8">
        {/* Primary heading */}
        <Reveal as="h1" className="relative text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight" delay={0.1}>
          <span className="text-hero-title">
            The Polite Context Guidance Centre for Somewhat Bewildered AI Agents
          </span>
        </Reveal>

        {/* Subtitle - Enhanced with the story */}
        <Reveal className="relative mb-8 max-w-3xl mx-auto space-y-4" delay={0.2}>
          <p className="relative text-lg sm:text-xl text-description-muted leading-relaxed">
            You know the feeling. You're "vibe coding" with an AI agent - the ideas are flowing, it's magical... until it's not. 
            The agent gets hopelessly lost in your codebase, starts ignoring instructions, hallucinates APIs, and writes code 
            that feels like it belongs in a different project entirely.
          </p>
          <p className="relative text-lg sm:text-xl text-foreground font-medium">
            That magic moment is gone. Now you're a babysitter writing novels of documentation just to keep the agent on track.
          </p>
          <p className="relative text-lg sm:text-xl text-description-muted leading-relaxed">
            Here's the thing: your code IS the documentation. It evolves fast. Every refactor, every new feature - your codebase 
            tells its own story. But AI has limited context. It wastes time searching through irrelevant files, missing the 
            crucial ones, or worse - trying to understand everything at once.
          </p>
          <p className="relative text-lg sm:text-xl text-description-muted leading-relaxed">
            Vibe Manager was born from hitting that wall. Hard. Agents don't need more rules - they need the right files, 
            real context, and clear tasks. Simple as that.
          </p>
        </Reveal>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Reveal delay={0.3}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button asChild className="relative overflow-hidden" size="xl" variant="cta">
                <Link href="/download">
                  Get Your Weekend Back
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
                <Link href="#how-it-works">
                  See How It Works
                </Link>
              </Button>
            </motion.div>
          </Reveal>
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