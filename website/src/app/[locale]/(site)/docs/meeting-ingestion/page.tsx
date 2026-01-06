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
    slug: '/docs/meeting-ingestion',
    title: t['meetingIngestionDoc.meta.title'],
    description: t['meetingIngestionDoc.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function MeetingIngestionDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  const multimodalText = t['meetingIngestionDoc.multimodalAnalysis.description'] as string;
  const multimodalParts = multimodalText.split('{code}');

  return (
    <DocsArticle
      title={t['meetingIngestionDoc.title']}
      description={t['meetingIngestionDoc.description']}
      date={t['meetingIngestionDoc.date']}
      readTime={t['meetingIngestionDoc.readTime']}
      category={t['meetingIngestionDoc.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['meetingIngestionDoc.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['meetingIngestionDoc.visuals.ingestionFlow.title']}
        description={t['meetingIngestionDoc.visuals.ingestionFlow.description']}
        imageSrc={t['meetingIngestionDoc.visuals.ingestionFlow.imageSrc']}
        imageAlt={t['meetingIngestionDoc.visuals.ingestionFlow.imageAlt']}
        caption={t['meetingIngestionDoc.visuals.ingestionFlow.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.inputs.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.inputs.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['meetingIngestionDoc.inputs.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.uploadProcess.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.uploadProcess.description']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['meetingIngestionDoc.uploadProcess.stepsHeading']}</h3>
          <ol className="space-y-2 text-muted-foreground ml-6 list-decimal">
            {(t['meetingIngestionDoc.uploadProcess.steps'] as string[]).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.normalization.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.normalization.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['meetingIngestionDoc.normalization.outputs']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.multimodalAnalysis.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {multimodalParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">google/*</code>
            {multimodalParts.slice(1).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['meetingIngestionDoc.multimodalAnalysis.combined']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.transcription.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.transcription.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.transcription.attribution']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['meetingIngestionDoc.transcription.featuresHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['meetingIngestionDoc.transcription.features'] as string[]).map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.frames.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.frames.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['meetingIngestionDoc.frames.timestamps']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.structuredExtraction.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.structuredExtraction.description']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['meetingIngestionDoc.structuredExtraction.extractedHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['meetingIngestionDoc.structuredExtraction.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.artifacts.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.artifacts.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['meetingIngestionDoc.artifacts.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.keyFiles.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['meetingIngestionDoc.keyFiles.items'] as string[]).map((file, index) => (
              <li key={index}>
                <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{file}</code>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['meetingIngestionDoc.handoff.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.handoff.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['meetingIngestionDoc.handoff.pipeline']}
          </p>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['meetingIngestionDoc.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['meetingIngestionDoc.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/video-analysis">{t['meetingIngestionDoc.cta.links.video']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/text-improvement">{t['meetingIngestionDoc.cta.links.textImprovement']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
