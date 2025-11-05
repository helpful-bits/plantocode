import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { cdnUrl } from '@/lib/cdn';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Voice transcription - PlanToCode',
  description: 'How PlanToCode records audio, streams real-time transcripts using gpt-4o-transcribe, manages permissions, project settings.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/voice-transcription',
    languages: {
      'en-US': 'https://www.plantocode.com/docs/voice-transcription',
      'en': 'https://www.plantocode.com/docs/voice-transcription',
    },
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Voice transcription - PlanToCode',
    description: 'Learn how the recording hook manages devices, permissions, and streaming text.',
    url: 'https://www.plantocode.com/docs/voice-transcription',
    siteName: 'PlanToCode',
    type: 'article',
  },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function VoiceTranscriptionDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <DocsArticle
      title={t['voiceTranscription.title'] ?? ''}
      description={t['voiceTranscription.description'] ?? ''}
      date={t['voiceTranscription.date'] ?? ''}
      readTime={t['voiceTranscription.readTime'] ?? ''}
      category={t['voiceTranscription.category'] ?? ''}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['voiceTranscription.intro']}
      </p>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.recordingWorkflow.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.recordingWorkflow.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.projectSettings.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.projectSettings.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.deviceManagement.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.deviceManagement.description']}
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
