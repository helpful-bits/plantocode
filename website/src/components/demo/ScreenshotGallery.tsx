'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { cdnUrl } from '@/lib/cdn';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';
import {
  Search,
  FileText,
  Zap,
  Settings,
  CreditCard,
  Copy,
  X,
  Maximize2,
  Video,
  Play
} from 'lucide-react';

interface ScreenshotCard {
  id: string;
  title: string;
  description: string;
  image: string;
  icon: React.ReactNode;
  features?: string[];
  aspectRatio?: string | undefined; // Custom aspect ratio for each image
}

interface ScreenshotDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  featuresKey: string;
  image: string;
  icon: React.ReactNode;
  aspectRatio?: string;
}

const screenshotDefinitions: ScreenshotDefinition[] = [
  {
    id: 'file-finder',
    titleKey: 'gallery.cards.fileFinder.title',
    descriptionKey: 'gallery.cards.fileFinder.description',
    featuresKey: 'gallery.cards.fileFinder.features',
    image: cdnUrl('/assets/images/demo-file-finder.jpg'),
    icon: <Search className="w-5 h-5" />,
    aspectRatio: '1478/1364',
  },
  {
    id: 'file-finder-workflow',
    titleKey: 'gallery.cards.fileFinderWorkflow.title',
    descriptionKey: 'gallery.cards.fileFinderWorkflow.description',
    featuresKey: 'gallery.cards.fileFinderWorkflow.features',
    image: cdnUrl('/assets/images/demo-file-finder-workflow.jpg'),
    icon: <Search className="w-5 h-5" />,
    aspectRatio: '608/980',
  },
  {
    id: 'video-analysis',
    titleKey: 'gallery.cards.videoAnalysis.title',
    descriptionKey: 'gallery.cards.videoAnalysis.description',
    featuresKey: 'gallery.cards.videoAnalysis.features',
    image: cdnUrl('/assets/images/demo-video-analysis.jpg'),
    icon: <Video className="w-5 h-5" />,
    aspectRatio: '1024/1366',
  },
  {
    id: 'implementation-plans',
    titleKey: 'gallery.cards.implementationPlans.title',
    descriptionKey: 'gallery.cards.implementationPlans.description',
    featuresKey: 'gallery.cards.implementationPlans.features',
    image: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
    icon: <FileText className="w-5 h-5" />,
    aspectRatio: '1714/1574',
  },
  {
    id: 'background-tasks',
    titleKey: 'gallery.cards.backgroundTasks.title',
    descriptionKey: 'gallery.cards.backgroundTasks.description',
    featuresKey: 'gallery.cards.backgroundTasks.features',
    image: cdnUrl('/assets/images/demo-background-tasks.jpg'),
    icon: <Zap className="w-5 h-5" />,
    aspectRatio: '642/1654',
  },
  {
    id: 'settings-prompts',
    titleKey: 'gallery.cards.settingsPrompts.title',
    descriptionKey: 'gallery.cards.settingsPrompts.description',
    featuresKey: 'gallery.cards.settingsPrompts.features',
    image: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
    icon: <Settings className="w-5 h-5" />,
    aspectRatio: '1838/1626',
  },
  {
    id: 'terminal-voice-recording',
    titleKey: 'gallery.cards.terminalVoiceRecording.title',
    descriptionKey: 'gallery.cards.terminalVoiceRecording.description',
    featuresKey: 'gallery.cards.terminalVoiceRecording.features',
    image: cdnUrl('/assets/images/demo-terminal-voice-recording.jpg'),
    icon: <Copy className="w-5 h-5" />,
    aspectRatio: '1478/820',
  },
  {
    id: 'merge-instructions-workflow',
    titleKey: 'gallery.cards.mergeInstructionsWorkflow.title',
    descriptionKey: 'gallery.cards.mergeInstructionsWorkflow.description',
    featuresKey: 'gallery.cards.mergeInstructionsWorkflow.features',
    image: cdnUrl('/assets/images/demo-merge-instructions-panel.jpg'),
    icon: <FileText className="w-5 h-5" />,
    aspectRatio: '1420/790',
  },
  {
    id: 'billing-transactions',
    titleKey: 'gallery.cards.billingTransactions.title',
    descriptionKey: 'gallery.cards.billingTransactions.description',
    featuresKey: 'gallery.cards.billingTransactions.features',
    image: cdnUrl('/assets/images/demo-billing-transactions.jpg'),
    icon: <CreditCard className="w-5 h-5" />,
    aspectRatio: '1822/1604',
  }
];

export function ScreenshotGallery() {
  const { t } = useMessages();
  const [selectedImage, setSelectedImage] = useState<ScreenshotCard | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleVideoClick = () => {
    setShowVideo(true);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.requestFullscreen?.() ||
        (videoRef.current as any).webkitRequestFullscreen?.() ||
        (videoRef.current as any).mozRequestFullScreen?.() ||
        (videoRef.current as any).msRequestFullscreen?.();
        videoRef.current.play();
      }
    }, 100);
  };

  const getFeatures = (key: string) => t(key) as string[];

  const screenshots: ScreenshotCard[] = screenshotDefinitions.map((definition) => ({
    id: definition.id,
    title: t(definition.titleKey),
    description: t(definition.descriptionKey),
    image: definition.image,
    icon: definition.icon,
    aspectRatio: definition.aspectRatio,
    features: getFeatures(definition.featuresKey),
  }));

  return (
    <>
      <div className="py-8 max-w-7xl mx-auto">
        <div className="mb-12 text-center space-y-4 px-4">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('gallery.heading')}
          </h2>
          <p className="text-muted-foreground max-w-3xl mx-auto">
            {t('gallery.intro')}
          </p>
        </div>
        {/* Hero Video Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.21, 0.47, 0.32, 0.98]
          }}
          className="mb-20"
        >
          <GlassCard className="!p-0 !rounded-3xl hover:shadow-2xl hover:shadow-primary/20" highlighted>
            <div className="flex flex-col lg:flex-row items-center gap-8">
              {/* Content Section */}
              <div className="lg:w-2/5 p-8 lg:p-12 flex flex-col justify-center">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-2xl bg-primary/15 dark:bg-primary/20 text-primary [&>svg]:w-8 [&>svg]:h-8">
                    <Play />
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-bold text-foreground">
                    {t('gallery.video.title')}
                  </h3>
                </div>

                <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                  {t('gallery.video.description')}
                </p>

                <ul className="space-y-3 mb-8">
                  {getFeatures('gallery.video.bullets').map((bullet, index) => (
                    <li key={index} className="flex items-center gap-3">
                      <span className="text-primary flex-shrink-0">✓</span>
                      <span className="text-base text-muted-foreground">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Video Preview Section */}
              <div
                className="lg:w-3/5 flex justify-center bg-gradient-to-br from-background/50 to-background/20 p-6 lg:p-8 cursor-pointer"
                onClick={handleVideoClick}
              >
                <div className="relative rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-primary/20 dark:border-primary/25 bg-background/50">
                  <div className="relative" style={{ aspectRatio: '16/9' }}>
                    {/* Video Thumbnail */}
                    <video
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      poster={cdnUrl('/assets/images/demo-implementation-plans.jpg')}
                    >
                      <source src={cdnUrl('/assets/videos/hero-section-16by9_vp9.webm')} type="video/webm; codecs=vp9" />
                      <source src={cdnUrl('/assets/videos/hero-section-16by9.mp4')} type="video/mp4" />
                    </video>
                    {/* Play Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent dark:from-black/40 dark:via-transparent flex items-center justify-center">
                      <div className="bg-white/95 dark:bg-primary/90 backdrop-blur-xl rounded-full p-6 shadow-2xl border-2 border-primary/70 dark:border-primary/50 group hover:scale-110 transition-transform">
                        <Play className="w-10 h-10 text-primary dark:text-primary-foreground fill-primary dark:fill-primary-foreground" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

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
                <div className={`flex flex-col lg:flex-row items-center gap-8 ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
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
                    className="lg:w-3/5 w-full flex justify-center bg-gradient-to-br from-background/50 to-background/20 p-6 lg:p-8 cursor-pointer"
                    onClick={() => setSelectedImage(screenshot)}
                  >
                    <div className="relative w-full rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 border border-primary/20 dark:border-primary/25 bg-background/50">
                      <div
                        className="relative w-full"
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
                          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 60vw, (max-width: 1280px) 50vw, 800px"
                          quality={85}
                          priority={index === 0}
                          loading={index === 0 ? 'eager' : 'lazy'}
                        />
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                          <div className="bg-white/90 dark:bg-background/95 backdrop-blur-xl rounded-full px-4 py-2 shadow-xl border border-primary/50 dark:border-primary/60 flex items-center gap-2">
                            <Maximize2 className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold text-primary dark:text-foreground">{t('gallery.viewFullSize')}</span>
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
        <div className="mt-20 px-4">
          <GlassCard className="max-w-3xl mx-auto p-8 sm:p-12 text-center" highlighted>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              {t('gallery.cta.title')}
            </h2>
            <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
              {t('gallery.cta.description')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center"
              >
                <Button asChild size="lg" variant="cta">
                  <Link href="/architecture">
                    {t('gallery.cta.primary')}
                  </Link>
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center"
              >
                <Button asChild size="lg" variant="outline">
                  <Link href="/docs/runtime-walkthrough">
                    {t('gallery.cta.secondary')}
                  </Link>
                </Button>
              </motion.div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Video Modal - Fullscreen */}
      {mounted && showVideo && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh'
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowVideo(false)}
              className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl transition-all z-[101]"
              style={{ position: 'absolute', top: '1rem', right: '1rem' }}
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Video Player */}
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              autoPlay
              playsInline
            >
              <source src={cdnUrl('/assets/videos/hero-section-16by9_vp9.webm')} type="video/webm; codecs=vp9" />
              <source src={cdnUrl('/assets/videos/hero-section-16by9.mp4')} type="video/mp4" />
            </video>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

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

            {/* Image Container */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full flex items-center justify-center"
            >
              <div className="relative w-full h-full">
                <Image
                  src={selectedImage.image}
                  alt={selectedImage.title}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  quality={100}
                />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
