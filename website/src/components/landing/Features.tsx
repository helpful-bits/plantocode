'use client';

import React, { useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { useAnimationOrchestrator, animationVariants } from '@/hooks/useAnimationOrchestrator';

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
  const sectionRef = useRef<HTMLElement>(null);
  const { isInView } = useAnimationOrchestrator(sectionRef);

  return (
    <section ref={sectionRef} className="relative py-16 px-4 overflow-hidden" id="features">
      <div className="container mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={animationVariants.section}
        >
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis font-bold text-shadow-subtle"
            variants={animationVariants.item}
          >
            Key Features
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-description-muted"
            variants={animationVariants.item}
          >
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </motion.p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 p-2"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.08,
                delayChildren: 0.2,
              },
            },
          }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.95 },
                visible: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    duration: 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  },
                },
              }}
              className="feature-card group"
            >
              <GlassCard className="h-full transition-all duration-200 hover:scale-[1.02] hover:-translate-y-1">
                <div className="content-spacing text-safe-padding">
                  {/* Icon container with CSS hover */}
                  <div className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20 group-hover:scale-110">
                    <div className="transition-transform duration-300 text-primary/80">
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