'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';

export function Pricing() {
  const cardVariants = {
    hidden: {
      opacity: 0,
      scale: 0.8,
      rotateX: -30,
    },
    visible: {
      opacity: 1,
      scale: 1,
      rotateX: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 20,
        duration: 0.8,
      },
    },
  };

  return (
    <section className="relative py-20 px-4 overflow-hidden perspective-1000" id="pricing">
      <div className="container mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          transition={{
            duration: 0.5,
            ease: 'easeOut',
          }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold text-shadow-subtle"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              duration: 0.4,
              delay: 0.1,
              ease: 'easeOut',
            }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
          >
            Simple Pricing
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-description-muted"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            Pay-as-you-go. No subscriptions. Transparent costs.
          </motion.p>
        </motion.div>

        <motion.div
          className="max-w-2xl mx-auto relative"
          initial="hidden"
          variants={cardVariants}
          viewport={{ once: true, margin: '-100px' }}
          whileInView="visible"
        >
          <motion.div
            className="relative will-change-transform"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            whileHover={{ scale: 1.02 }}
          >
            <GlassCard className="relative overflow-hidden" highlighted={true}>

              <div className="content-spacing-lg sm:responsive-spacing-x text-center relative z-10 text-safe-padding">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, y: 0 }}
                >
                  <h3 className="text-3xl font-semibold mb-6 text-primary-emphasis">
                    Start Free, Pay for Usage
                  </h3>
                  <p className="text-lg mb-8 text-muted-foreground">
                    All costs displayed upfront. Only charged for AI processing.
                  </p>
                </motion.div>

                <motion.div
                  className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 mb-8 ring-1 ring-primary/20"
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                >
                  <motion.div
                    className="absolute -top-3 -right-3"
                    initial={{ opacity: 0, scale: 0 }}
                    transition={{ duration: 0.4, delay: 0.7 }}
                    viewport={{ once: true }}
                    whileHover={{ scale: 1.05 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                  >
                    <div className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full shadow-lg ring-2 ring-white/30 backdrop-blur-sm">
                      <span className="tracking-wider">FREE</span>
                    </div>
                  </motion.div>

                  <h4 className="text-4xl font-bold mb-3 text-primary text-shadow-subtle">
                    $1.50
                  </h4>
                  <p className="text-lg font-medium text-accent-highlight">
                    Free Credit Included
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    No payment info needed. Full access to all features.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.05 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    className="w-full sm:w-auto"
                    size="xl"
                    variant="cta"
                  >
                    Get Started
                  </Button>
                </motion.div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}