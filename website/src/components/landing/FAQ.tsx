'use client';

import React, { useState, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationOrchestrator, animationVariants } from '@/hooks/useAnimationOrchestrator';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { isInView } = useAnimationOrchestrator(sectionRef);

  return (
    <section ref={sectionRef} className="relative py-16 px-4 overflow-hidden" id="faq">
      <div className="container mx-auto max-w-3xl relative z-10">
        <motion.div
          className="text-center mb-12"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={animationVariants.section}
        >
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis"
            variants={animationVariants.item}
          >
            Frequently Asked Questions
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80"
            variants={animationVariants.item}
          >
            Everything you need to know about Vibe Manager
          </motion.p>
        </motion.div>

        <motion.div
          className="space-y-4 p-2"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.06,
                delayChildren: 0.2,
              },
            },
          }}
        >
          {items.map((item, index) => (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  },
                },
              }}
              className="faq-item"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <GlassCard className="overflow-hidden">
                <motion.div
                  animate={{
                    backgroundColor: openIndex === index ? 'rgba(var(--primary-rgb), 0.02)' : 'transparent',
                  }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <motion.button
                    className="w-full p-6 text-left flex justify-between items-center transition-colors duration-200 group relative"
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span
                      className={`font-semibold text-lg text-foreground pr-4 transition-colors duration-200 ${
                        openIndex === index ? 'text-primary' : ''
                      }`}
                    >
                      {item.question}
                    </span>
                    <motion.div
                      className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center relative"
                      animate={{
                        scale: openIndex === index ? 1.1 : 1,
                        rotate: openIndex === index ? 180 : 0
                      }}
                      transition={{
                        duration: 0.4,
                        type: "spring",
                        damping: 15,
                        stiffness: 200,
                      }}
                    >
                      <div
                        className={`absolute inset-0 rounded-full transition-all duration-300 ${
                          openIndex === index
                            ? 'bg-gradient-to-br from-primary/30 to-primary/40'
                            : 'bg-gradient-to-br from-primary/5 to-primary/10'
                        }`}
                      />
                      <div
                        className={`absolute inset-0 rounded-full ring-1 transition-colors duration-300 ${
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
                        initial={{ height: 0, opacity: 0 }}
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
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 text-foreground leading-relaxed">
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
          ))}
        </motion.div>
      </div>
    </section>
  );
}