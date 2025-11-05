'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { useMessages } from '@/components/i18n/useMessages';
import { Mic, Sparkles, Code2 } from 'lucide-react';

export function SpecificationCaptureSection() {
  const { t } = useMessages();

  const cards = [
    {
      icon: Mic,
      titleKey: 'capture.cards.voice.title',
      descriptionKey: 'capture.cards.voice.description',
      linkKey: 'capture.cards.voice.link',
      href: '/features/voice-transcription',
    },
    {
      icon: Sparkles,
      titleKey: 'capture.cards.textEnhancement.title',
      descriptionKey: 'capture.cards.textEnhancement.description',
      linkKey: 'capture.cards.textEnhancement.link',
      href: '/features/text-improvement',
    },
    {
      icon: Code2,
      titleKey: 'capture.cards.taskRefinement.title',
      descriptionKey: 'capture.cards.taskRefinement.description',
      linkKey: 'capture.cards.taskRefinement.link',
      href: '/features/text-improvement',
    },
  ];

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('capture.title', 'Specification Capture & Refinement')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t(
            'capture.subtitle',
            'Rapidly crystallize ideas into clear, actionable specifications with voice dictation and AI-powered enhancement.',
          )}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <GlassCard key={index} className="p-6">
                <Icon className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-3">
                  {t(card.titleKey, card.titleKey)}
                </h3>
                <p className="text-foreground/80 mb-4">
                  {t(card.descriptionKey, card.descriptionKey)}
                </p>
                <LinkWithArrow href={card.href} className="text-sm">
                  {t(card.linkKey, 'Learn more →')}
                </LinkWithArrow>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
