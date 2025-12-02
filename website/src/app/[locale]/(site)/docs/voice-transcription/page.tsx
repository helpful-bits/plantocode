import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/voice-transcription',
    title: t['voiceTranscription.meta.title'],
    description: t['voiceTranscription.meta.description'],
  });
}
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
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.routingBehavior.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.routingBehavior.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.examples.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.examples.description']}
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
