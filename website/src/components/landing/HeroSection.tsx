'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Target, Play, Mic, Sparkles, FileSearch, GitBranch } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { VideoModal } from '@/components/ui/VideoModal';
import { trackCTA } from '@/lib/track';
import { useMessages } from '@/components/i18n/useMessages';

export function HeroSection() {
  const { t } = useMessages();

  // Start with null to match server/client
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  // Set initial values and handle resize
  useEffect(() => {
    const checkMobile = () => window.innerWidth < 640;
    const checkDesktop = () => window.innerWidth >= 1024;

    // Set initial values
    setIsMobile(checkMobile());
    setIsDesktop(checkDesktop());

    const handleResize = () => {
      setIsMobile(checkMobile());
      setIsDesktop(checkDesktop());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  return (
    <section className="relative flex flex-col items-center bg-transparent w-full">
      {/* Main heading */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-6 sm:pb-8 w-full">
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
          {t('hero.title', 'Turn Vague Ideas Into File‑Level Plans')}
        </h2>
        <p className="mt-6 text-lg sm:text-xl text-foreground/80 max-w-4xl mx-auto">
          {t('hero.subtitle', 'Dictate or type your task. Scope the exact files. Generate multiple AI perspectives. Automatically merge into one superior plan.')}
        </p>
      </div>

      {/* Hero Content with Panels */}
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="w-full mx-auto relative">
          
          {/* Panels Container - Responsive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={isMobile === true ? "flex flex-col gap-6 pb-8 w-full" : "flex items-center justify-center gap-1 pb-6"}
          >
                {/* Panel 1: Crystallize & Scope */}
                {isMobile ? (
              <div className="vibe-panel w-full" style={{minHeight: 'auto'}}>
                <h3>{t('hero.panel1.title', 'Crystallize & Scope')}</h3>
                <p className="text-foreground/80 text-base leading-relaxed">
                  {t('hero.panel1.description', 'Voice or text with AI refinement. Isolate files for this specific task.')}
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
            ) : (
              <div className="vibe-panel flex-shrink-0" style={{width: 'min(380px, 32vw)', height: 'min(420px, 50vh)'}}>
                <h3>{t('hero.panel1.title', 'Crystallize & Scope')}</h3>
                <p className="text-foreground/80 text-base leading-relaxed">
                  {t('hero.panel1.descriptionDesktop', 'Type or dictate. Refine with AI. Scope exact files via targeted discovery.')}
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
            )}

            {/* Arrow between Panel 1 and 2 - Desktop only with spacer */}
            <div className="hidden lg:flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
              <div className="relative" style={{ opacity: isDesktop === null ? 0 : 1, transition: 'opacity 0.2s' }}>
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

            {/* Panel 2: Multiple AI Perspectives */}
            <div className="vibe-panel vibe-panel--accent vibe-panel--glow">
              <h3>{t('hero.panel2.title', 'Multiple AI Perspectives')}</h3>

              <div className="vibe-models-container">
                <div className="vibe-model-card">
                  <div className="vibe-model-card__header flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary/80" />
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run1', 'Run 1 — GPT‑5')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.serviceLayer', 'Service‑layer‑first')}</div>
                </div>

                <div className="vibe-model-card">
                  <div className="vibe-model-card__header flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary/80" />
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run2', 'Run 2 — Gemini 2.5 Pro')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.apiFirst', 'API‑first')}</div>
                </div>

                <div className="vibe-model-card">
                  <div className="vibe-model-card__header flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary/80" />
                    <span className="vibe-model-card__name">{t('hero.panel2.runs.run3', 'Run 3 — GPT‑5')}</span>
                  </div>
                  <div className="vibe-model-card__label text-sm opacity-80">{t('hero.panel2.tags.middlewareFirst', 'Middleware‑first')}</div>
                </div>
              </div>

              <p>{t('hero.panel2.description', 'Generate plans multiple times with any model mix. Each AI brings different architectural thinking. Compare and choose what fits.')}</p>
              <LinkWithArrow href="/docs/implementation-plans">{t('hero.panel2.link', 'Explore the workflow')}</LinkWithArrow>
            </div>

            {/* Arrow between Panel 2 and 3 - Desktop only with spacer */}
            <div className="hidden lg:flex items-center justify-center px-1 relative" style={{ minWidth: '32px', minHeight: '40px' }}>
              <div className="relative" style={{ opacity: isDesktop === null ? 0 : 1, transition: 'opacity 0.2s' }}>
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

            {/* Panel 3: Intelligent Merge */}
            <div className={isMobile ? "vibe-panel w-full" : "vibe-panel flex-shrink-0"} style={isMobile ? {minHeight: 'auto'} : {width: 'min(380px, 32vw)', height: 'min(420px, 50vh)'}}>
              <h3>{t('hero.panel3.title', 'Intelligent Merge')}</h3>

              <div className="vibe-code-block">
                <pre className="text-sm">{t('hero.panel3.merge.line1', 'Input: 4 AI plans')}</pre>
                <pre className="text-sm">{t('hero.panel3.merge.line2', 'Scope: Referenced files')}</pre>
                <pre className="text-sm">{t('hero.panel3.merge.line3', 'Strategy: Merge instructions')}</pre>
                <pre className="text-sm">{t('hero.panel3.merge.line4', 'Output: Unified plan')}</pre>
                <pre className="text-sm">{t('hero.panel3.merge.line5', 'Provenance: [src:P2 step 3]')}</pre>
              </div>

              <p>{t('hero.panel3.description', 'System analyzes all plans with referenced files. Apply merge instructions to guide synthesis. Output: one superior plan with provenance.')}</p>
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