'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { cdnUrl } from '@/lib/cdn';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  FileText, 
  Zap, 
  Monitor, 
  Settings, 
  CreditCard,
  Copy,
  DollarSign,
  X,
  Maximize2
} from 'lucide-react';

interface ScreenshotCard {
  id: string;
  title: string;
  description: string;
  image: string;
  icon: React.ReactNode;
  features?: string[];
  aspectRatio?: string; // Custom aspect ratio for each image
}

const screenshots: ScreenshotCard[] = [
  {
    id: 'file-finder',
    title: 'Stop Playing Hide and Seek',
    description: 'Codebase sprawling. Files everywhere. AI reading, understanding, connecting. Finding the needles in your haystack. One click.',
    image: cdnUrl('/assets/images/demo-file-finder.jpg'),
    icon: <Search className="w-5 h-5" />,
    aspectRatio: '1478/1364',
    features: [
      'AI reads actual code, not just names',
      'Finds dependencies you forgot existed',
      'From 1,000 files to the 10 that matter',
      'Stop grepping. Start shipping.'
    ]
  },
  {
    id: 'file-finder-workflow',
    title: 'Find Once. Use Forever.',
    description: 'Three stages of discovery. Every result saved. Every file list reusable. Nothing lost, everything ready when you need it again.',
    image: cdnUrl('/assets/images/demo-file-finder-workflow.jpg'),
    icon: <Search className="w-5 h-5" />,
    aspectRatio: '608/980',
    features: [
      'Results persist across sessions',
      '"Use Files" - instant context reuse',
      'Build your knowledge base over time',
      'Never search for the same files twice'
    ]
  },
  {
    id: 'implementation-plans',
    title: 'All Models. All At Once.',
    description: 'Claude thinking. GPT-5 analyzing. Gemini processing. Same task, different approaches. Pick the winner. Or merge them all.',
    image: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
    icon: <FileText className="w-5 h-5" />,
    aspectRatio: '1714/1574',
    features: [
      '15+ models ready to compete',
      'See the cost before you commit',
      'Parallel execution - why wait?',
      'Best ideas win, bad ideas die'
    ]
  },
  {
    id: 'background-tasks',
    title: 'Watch Your Money Work',
    description: 'Plans generating. Tokens flowing. Costs accumulating. Everything visible, nothing hidden. Cancel anytime.',
    image: cdnUrl('/assets/images/demo-background-tasks.jpg'),
    icon: <Zap className="w-5 h-5" />,
    aspectRatio: '642/1654',
    features: [
      'Live progress, real numbers',
      'Token counts updating in real-time',
      'Know if it\'s worth the wait',
      'Pull the plug before it gets expensive'
    ]
  },
  {
    id: 'plans-monitor',
    title: 'Claude Code Agents. Working in Parallel.',
    description: 'Multiple terminals. Separate Claude Code instances. All running locally, implementing your plans. Your machine, your code, total visibility.',
    image: cdnUrl('/assets/images/demo-plans-monitor.jpg'),
    icon: <Monitor className="w-5 h-5" />,
    aspectRatio: '642/1362',
    features: [
      'Multiple Claude Code instances running locally',
      'Parallel execution on your machine',
      'Each agent implementing parts of your plan',
      'Watch all terminals simultaneously'
    ]
  },
  {
    id: 'settings-prompts',
    title: 'Your Tool. Your Rules.',
    description: 'System prompts exposed. Every stage customizable. Change how it thinks. Make it work your way.',
    image: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
    icon: <Settings className="w-5 h-5" />,
    aspectRatio: '1838/1626',
    features: [
      'Edit prompts at every stage',
      'Save configs per project',
      'Toggle between custom and default',
      'Control every decision'
    ]
  },
  {
    id: 'copy-buttons',
    title: 'Workflows. One Click.',
    description: 'That Claude prompt that always works? That agent setup you perfected? Button it. Ship it. Stop copy-pasting.',
    image: cdnUrl('/assets/images/demo-copy-buttons.jpg'),
    icon: <Copy className="w-5 h-5" />,
    aspectRatio: '1160/2020',
    features: [
      'Any prompt becomes a button',
      'Smart templates with placeholders',
      'Complex workflows, instant launch',
      'Your best tricks, always ready'
    ]
  },
  {
    id: 'billing-transactions',
    title: 'Every Penny. Tracked.',
    description: 'No subscriptions. No surprises. Pay per use. Every call logged. Every cost visible. Total transparency.',
    image: cdnUrl('/assets/images/demo-billing-transactions.jpg'),
    icon: <CreditCard className="w-5 h-5" />,
    aspectRatio: '1822/1604',
    features: [
      '686 calls, all itemized',
      'Real costs, not estimates',
      'Export for accounting',
      'Know before you overspend'
    ]
  },
  {
    id: 'billing-usage',
    title: 'Who\'s Burning Your Cash?',
    description: 'GPT-5: $6.61. Gemini: $2.88. Claude: $0.50. Same task, different bills. Now you know.',
    image: cdnUrl('/assets/images/demo-billing-usage.jpg'),
    icon: <DollarSign className="w-5 h-5" />,
    aspectRatio: '1838/1626',
    features: [
      'Model costs, side by side',
      'Token hogs exposed',
      'Track spending patterns',
      'Pick winners, drop losers'
    ]
  }
];

export function ScreenshotGallery() {
  const [selectedImage, setSelectedImage] = useState<ScreenshotCard | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-primary">
            This Is What You Get
          </h2>
          <p className="text-lg text-description-muted max-w-3xl mx-auto">
            No mockups. No concepts. These are actual screenshots from actual sessions.
            This is the tool you'll use tomorrow.
          </p>
        </div>

        {/* Masonry Grid Layout */}
        <div className="columns-1 md:columns-2 lg:columns-3 gap-5 space-y-5">
          {screenshots.map((screenshot, index) => (
            <motion.div
              key={screenshot.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.6, 
                delay: index * 0.08,
                ease: [0.21, 0.47, 0.32, 0.98]
              }}
              className="break-inside-avoid group"
            >
              <div className="bg-card/90 dark:bg-card/80 backdrop-blur-md border border-border/50 dark:border-border/40 rounded-2xl overflow-hidden hover:border-primary/30 transition-all duration-500 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 cursor-pointer">
                {/* Image Section with Dynamic Height */}
                <div 
                  className="relative bg-gradient-to-br from-background/20 via-transparent to-background/20 p-3"
                  onClick={() => setSelectedImage(screenshot)}
                >
                  <div 
                    className="relative rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300"
                    style={{ aspectRatio: screenshot.aspectRatio }}
                  >
                    <Image
                      src={screenshot.image}
                      alt={screenshot.title}
                      fill
                      className="object-contain bg-background/30"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      quality={85}
                    />
                    {/* Subtle Hover Indicator */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-500 transform scale-90 group-hover:scale-100">
                      <div className="bg-background/70 backdrop-blur-md rounded-full p-1.5 shadow-sm border border-border/30">
                        <Maximize2 className="w-3.5 h-3.5 text-primary/60" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-5 space-y-3.5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/20 dark:bg-primary/10 text-primary dark:text-primary">
                      {screenshot.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground mb-1.5">
                        {screenshot.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {screenshot.description}
                      </p>
                    </div>
                  </div>

                  {/* Features List */}
                  {screenshot.features && (
                    <ul className="space-y-1.5 pt-3 border-t border-border/20">
                      {screenshot.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary/50 mt-0.5 text-xs">●</span>
                          <span className="leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-20 text-center">
          <p className="text-lg text-muted-foreground mb-6">
            Ready to ship better code, faster?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button asChild size="lg" variant="cta">
                <Link href="/api/download/mac?source=demo_screenshots">
                  Download for Mac
                </Link>
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button asChild size="lg" variant="gradient-outline">
                <Link href="/demo">
                  Try Interactive Demo
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal - Rendered in Portal */}
      {mounted && selectedImage && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/98 backdrop-blur-xl"
            style={{ 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh'
            }}
            onClick={() => setSelectedImage(null)}
          >
            {/* Close Button - Fixed position */}
            <button
              onClick={() => setSelectedImage(null)}
              className="fixed top-4 right-4 p-3 rounded-full bg-background/90 hover:bg-background border border-border/50 hover:border-primary/50 transition-all z-[51] shadow-lg"
              style={{ position: 'fixed', top: '1rem', right: '1rem' }}
            >
              <X className="w-6 h-6" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative flex items-center justify-center"
              style={{ width: '90vw', height: '90vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Full Size Image - Fixed sizing */}
              <Image
                src={selectedImage.image}
                alt={selectedImage.title}
                width={1920}
                height={1080}
                className="object-contain max-w-full max-h-full w-auto h-auto"
                style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                quality={95}
                priority
              />

              {/* Title Overlay - Bottom */}
              <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none">
                <div className="bg-card/95 dark:bg-background/90 backdrop-blur-md rounded-xl px-6 py-3 shadow-lg border border-border/50 dark:border-border/30 max-w-2xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20 dark:bg-primary/10 text-primary dark:text-primary">
                      {selectedImage.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {selectedImage.title}
                    </h3>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}