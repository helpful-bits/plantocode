'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { useMessages } from '@/components/i18n/useMessages';

export function Pricing() {
  const { t } = useMessages();

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden perspective-1000" id="pricing">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-4xl sm:text-5xl lg:text-6xl mb-6 text-primary-emphasis font-bold text-shadow-subtle">
            {t('pricing.title', 'Built for Professional Development')}
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-description-muted" delay={0.1}>
            {t('pricing.subtitle', 'Pay only for AI inference with transparent token costs. Watch your ROI in real-time - one saved production incident pays for months of usage.')}
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
                    {t('pricing.card.title', 'Transparent Pricing')}
                  </h3>
                  <p className="text-lg mb-8 text-muted-foreground">
                    {t('pricing.card.description', 'Start with usage-based pricing to validate results. No subscriptions. Just transparent API costs.')}
                  </p>
                </Reveal>

                <Reveal className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 mb-8 ring-1 ring-primary/20" delay={0.25}>
                  <h4 className="text-4xl font-bold mb-3 text-primary text-shadow-subtle">
                    {t('pricing.card.pricing.title', 'Usage-Based Pricing')}
                  </h4>
                  <p className="text-lg font-medium text-accent-highlight">
                    {t('pricing.card.pricing.subtitle', 'Pay only for what you use.')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('pricing.card.pricing.description', 'Test Plan Editor, Merge Instructions, Terminal Integration. Auto top-off when you\'re convinced.')}
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