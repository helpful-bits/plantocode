'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { variants } from '@/lib/animations';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

export function Features({ features = defaultFeatures }: FeaturesProps) {
  return (
    <section className="relative pt-16 pb-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="features">
      <div className="container mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          whileInView="visible"
          variants={variants.section}
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis font-bold text-shadow-subtle"
            variants={variants.item}
          >
            Key Features
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-description-muted"
            variants={variants.item}
          >
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </motion.p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 p-2"
          initial="hidden"
          whileInView="visible"
          variants={variants.section}
          viewport={{ once: true, amount: 0.1 }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="feature-card group"
              variants={variants.item}
            >
              <GlassCard className="h-full">
                <div className="content-spacing text-safe-padding">
                  {/* Icon container */}
                  <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
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
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}