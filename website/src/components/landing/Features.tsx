'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import Reveal from '@/components/motion/Reveal';
import { ArrowUpRight, Sparkles, Video, Shield, Search, Mic, Globe, Code2, GitMerge, Zap, History } from 'lucide-react';
import { useMessages } from '@/components/i18n/useMessages';

interface FeatureConfig {
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
  href?: string;
}

export function Features() {
  const { t } = useMessages();

  const featureConfigs: FeatureConfig[] = [
    {
      titleKey: 'features.cards.specification.title',
      descriptionKey: 'features.cards.specification.description',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
    },
    {
      titleKey: 'features.cards.meeting.title',
      descriptionKey: 'features.cards.meeting.description',
      icon: <Video className="w-8 h-8" />,
      href: '/features/video-analysis',
    },
    {
      titleKey: 'features.cards.implementation.title',
      descriptionKey: 'features.cards.implementation.description',
      icon: <Shield className="w-8 h-8" />,
      href: '/docs',
    },
    {
      titleKey: 'features.cards.fileDiscovery.title',
      descriptionKey: 'features.cards.fileDiscovery.description',
      icon: <Search className="w-8 h-8" />,
      href: '/features/file-discovery',
    },
    {
      titleKey: 'features.cards.voiceTranscription.title',
      descriptionKey: 'features.cards.voiceTranscription.description',
      icon: <Mic className="w-8 h-8" />,
      href: '/features/voice-transcription',
    },
    {
      titleKey: 'features.cards.textImprovement.title',
      descriptionKey: 'features.cards.textImprovement.description',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
    },
    {
      titleKey: 'features.cards.modelConfiguration.title',
      descriptionKey: 'features.cards.modelConfiguration.description',
      icon: <Globe className="w-8 h-8" />,
      href: '/docs/model-configuration',
    },
    {
      titleKey: 'features.cards.tokenGuardrails.title',
      descriptionKey: 'features.cards.tokenGuardrails.description',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      titleKey: 'features.cards.monacoEditor.title',
      descriptionKey: 'features.cards.monacoEditor.description',
      icon: <Code2 className="w-8 h-8" />,
      href: '/features/plan-mode',
    },
    {
      titleKey: 'features.cards.mergePlans.title',
      descriptionKey: 'features.cards.mergePlans.description',
      icon: <GitMerge className="w-8 h-8" />,
      href: '/features/merge-instructions',
    },
    {
      titleKey: 'features.cards.integratedTerminal.title',
      descriptionKey: 'features.cards.integratedTerminal.description',
      icon: <Zap className="w-8 h-8" />,
      href: '/features/integrated-terminal',
    },
    {
      titleKey: 'features.cards.persistentSessions.title',
      descriptionKey: 'features.cards.persistentSessions.description',
      icon: <History className="w-8 h-8" />,
      href: '/docs/terminal-sessions',
    },
  ];

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="features">
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <Reveal as="h2" className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis font-bold text-shadow-subtle" delay={0}>
            {t('features.title', 'Mechanisms')}
          </Reveal>
          <Reveal as="p" className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/85 dark:text-foreground/90" delay={0.05}>
            {t('features.subtitle', 'Built for developers tackling large & legacy codebases. If you use Claude Code, Cursor, or Aider - this is your planning layer.')}
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureConfigs.map((feature, index) => (
            <Reveal
              key={index}
              className="feature-card group"
              delay={0.1 + index * 0.05}
            >
              <GlassCard className="h-full">
                <div className="content-spacing text-safe-padding">
                  {/* Icon container - hidden on mobile */}
                  <div className="hidden sm:flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                    <div className="text-primary/80">
                      {feature.icon}
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold text-center mb-3 text-foreground">
                    {t(feature.titleKey)}
                  </h3>

                  <p className="text-center text-sm leading-relaxed text-foreground/80">
                    {t(feature.descriptionKey)}
                  </p>

                  {feature.href && (
                    <div className="mt-4 text-center">
                      <Link
                        href={feature.href}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        {t('features.linkText', 'Learn more')}
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}