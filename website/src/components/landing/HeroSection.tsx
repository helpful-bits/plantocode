'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Target, Play, Mic, Sparkles, FileSearch, Layers, Files, Settings, FileCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { VideoModal } from '@/components/ui/VideoModal';
import { trackCTA } from '@/lib/track';
import { useMessages } from '@/components/i18n/useMessages';

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

      {/* Hero Content with Panels */}
      <div className="relative w-full px-4 sm:px-6 lg:px-4 xl:px-8">
        <div className="w-full mx-auto relative">
          
          {/* Panels Container - Responsive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col lg:flex-row gap-6 lg:gap-1 pb-8 lg:pb-6 w-full max-w-3xl lg:max-w-none mx-auto items-center lg:items-stretch lg:justify-center"
          >
            {/* Panel 1: Crystallize & Scope */}
            <div className="vibe-panel w-full md:w-[75vw] md:max-w-3xl lg:flex-shrink-0 lg:w-auto" style={{minHeight: 'auto'}}>
              <h3>{t('hero.panel1.title', 'Crystallize & Scope')}</h3>
              <p className="text-foreground/80 text-base leading-relaxed lg:hidden">
                {t('hero.panel1.description', 'Voice or text input with optional AI refinement. Isolate files specifically relevant to this task.')}
              </p>
              <p className="text-foreground/80 text-base leading-relaxed hidden lg:block">
                {t('hero.panel1.descriptionDesktop', 'Start with voice or text. Use AI for optional text improvement and task refinement. Then scope exact files via targeted discovery.')}
              </p>
              <div className="vibe-intent-box">
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Mic className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel1.features.voice', 'Voice dictation')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel1.features.textImprovement', 'Text improvement')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel1.features.taskRefinement', 'Task refinement')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <FileSearch className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel1.features.fileDiscovery', 'Targeted file discovery')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Target className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel1.features.scopedSelection', 'Task‑specific selection')}</span>
                </div>
              </div>
              <LinkWithArrow href="/features/file-discovery">{t('hero.panel1.linkDesktop', 'Explore discovery')}</LinkWithArrow>
            </div>

            {/* Arrow between Panel 1 and 2 - Desktop only with spacer */}
            <div className="hidden lg:flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
              <div className="relative">
                <svg
                  className="w-10 h-10 animate-pulse"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{
                    filter: 'drop-shadow(0 0 8px color-mix(in oklch, var(--color-primary) 40%, transparent))',
                  }}
                >
                  <defs>
                    <linearGradient id="arrow-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                    stroke="url(#arrow-gradient-1)"
                    strokeWidth="2.5"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                </div>
              </div>
            </div>

            {/* Panel 2: Multiple Perspectives */}
            <div className="vibe-panel vibe-panel--accent vibe-panel--glow w-full md:w-[75vw] md:max-w-3xl lg:flex-shrink-0 lg:w-auto" style={{minHeight: 'auto'}}>
              <h3>{t('hero.panel2.title', 'Multiple Perspectives')}</h3>

              <div className="vibe-models-container">
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run1', 'Run 1 - GPT-5')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.serviceLayer', 'Service layer approach')}</div>
                </div>

                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run2', 'Run 2 - Gemini 2.5 Pro')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.apiFirst', 'API-first approach')}</div>
                </div>

                <div className="vibe-model-card">
                  <div className="vibe-model-card__header">
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run3', 'Run 3 - GPT-5')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.middlewareFirst', 'Middleware approach')}</div>
                </div>
              </div>

              <p>{t('hero.panel2.description', 'Same task, same files, same context. Run multiple times - same model or mixed. Each AI has unique architectural taste. See different valid approaches in standardized format.')}</p>
              <LinkWithArrow href="/docs/implementation-plans">{t('hero.panel2.link', 'Explore the workflow')}</LinkWithArrow>
            </div>

            {/* Arrow between Panel 2 and 3 - Desktop only with spacer */}
            <div className="hidden lg:flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
              <div className="relative">
                <svg
                  className="w-10 h-10 animate-pulse"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{
                    filter: 'drop-shadow(0 0 8px color-mix(in oklch, var(--color-primary) 40%, transparent))',
                    animationDelay: '0.5s'
                  }}
                >
                  <defs>
                    <linearGradient id="arrow-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                      <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                    stroke="url(#arrow-gradient-2)"
                    strokeWidth="2.5"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                </div>
              </div>
            </div>

            {/* Panel 3: Automatic Merge */}
            <div className="vibe-panel w-full md:w-[75vw] md:max-w-3xl lg:flex-shrink-0 lg:w-auto" style={{minHeight: 'auto'}}>
              <h3>{t('hero.panel3.title', 'Automatic Merge')}</h3>
              <p className="text-foreground/80 text-base leading-relaxed">
                {t('hero.panel3.description', 'System evaluates and rates all plans to identify the most architecturally appropriate approaches for your codebase, then merges them into one superior implementation. Optional merge instructions guide synthesis.')}
              </p>

              <div className="vibe-intent-box">
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Layers className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel3.merge.line1', 'Input: 4 plans (2×GPT-5, 2×Gemini)')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Files className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel3.merge.line2', 'Scope: Files across all plans')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <Settings className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel3.merge.line3', 'Strategy: Apply merge instructions')}</span>
                </div>
                <div className="vibe-intent-box__item flex items-center gap-3">
                  <FileCheck className="w-5 h-5 text-foreground/60" />
                  <span>{t('hero.panel3.merge.line4', 'Output: File-by-file plan')}</span>
                </div>
              </div>

              <LinkWithArrow href="/features/merge-instructions">{t('hero.panel3.link', 'Merge details')}</LinkWithArrow>
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