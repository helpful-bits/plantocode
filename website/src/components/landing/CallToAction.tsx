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
          whileInView={{ opacity: 1, scale: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ 
            duration: 0.6, 
            ease: [0.4, 0, 0.2, 1]
          }}
          style={{ 
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform, opacity'
          }}
        >
          <motion.div
            className="relative"
            whileHover={{ scale: 1.015 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ 
              transform: 'translate3d(0, 0, 0)',
              willChange: 'transform'
            }}
          >
            
            <GlassCard highlighted={true} className="relative">
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
                        oklch(0.68 0.085 195 / 0.03) 360deg)`
                    }}
                  />
                </div>
                
                <motion.h2 
                  className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl mb-6 text-primary-emphasis relative z-10"
                  initial={{ opacity: 0, y: 20, transform: 'translate3d(0, 0, 0)' }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
                  viewport={{ once: true }}
                  transition={{ 
                    duration: 0.5, 
                    delay: 0.2,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                  style={{ 
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity'
                  }}
                >
                  {title}
                </motion.h2>
                
                <motion.p 
                  className="text-lg sm:text-xl lg:text-2xl mb-10 max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80 relative z-10"
                  initial={{ opacity: 0, y: 15, transform: 'translate3d(0, 0, 0)' }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ 
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity'
                  }}
                >
                  {description}
                </motion.p>
                
                <motion.div
                  initial={{ opacity: 0, y: 15, transform: 'translate3d(0, 0, 0)' }}
                  whileInView={{ opacity: 1, y: 0, transform: 'translate3d(0, 0, 0)' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  style={{ 
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'transform, opacity'
                  }}
                >
                  <Button 
                    asChild 
                    variant="primary"
                    size="xl"
                  >
                    <Link href={buttonLink} className="flex items-center gap-3">
                      <span>{buttonText}</span>
                      <svg 
                        className="w-5 h-5" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </Button>
                </motion.div>
                
                {/* Additional visual cues */}
                <motion.div
                  className="mt-8 flex items-center justify-center gap-8 text-sm text-foreground/60"
                  initial={{ opacity: 0, transform: 'translate3d(0, 0, 0)' }}
                  whileInView={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.45, ease: [0.4, 0, 0.2, 1] }}
                  style={{ 
                    transform: 'translate3d(0, 0, 0)',
                    willChange: 'opacity'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Setup in 5 minutes</span>
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