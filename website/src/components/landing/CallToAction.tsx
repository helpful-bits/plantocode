'use client';

import { Button } from '@/components/ui/button';
import { CALENDLY_URL } from '@/lib/brand';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { CheckCircle2, Zap } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { useMessages } from '@/components/i18n/useMessages';

export function CallToAction() {
  const { t } = useMessages();


  return (
    <section className="relative py-16 sm:py-20 md:py-24 lg:py-32 px-4 overflow-hidden">
      <motion.div
        className="absolute inset-0 z-0 burst-radial"
        initial={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true, amount: 0.3 }}
        whileInView={{ opacity: 1 }}
      />

      <div className="container mx-auto relative z-10">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          viewport={{ once: true, amount: 0.3 }}
          whileInView="visible"
          variants={{
            hidden: { opacity: 0, scale: 0.95, y: 30 },
            visible: {
              opacity: 1,
              scale: 1,
              y: 0,
              transition: {
                duration: 0.6,
                ease: [0.4, 0, 0.2, 1],
              },
            },
          }}
        >
          <motion.div
            className="relative group"
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >

            <GlassCard className="relative" highlighted={true}>
              <div className="text-center p-8 sm:p-12 md:p-16 relative">
                {/* Enhanced burst pattern overlay */}
                <div className="absolute inset-0 opacity-8 pointer-events-none">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,_hsl(var(--primary))_1px,_transparent_1px)] bg-[size:32px_32px]" />
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: `radial-gradient(circle at center, 
                        transparent 30%, 
                        oklch(0.68 0.085 195 / 0.05) 50%, 
                        transparent 70%),
                      conic-gradient(from 0deg at 50% 50%, 
                        oklch(0.68 0.085 195 / 0.03) 0deg,
                        transparent 20deg,
                        oklch(0.68 0.085 195 / 0.03) 40deg,
                        transparent 60deg,
                        oklch(0.68 0.085 195 / 0.03) 80deg,
                        transparent 100deg,
                        oklch(0.68 0.085 195 / 0.03) 120deg,
                        transparent 140deg,
                        oklch(0.68 0.085 195 / 0.03) 160deg,
                        transparent 180deg,
                        oklch(0.68 0.085 195 / 0.03) 200deg,
                        transparent 220deg,
                        oklch(0.68 0.085 195 / 0.03) 240deg,
                        transparent 260deg,
                        oklch(0.68 0.085 195 / 0.03) 280deg,
                        transparent 300deg,
                        oklch(0.68 0.085 195 / 0.03) 320deg,
                        transparent 340deg,
                        oklch(0.68 0.085 195 / 0.03) 360deg)`,
                    }}
                  />
                </div>

                <Reveal className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-primary/10 dark:bg-primary/15 text-primary mb-4 sm:mb-6 text-xs sm:text-sm font-medium" delay={0.1}>
                  <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{t('cta.badge', 'Human-in-the-loop AI Planning')}</span>
                </Reveal>

                <Reveal as="h2" className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl mb-4 sm:mb-6 text-primary-emphasis relative z-10 font-bold" delay={0.15}>
                  {t('cta.title', 'Ready to coordinate your next implementation plan?')}
                </Reveal>

                <Reveal as="p" className="text-base sm:text-lg md:text-xl lg:text-2xl mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 relative z-10" delay={0.2}>
                  {t('cta.description', 'Plan, review, and run AI-assisted changes from one workspace. Keep models, prompts, files, and terminal output aligned.')}
                </Reveal>

                <Reveal delay={0.25}>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <PlatformDownloadSection
                        location="cta_section"
                        redirectToDownloadPage={true}
                      />
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button asChild variant="outline" size="lg">
                        <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                          {t('cta.buttons.talk', 'Talk to an Architect')}
                        </a>
                      </Button>
                    </motion.div>
                  </div>
                </Reveal>

                <Reveal className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-xs sm:text-sm text-foreground/60" delay={0.3}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary/70" />
                    <span>{t('cta.features.noCard', 'No credit card required')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary/70" />
                    <span>{t('cta.features.instant', 'Start working instantly')}</span>
                  </div>
                </Reveal>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}