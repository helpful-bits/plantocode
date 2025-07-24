'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function HeroSection() {

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-transparent">
      <div className="relative text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Primary heading */}
        <motion.h1
          className="relative text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <span className="text-hero-title">
              AI-Powered Context Curation
            </span>
          </motion.span>
          <br />
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <span className="text-subtitle-soft">for</span>{' '}
            <span className="text-accent-highlight">
              Large Codebases
            </span>
          </motion.span>
        </motion.h1>

        {/* Subtitle */}
        <motion.div
          className="relative mb-8 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.7, delay: 0.6 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="relative text-lg sm:text-xl text-description-muted leading-relaxed">
            Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase.
            4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
          </p>
        </motion.div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <Button asChild className="relative overflow-hidden" size="xl" variant="cta">
              <Link href="/download">
                Download Vibe Manager Free
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.9 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <Button asChild size="lg" variant="gradient-outline">
              <Link href="#features">
                Learn More
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>

    </section>
  );
}