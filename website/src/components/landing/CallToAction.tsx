'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';
import { CheckCircle2, Zap } from 'lucide-react';

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {
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
              <div className="text-center p-16 relative">
                {/* Enhanced burst pattern overlay */}
                <div className="absolute inset-0 opacity-8">
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

                <motion.div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 dark:bg-primary/15 text-primary mb-6 text-sm font-medium"
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      transition: { duration: 0.5, delay: 0.2 },
                    },
                  }}
                >
                  <Zap className="w-4 h-4" />
                  <span>Transform Your Development Today</span>
                </motion.div>

                <motion.h2
                  className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl mb-6 text-primary-emphasis relative z-10"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: 0.5,
                        delay: 0.2,
                        ease: [0.4, 0, 0.2, 1],
                      },
                    },
                  }}
                >
                  {title}
                </motion.h2>

                <motion.p
                  className="text-lg sm:text-xl lg:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 relative z-10"
                  variants={{
                    hidden: { opacity: 0, y: 15 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, delay: 0.25, ease: [0.4, 0, 0.2, 1] },
                    },
                  }}
                >
                  {description}
                </motion.p>

                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 15 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, delay: 0.35, ease: [0.4, 0, 0.2, 1] },
                    },
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    asChild
                    size="xl"
                    variant="primary"
                  >
                    <Link className="inline-flex items-center justify-center gap-3" href={buttonLink}>
                      {buttonText}
                      <svg
                        className="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M13 7l5 5m0 0l-5 5m5-5H6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                      </svg>
                    </Link>
                  </Button>
                </motion.div>

                <motion.div
                  className="mt-8 flex items-center justify-center gap-8 text-sm text-foreground/60"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { duration: 0.5, delay: 0.45, ease: [0.4, 0, 0.2, 1] },
                    },
                  }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary/70" />
                    <span>Free forever</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary/70" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary/70" />
                    <span>Start working instantly</span>
                  </div>
                </motion.div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}