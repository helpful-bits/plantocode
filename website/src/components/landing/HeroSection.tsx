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
          <span className="text-hero-title">
            The Polite Context Guidance Centre for Somewhat Bewildered AI Agents
          </span>
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
            You know the feeling. You're "vibe coding" with an AI agent—it's magical until it's not. The agent gets lost, ignores instructions, and you become a babysitter. Vibe Manager curates perfect context so your AI agents can finally do their job.
          </p>
        </motion.div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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