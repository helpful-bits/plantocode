'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion, AnimatePresence } from 'framer-motion';

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
    <section className="relative py-16 px-4 overflow-hidden" id="faq">

      <div className="container mx-auto max-w-3xl relative z-10">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis"
            initial={{ opacity: 0, scale: 0.85 }}
            transition={{
              duration: 0.7,
              delay: 0.1,
              type: 'spring',
              damping: 15,
              stiffness: 100,
            }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, scale: 1 }}
          >
            Frequently Asked Questions
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80"
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            Everything you need to know about Vibe Manager
          </motion.p>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1 }}
        >
          {items.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{
                duration: 0.6,
                delay: index * 0.08,
                type: 'spring',
                damping: 20,
                stiffness: 100,
              }}
              viewport={{ once: true, margin: '-50px' }}
              whileHover={{ scale: 1.02 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
            >
              <GlassCard className="overflow-hidden will-change-transform">
                <motion.div
                  animate={{
                    backgroundColor: openIndex === index ? 'rgba(var(--primary-rgb), 0.02)' : 'transparent',
                  }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                >
                  <motion.button
                    className="w-full p-6 text-left flex justify-between items-center transition-all duration-300 group relative"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  >
                    <motion.span
                      animate={{
                        color: openIndex === index ? 'hsl(var(--primary))' : 'currentColor',
                      }}
                      className="font-semibold text-lg text-foreground pr-4 transition-colors duration-300"
                    >
                      {item.question}
                    </motion.span>
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
                      <motion.div
                        animate={{
                          background: openIndex === index
                            ? 'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.4))'
                            : 'linear-gradient(135deg, hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.1))',
                        }}
                        className="absolute inset-0 rounded-full"
                        transition={{ duration: 0.3 }}
                      />
                      <motion.div
                        animate={{
                          borderColor: openIndex === index
                            ? 'hsl(var(--primary) / 0.4)'
                            : 'hsl(var(--primary) / 0.15)',
                        }}
                        className="absolute inset-0 rounded-full ring-1"
                        transition={{ duration: 0.3 }}
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
                              duration: 0.4,
                              ease: [0.23, 1, 0.32, 1],
                            },
                            opacity: {
                              duration: 0.3,
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
                              duration: 0.3,
                              ease: [0.23, 1, 0.32, 1],
                            },
                            opacity: {
                              duration: 0.2,
                              ease: 'easeIn',
                            },
                          },
                        }}
                        initial={{ height: 0, opacity: 0 }}
                      >
                        <motion.div
                          animate={{
                            y: 0,
                            transition: {
                              duration: 0.4,
                              delay: 0.1,
                              ease: [0.23, 1, 0.32, 1],
                            },
                          }}
                          className="px-6 pb-6 text-foreground leading-relaxed"
                          exit={{
                            y: -10,
                            transition: {
                              duration: 0.2,
                              ease: 'easeIn',
                            },
                          }}
                          initial={{ y: -10 }}
                        >
                          <div className="border-l-2 border-primary/20 pl-4">
                            {item.answer}
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}