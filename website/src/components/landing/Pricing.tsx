'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';

export function Pricing() {
  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Direct redirect to API - server-side handles all tracking (Plausible + Twitter/X + GA4)
    window.location.href = '/api/download/mac?source=pricing';
  };

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden perspective-1000" id="pricing">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold text-shadow-subtle">
            No-Nonsense Pricing
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-description-muted" delay={0.1}>
            Let's be frank: LLM API tokens add up. But you'll know exactly what you're spending. Every operation reports its exact token cost in real-time, so you're always in control.
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
                    Pay For What You Use
                  </h3>
                  <p className="text-lg mb-8 text-muted-foreground">
                    Start with free credits on us. After that, it's pure pay-as-you-go. No subscriptions. No hidden fees.
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
                    Free Welcome Credits
                  </h4>
                  <p className="text-lg font-medium text-accent-highlight">
                    To Try All Features & Models
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    New users get free credits (3-day expiration). Auto top-off is available.
                  </p>
                </Reveal>

                <Reveal delay={0.3}>
                  <div className="flex flex-col items-center">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        className="w-full sm:w-auto"
                        size="xl"
                        variant="cta"
                        onClick={handleDownloadClick}
                      >
                        <span className="no-hover-effect cursor-pointer">
                          Download for Mac
                        </span>
                      </Button>
                    </motion.div>
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <em className="text-xs text-muted-foreground">Signed & notarized for macOS - safer installs via Gatekeeper.</em>
                      <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-sm text-muted-foreground underline hover:text-primary transition-colors">Join the Windows waitlist</a>
                    </div>
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