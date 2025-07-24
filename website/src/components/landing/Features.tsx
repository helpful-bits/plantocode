'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

const containerVariants = {
  hidden: {
    opacity: 0,
    transform: 'translateZ(0)', // GPU acceleration
  },
  visible: {
    opacity: 1,
    transform: 'translateZ(0)', // GPU acceleration
    transition: {
      staggerChildren: 0.15,  // Optimized stagger timing
      delayChildren: 0.1,
      ease: [0.4, 0, 0.2, 1], // Custom easing curve
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 20,  // Further reduced movement distance
    scale: 0.95,
    transform: 'translateZ(0)', // GPU acceleration
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transform: 'translateZ(0)', // GPU acceleration
    transition: {
      type: 'tween',
      duration: 0.4, // Faster animation
      ease: [0.4, 0, 0.2, 1], // Optimized easing curve
      willChange: 'transform, opacity', // Performance hint
    },
  },
};

const iconVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    transform: 'translateZ(0)', // GPU acceleration
  },
  visible: {
    opacity: 1,
    scale: 1,
    transform: 'translateZ(0)', // GPU acceleration
    transition: {
      type: 'tween',
      duration: 0.25, // Faster animation
      ease: [0.4, 0, 0.2, 1], // Optimized easing curve
      delay: 0.05, // Reduced delay
      willChange: 'transform, opacity', // Performance hint
    },
  },
};

export function Features({ features = defaultFeatures }: FeaturesProps) {
  return (
    <section className="relative py-16 px-4 overflow-hidden" id="features">
      {/* No background - show particles */}

      <div className="container mx-auto relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 15, transform: 'translateZ(0)' }}
          style={{ transform: 'translateZ(0)' }}
          transition={{
            duration: 0.5,
            ease: [0.4, 0, 0.2, 1],
            willChange: 'transform, opacity',
          }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0, transform: 'translateZ(0)' }}
        >
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis font-bold text-shadow-subtle"
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, scale: 1 }}
          >
            Key Features
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-description-muted"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1 }}
          >
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </motion.p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
          initial="hidden"
          variants={containerVariants}
          viewport={{ once: true, margin: '-50px' }}  // Reduced margin for later trigger
          whileInView="visible"
        >
          {features.map((feature, index) => {
            return (
              <motion.div
                key={index}
                style={{ transform: 'translateZ(0)' }}
                variants={cardVariants}
                whileHover={{
                  scale: 1.015,  // Further reduced scale for better performance
                  y: -2, // Subtle lift effect
                  transition: {
                    duration: 0.15,
                    ease: [0.4, 0, 0.2, 1],
                    willChange: 'transform',
                  },
                }}
              >
                <GlassCard
                  className="h-full will-change-transform"
                  style={{ transform: 'translateZ(0)' }}
                >
                  <div className="content-spacing text-safe-padding">
                    {/* Icon container with enhanced animation */}
                    <motion.div
                      className="mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20"
                      variants={iconVariants}
                      whileHover={{
                        scale: 1.1,  // Simplified hover without rotation
                        transition: { duration: 0.2 },
                      }}
                    >
                      <div className="transition-transform duration-300 text-primary/80">
                        {feature.icon}
                      </div>
                    </motion.div>

                    <motion.h3
                      animate={{ opacity: 1 }}
                      className="text-xl font-semibold text-center mb-3 text-foreground"
                      initial={{ opacity: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      {feature.title}
                    </motion.h3>

                    <motion.p
                      animate={{ opacity: 1 }}
                      className="text-center text-sm leading-relaxed text-foreground/80"
                      initial={{ opacity: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      {feature.description}
                    </motion.p>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}