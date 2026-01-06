import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
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

  const hookText = t['voiceTranscription.pipeline.hook'] as string;
  const hookParts = hookText.split('{code}');

  const commandText = t['voiceTranscription.pipeline.command'] as string;
  const commandParts = commandText.split('{code}');

  const endpointText = t['voiceTranscription.serverProcessing.endpoint'] as string;
  const endpointParts = endpointText.split('{code}');

  return (
    <DocsArticle
      title={t['voiceTranscription.title']}
      description={t['voiceTranscription.description']}
      date={t['voiceTranscription.date']}
      readTime={t['voiceTranscription.readTime']}
      category={t['voiceTranscription.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['voiceTranscription.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['voiceTranscription.visuals.recordingFlow.title']}
        description={t['voiceTranscription.visuals.recordingFlow.description']}
        imageSrc={t['voiceTranscription.visuals.recordingFlow.imageSrc']}
        imageAlt={t['voiceTranscription.visuals.recordingFlow.imageAlt']}
        caption={t['voiceTranscription.visuals.recordingFlow.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.pipeline.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {hookParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useVoiceTranscription</code>
            {hookParts[1]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">MediaRecorder</code>
            {hookParts.slice(2).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {commandParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">transcribe_audio_command</code>
            {commandParts[1]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/audio/transcriptions</code>
            {commandParts.slice(2).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.pipeline.constraints']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.recordingWorkflow.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.recordingWorkflow.description']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['voiceTranscription.recordingWorkflow.statesHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['voiceTranscription.recordingWorkflow.states'] as string[]).map((state, index) => (
              <li key={index}>{state}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.serverProcessing.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {endpointParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/audio/transcriptions</code>
            {endpointParts.slice(1).join('{code}')}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['voiceTranscription.serverProcessing.parametersHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['voiceTranscription.serverProcessing.parameters'] as string[]).map((param, index) => (
              <li key={index}>{param}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.projectSettings.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.projectSettings.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.projectSettings.storage']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.deviceManagement.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.deviceManagement.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['voiceTranscription.deviceManagement.monitoring']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.dataFlow.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.dataFlow.description']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['voiceTranscription.dataFlow.stepsHeading']}</h3>
          <ol className="space-y-2 text-muted-foreground ml-6 list-decimal">
            {(t['voiceTranscription.dataFlow.steps'] as string[]).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.routingBehavior.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.routingBehavior.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['voiceTranscription.routingBehavior.destinations'] as string[]).map((dest, index) => (
              <li key={index}>{dest}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.keyFiles.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['voiceTranscription.keyFiles.items'] as string[]).map((file, index) => (
              <li key={index}>
                <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{file}</code>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['voiceTranscription.examples.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.examples.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['voiceTranscription.examples.items'] as string[]).map((example, index) => (
              <li key={index}>{example}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['voiceTranscription.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['voiceTranscription.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/text-improvement">{t['voiceTranscription.cta.links.textImprovement']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/meeting-ingestion">{t['voiceTranscription.cta.links.meetingIngestion']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
