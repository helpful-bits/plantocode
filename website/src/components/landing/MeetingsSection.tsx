/**
 * MeetingsSection - Meeting & Recording Ingestion component.
 *
 * Features:
 * - Multimodal analysis of Teams meetings and screen recordings
 * - Insight extraction and review workflow
 * - Full i18n support for multilingual content
 * - Accessibility compliance with semantic structure
 */
'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';
import { Video, CheckCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function MeetingsSection() {
  const { t } = useMessages();

  return (
    <section
      className="py-16 px-4 bg-gradient-to-br from-background via-background to-accent/5"
      aria-label="Meeting and recording ingestion features"
    >
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('meetings.title', 'Meeting & Recording Ingestion')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('meetings.subtitle', 'Transform Microsoft Teams meetings and screen recordings into actionable implementation requirements.')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Multimodal Analysis Card */}
          <GlassCard className="p-6">
            <Video className="w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-3">
              {t('meetings.cards.multimodal.title', 'Multimodal Analysis')}
            </h3>
            <p className="text-foreground/80 mb-4">
              {t(
                'meetings.cards.multimodal.description',
                'Upload Microsoft Teams meetings or screen recordings. Advanced multimodal models analyze both audio transcripts (with speaker identification) and relevant visual content (shared screens, presented documents, key moments) to extract specification requirements.'
              )}
            </p>
            <Link
              href="/features/video-analysis"
              className="text-primary hover:underline text-sm font-medium"
            >
              {t('meetings.cards.multimodal.link', 'Learn more →')}
            </Link>
          </GlassCard>

          {/* Review & Incorporate Insights Card */}
          <GlassCard className="p-6">
            <CheckCircle className="w-10 h-10 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-3">
              {t('meetings.cards.insights.title', 'Review & Incorporate Insights')}
            </h3>
            <p className="text-foreground/80 mb-4">
              {t(
                'meetings.cards.insights.description',
                'Extracted insights - summarized decisions, action items, and key discussion points - are presented in an intuitive interface where team leads can review, select, and incorporate them into actionable implementation plans.'
              )}
            </p>
            <Link
              href="/features/video-analysis"
              className="text-primary hover:underline text-sm font-medium"
            >
              {t('meetings.cards.insights.link', 'Learn more →')}
            </Link>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
