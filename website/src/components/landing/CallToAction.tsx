'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion } from 'framer-motion';

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {

  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* Radial burst background pattern */}
      <div className="absolute inset-0 z-0 burst-radial burst-animated" />

      <div className="container mx-auto relative z-10">
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, scale: 0.95, y: 30, transform: 'translate3d(0, 0, 0)' }}
          style={{
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform, opacity',
          }}
          transition={{
            duration: 0.6,
            ease: [0.4, 0, 0.2, 1],
          }}
          viewport={{ once: true, margin: '-100px' }}
          whileInView={{ opacity: 1, scale: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
        >
          <motion.div
            className="relative"
            style={{
              transform: 'translate3d(0, 0, 0)',
              willChange: 'transform',
            }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ scale: 1.015 }}
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

                <motion.h2
                  className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl mb-6 text-primary-emphasis relative z-10"
                  initial={{ opacity: 0, y: 20, transform: 'translate3d(0, 0, 0)' }}
                  style={{
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity',
                  }}
                  transition={{
                    duration: 0.5,
                    delay: 0.2,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
                >
                  {title}
                </motion.h2>

                <motion.p
                  className="text-lg sm:text-xl lg:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 relative z-10"
                  initial={{ opacity: 0, y: 15, transform: 'translate3d(0, 0, 0)' }}
                  style={{
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity',
                  }}
                  transition={{ duration: 0.5, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
                >
                  {description}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 15, transform: 'translate3d(0, 0, 0)' }}
                  style={{
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity',
                  }}
                  transition={{ duration: 0.5, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
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

                {/* Additional visual cues */}
                <motion.div
                  className="mt-8 flex items-center justify-center gap-8 text-sm text-foreground/60"
                  initial={{ opacity: 0, transform: 'translate3d(0, 0, 0)' }}
                  style={{
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'opacity',
                  }}
                  transition={{ duration: 0.5, delay: 0.45, ease: [0.4, 0, 0.2, 1] }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                    </svg>
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                    </svg>
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