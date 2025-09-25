'use client';

import React from 'react';
import { motion } from 'framer-motion';

function CredibilityStrip() {
  return (
    <section className="relative py-8 sm:py-10 px-4 overflow-hidden">
      <div className="container mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <p className="text-lg sm:text-xl text-foreground/80 font-medium">
            Planning layer trusted by <strong>users of coding agents</strong> (codex, claude, cursor, gemini).
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              Plan Modes
            </span>
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              Architecture
            </span>
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              Changelog
            </span>
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              Terminal
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export { CredibilityStrip };
export default CredibilityStrip;