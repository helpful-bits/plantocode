'use client';

import React from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import Reveal from '@/components/motion/Reveal';
import { ArrowUpRight } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

export function Features({ features = defaultFeatures }: FeaturesProps) {
  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="features">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis font-bold text-shadow-subtle" delay={0}>
            Mechanisms
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/85 dark:text-foreground/90" delay={0.05}>
            Built for developers tackling large & legacy codebases. If you use Claude Code, Cursor, or Aider - this is your planning layer.
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Reveal
              key={index}
              className="feature-card group"
              delay={0.1 + index * 0.05}
            >
              <GlassCard className="h-full">
                <div className="content-spacing text-safe-padding">
                  {/* Icon container - hidden on mobile */}
                  <div className="hidden sm:flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                    <div className="text-primary/80">
                      {feature.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold text-center mb-3 text-foreground">
                    {feature.title}
                  </h3>

                  <p className="text-center text-sm leading-relaxed text-foreground/80">
                    {feature.description}
                  </p>

                  {feature.href && (
                    <div className="mt-4 text-center">
                      <Link
                        href={feature.href}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Learn more
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}