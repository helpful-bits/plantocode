'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion, AnimatePresence } from 'framer-motion';
import Reveal from '@/components/motion/Reveal';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="faq">
      <div className="container mx-auto max-w-3xl relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis">
            Frequently Asked Questions
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80" delay={0.05}>
            Everything you need to know about Vibe Manager
          </Reveal>
        </div>

        <div className="space-y-8">
          {items.map((item, index) => (
            <Reveal
              key={index}
              delay={0.1 + index * 0.05}
            >
              <motion.div
                className="faq-item"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                whileHover={{ scale: 1.02 }}
              >
              <GlassCard className="overflow-hidden">
                <motion.div
                  initial={{ backgroundColor: 'rgba(0, 0, 0, 0)' }}
                  animate={{
                    backgroundColor: openIndex === index ? 'rgba(var(--primary-rgb), 0.02)' : 'rgba(0, 0, 0, 0)',
                  }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <motion.button
                    className="w-full px-4 py-4 sm:p-6 text-left flex justify-between items-center group relative"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  >
                    <span
                      className={`font-semibold text-lg text-foreground pr-4 ${
                        openIndex === index ? 'text-primary' : ''
                      }`}
                    >
                      {item.question}
                    </span>
                    <motion.div
                      animate={{
                        scale: openIndex === index ? 1.1 : 1,
                        rotate: openIndex === index ? 180 : 0,
                      }}
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center relative"
                      transition={{
                        duration: 0.4,
                        type: 'spring',
                        damping: 15,
                        stiffness: 200,
                      }}
                    >
                      <div
                        className={`absolute inset-0 rounded-full ${
                          openIndex === index
                            ? 'bg-gradient-to-br from-primary/30 to-primary/40'
                            : 'bg-gradient-to-br from-primary/5 to-primary/10'
                        }`}
                      />
                      <div
                        className={`absolute inset-0 rounded-full ring-1 ${
                          openIndex === index ? 'ring-primary/40' : 'ring-primary/15'
                        }`}
                      />
                      <svg
                        className="w-5 h-5 relative z-10 text-primary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M19 9l-7 7-7-7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                    </motion.div>
                  </motion.button>

                  <AnimatePresence mode="wait">
                    {openIndex === index && (
                      <motion.div
                        animate={{
                          height: 'auto',
                          opacity: 1,
                          transition: {
                            height: {
                              duration: 0.3,
                              ease: [0.25, 0.46, 0.45, 0.94],
                            },
                            opacity: {
                              duration: 0.25,
                              delay: 0.1,
                              ease: 'easeOut',
                            },
                          },
                        }}
                        className="overflow-hidden"
                        exit={{
                          height: 0,
                          opacity: 0,
                          transition: {
                            height: {
                              duration: 0.25,
                              ease: [0.25, 0.46, 0.45, 0.94],
                            },
                            opacity: {
                              duration: 0.15,
                              ease: 'easeIn',
                            },
                          },
                        }}
                        initial={{ height: 0, opacity: 0 }}
                      >
                        <div className="px-4 pb-4 sm:px-6 sm:pb-6 text-foreground leading-relaxed">
                          <div className="border-l-2 border-primary/20 pl-4">
                            {item.answer}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </GlassCard>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}