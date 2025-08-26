'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import Reveal from '@/components/motion/Reveal';
import { Check } from 'lucide-react';

export function FounderProof() {
  return (
    <section className="relative py-12 sm:py-16 px-4 -mt-12 sm:-mt-16">
      <div className="container mx-auto max-w-3xl relative z-10">
        <Reveal>
          <GlassCard>
            <div className="p-6 sm:p-8">
              <p className="text-center text-base sm:text-lg lg:text-xl font-medium text-foreground/90 mb-6 leading-relaxed">
                "I built Vibe because my models kept losing the plot in big repos - now I use it daily."
              </p>
              <ul className="space-y-4 text-center sm:text-left sm:flex sm:flex-wrap sm:justify-center sm:space-y-0 sm:gap-x-8 sm:gap-y-4">
                <li className="flex items-center justify-center sm:justify-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-foreground/80 text-sm sm:text-base">Finds the 10–20 files that matter</span>
                </li>
                <li className="flex items-center justify-center sm:justify-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-foreground/80 text-sm sm:text-base">Merges multi-model plans</span>
                </li>
                <li className="flex items-center justify-center sm:justify-start gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-foreground/80 text-sm sm:text-base">You control what's sent</span>
                </li>
              </ul>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}