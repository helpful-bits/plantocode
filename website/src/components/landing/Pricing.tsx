'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { usePlausible } from '@/hooks/usePlausible';

export function Pricing() {
  const { trackEvent } = usePlausible();

  const handleDownloadClick = () => {
    trackEvent('download_click', { location: 'pricing' });
  };

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden perspective-1000" id="pricing">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold text-shadow-subtle">
            No-Nonsense Pricing
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-description-muted" delay={0.1}>
            Let's be frank: with heavy use, LLM API tokens can cost $100+ a month. But this investment pays for itself in productivity and peace of mind. Every operation reports its exact token cost in real-time, so you are always in control.
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
                        asChild
                        className="w-full sm:w-auto"
                        size="xl"
                        variant="cta"
                        onClick={handleDownloadClick}
                      >
                        <Link href="/download" prefetch={false} className="no-hover-effect cursor-pointer">
                          Download for Mac
                        </Link>
                      </Button>
                    </motion.div>
                    <span className="text-xs text-muted-foreground mt-2">Windows coming soon</span>
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