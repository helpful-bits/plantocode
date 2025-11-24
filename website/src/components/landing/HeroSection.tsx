'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { VideoModal } from '@/components/ui/VideoModal';
import { trackCTA } from '@/lib/track';
import { useMessages } from '@/components/i18n/useMessages';
import { cdnUrl } from '@/lib/cdn';
import Image from 'next/image';

export function HeroSection() {
  const { t, tRich } = useMessages();

  const [showVideo, setShowVideo] = useState(false);


  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10 sm:pb-14 w-full">
        <h2
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent max-w-5xl mx-auto"
          style={{
            contentVisibility: 'auto',
            backgroundImage: 'linear-gradient(135deg, var(--color-adaptive-primary), var(--color-adaptive-accent), var(--teal-bright))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {t('hero.titleLine1', 'Plan Complex Changes')}
          <br />
          {t('hero.titleLine2', 'Without Breaking Production')}
        </h2>
        <p className="mt-6 text-lg sm:text-xl text-foreground/80 max-w-4xl mx-auto">
          {tRich('hero.subtitle', '[b]AI Architect[/b] generates detailed implementation plans with exact file paths. You review and approve every change before execution. [b]Clean architecture[/b].')}
        </p>
      </div>

      {/* Hero Image - Responsive */}
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="w-full mx-auto relative max-w-7xl">

          {/* Hero Image Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full pb-8"
          >
            {/* Desktop Image - Hidden on mobile */}
            <div className="hidden lg:block relative w-full rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src={cdnUrl('/images/hero-workflow-desktop.jpg')}
                alt={t('hero.imageAlt', 'PlanToCode workflow visualization')}
                width={1600}
                height={800}
                className="w-full h-auto"
                priority
              />
            </div>

            {/* Mobile Image - Hidden on desktop */}
            <div className="lg:hidden relative w-full rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src={cdnUrl('/images/hero-workflow-mobile.jpg')}
                alt={t('hero.imageAlt', 'PlanToCode workflow visualization')}
                width={800}
                height={1200}
                className="w-full h-auto"
                priority
              />
            </div>
          </motion.div>
          
          {/* CTAs */}
          <div className="flex flex-col items-center gap-4 pb-12">
            <Button
              variant="cta"
              size="lg"
              onClick={() => {
                setShowVideo(true);
                trackCTA('hero', 'View Demo', 'video_modal');
              }}
              className="flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              {t('hero.cta.viewDemo', 'View Demo')}
            </Button>

            <Link
              href="/how-it-works"
              className="text-sm text-foreground/60 hover:text-foreground/80 underline"
            >
              {t('hero.cta.howItWorks', 'See how it works')}
            </Link>
          </div>
        </div>
      </div>

      <VideoModal
        isOpen={showVideo}
        onClose={() => setShowVideo(false)}
        videoPath="/assets/videos/hero-demo.mp4"
      />

    </section>
  );
}