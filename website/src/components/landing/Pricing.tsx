'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';

export function Pricing() {

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden perspective-1000" id="pricing">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold text-shadow-subtle">
            Built for Professional Development
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-description-muted" delay={0.1}>
            Transparent token costs. No seat licenses. Pay only for AI inference. Watch your ROI in real-time - one saved production incident pays for months of usage.
          </Reveal>
        </div>

        <Reveal className="max-w-2xl mx-auto relative" delay={0.15}>
          <motion.div
            className="relative"
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <GlassCard className="relative overflow-hidden" highlighted={true}>

              <div className="content-spacing-lg sm:responsive-spacing-x text-center relative z-10 text-safe-padding">
                <Reveal delay={0.2}>
                  <h3 className="text-3xl font-semibold mb-6 text-primary-emphasis">
                    Transparent Pricing
                  </h3>
                  <p className="text-lg mb-8 text-muted-foreground">
                    $5 free credits to validate this actually works. Then pay-as-you-go. No subscriptions. No per-seat licensing. Just raw API costs with full transparency.
                  </p>
                </Reveal>

                <Reveal className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 mb-8 ring-1 ring-primary/20" delay={0.25}>
                  <motion.div
                    className="absolute -top-3 -right-3"
                    initial={{ opacity: 0, scale: 0 }}
                    transition={{ duration: 0.4, delay: 0.7 }}
                    viewport={{ once: true }}
                    whileInView={{ opacity: 1, scale: 1 }}
                  >
                    <div className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-full shadow-lg ring-2 ring-white/30 backdrop-blur-sm">
                      <span className="tracking-wider">FREE</span>
                    </div>
                  </motion.div>

                  <h4 className="text-4xl font-bold mb-3 text-primary text-shadow-subtle">
                    $5 Free Credits
                  </h4>
                  <p className="text-lg font-medium text-accent-highlight">
                    Test Plan Editor, Merge Instructions, Terminal Integration
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Enough to generate 50+ implementation plans. Auto top-off when you're convinced.
                  </p>
                </Reveal>

                <Reveal delay={0.3}>
                  <div className="flex flex-col items-center">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <PlatformDownloadSection 
                        location="pricing"
                        className="w-full sm:w-auto"
                      />
                    </motion.div>
                  </div>
                </Reveal>
              </div>
            </GlassCard>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}