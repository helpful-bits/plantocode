'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { cdnUrl } from '@/lib/cdn';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { 
  Search, 
  FileText, 
  Zap, 
  Settings, 
  CreditCard,
  Copy,
  X,
  Maximize2,
  Video
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
    description: 'Your codebase is vast. Thousand files. AI reads, understands, and connects the dots - finding exactly what you need with one click.',
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
    title: 'Find It. Keep It.',
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
    id: 'video-analysis',
    title: 'Show. Don\'t Tell.',
    description: 'Record your screen. Add voice notes. AI watches every frame, understands your workflow, and generates implementation plans from what it sees.',
    image: cdnUrl('/assets/images/demo-video-analysis.jpg'),
    icon: <Video className="w-5 h-5" />,
    aspectRatio: '1024/1366',
    features: [
      'Record up to 2 minutes of workflow',
      'Include voice dictation for context',
      'AI analyzes frame by frame',
      'Turn demos into detailed specs'
    ]
  },
  {
    id: 'implementation-plans',
    title: 'Every Model. One Click.',
    description: 'Generate multiple plans with one click. Review and edit each approach. Don\'t like something? Add merge instructions to refine it. Combine the best ideas into one blueprint for Claude Code, Cursor, or OpenAI Codex.',
    image: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
    icon: <FileText className="w-5 h-5" />,
    aspectRatio: '1714/1574',
    features: [
      'Click multiple times for more plans',
      'Review and edit each approach',
      'Merge the best ideas together',
      'Export to Claude Code, Cursor, or OpenAI Codex'
    ]
  },
  {
    id: 'background-tasks',
    title: 'Track Every Penny',
    description: 'Plans generating. Tokens counting. Full transparency. Cancel anytime.',
    image: cdnUrl('/assets/images/demo-background-tasks.jpg'),
    icon: <Zap className="w-5 h-5" />,
    aspectRatio: '642/1654',
    features: [
      'Live progress and costs',
      'Real-time token counts',
      'Know if it\'s worth the wait',
      'Stop before it gets expensive'
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
      <div className="py-8 max-w-7xl mx-auto">
        {/* Structured Single-Column Layout */}
        <div className="space-y-20">
          {screenshots.map((screenshot, index) => (
            <motion.div
              key={screenshot.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.7, 
                delay: index * 0.15,
                ease: [0.21, 0.47, 0.32, 0.98]
              }}
              className="group"
            >
              <GlassCard 
                className="!p-0 !rounded-3xl hover:shadow-2xl hover:shadow-primary/20"
                highlighted={index === 0}
              >
                <div className={`lg:flex ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
                  {/* Content Section - Left/Right alternating */}
                  <div className="lg:w-2/5 p-8 lg:p-12 flex flex-col justify-center">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="p-3 rounded-2xl bg-primary/15 dark:bg-primary/20 text-primary [&>svg]:w-8 [&>svg]:h-8">
                        {screenshot.icon}
                      </div>
                      <h3 className="text-3xl lg:text-4xl font-bold text-foreground">
                        {screenshot.title}
                      </h3>
                    </div>
                    
                    <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                      {screenshot.description}
                    </p>

                    {/* Features List */}
                    {screenshot.features && (
                      <ul className="space-y-3">
                        {screenshot.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-3">
                            <span className="text-primary flex-shrink-0">✓</span>
                            <span className="text-base text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Image Section - Right/Left alternating */}
                  <div 
                    className="lg:w-3/5 bg-gradient-to-br from-background/50 to-background/20 p-6 lg:p-8 cursor-pointer"
                    onClick={() => setSelectedImage(screenshot)}
                  >
                    <div className="relative rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-primary/20 dark:border-primary/25 bg-background/50">
                      <div 
                        className="relative"
                        style={{ 
                          aspectRatio: screenshot.aspectRatio || '16/10',
                          maxWidth: (screenshot.id === 'file-finder-workflow' || screenshot.id === 'background-tasks' || screenshot.id === 'plans-monitor') ? '400px' : undefined,
                          margin: (screenshot.id === 'file-finder-workflow' || screenshot.id === 'background-tasks' || screenshot.id === 'plans-monitor') ? '0 auto' : undefined
                        }}
                      >
                        <Image
                          src={screenshot.image}
                          alt={screenshot.title}
                          fill
                          className={`object-contain ${
                            screenshot.id === 'copy-buttons' ? 'mobile-zoom-pan-zigzag' :
                            (screenshot.id === 'settings-prompts' || screenshot.id === 'implementation-plans') ? 'mobile-zoom-pan-horizontal' : 
                            (screenshot.id === 'file-finder' || screenshot.id === 'video-analysis' || screenshot.id === 'billing-transactions') ? 'mobile-zoom-pan' : ''
                          }`}
                          sizes="(max-width: 768px) 100vw, 60vw"
                          quality={90}
                          priority={index < 2}
                        />
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                          <div className="bg-background/95 backdrop-blur-md rounded-full px-4 py-2 shadow-lg border border-primary/30 dark:border-primary/40 flex items-center gap-2">
                            <Maximize2 className="w-4 h-4" />
                            <span className="text-sm font-medium">View full size</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-20 text-center">
          <p className="text-lg text-muted-foreground mb-6">
            Ready to ship better code, faster?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center"
            >
              <PlatformDownloadSection 
                location="demo_screenshots"
                redirectToDownloadPage={true}
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center"
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
              className="fixed top-4 right-4 p-3 rounded-full glass border border-primary/30 hover:border-primary/50 transition-all z-[51] shadow-lg"
              style={{ position: 'fixed', top: '1rem', right: '1rem' }}
            >
              <X className="w-6 h-6 text-foreground" />
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
                <div className="glass backdrop-blur-md rounded-xl px-6 py-3 shadow-lg border border-primary/30 dark:border-primary/40 max-w-2xl">
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