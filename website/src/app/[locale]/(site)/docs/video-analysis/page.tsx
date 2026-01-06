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
    slug: '/docs/video-analysis',
    title: t['videoAnalysisDoc.meta.title'],
    description: t['videoAnalysisDoc.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function VideoAnalysisDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  const endpointText = t['videoAnalysisDoc.apiEndpoint.endpoint'] as string;
  const endpointParts = endpointText.split('{code}');

  const modelText = t['videoAnalysisDoc.modelRequirements.format'] as string;
  const modelParts = modelText.split('{code}');

  return (
    <DocsArticle
      title={t['videoAnalysisDoc.title']}
      description={t['videoAnalysisDoc.description']}
      date={t['videoAnalysisDoc.date']}
      readTime={t['videoAnalysisDoc.readTime']}
      category={t['videoAnalysisDoc.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['videoAnalysisDoc.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['videoAnalysisDoc.visuals.frameNotes.title']}
        description={t['videoAnalysisDoc.visuals.frameNotes.description']}
        imageSrc={t['videoAnalysisDoc.visuals.frameNotes.imageSrc']}
        imageAlt={t['videoAnalysisDoc.visuals.frameNotes.imageAlt']}
        caption={t['videoAnalysisDoc.visuals.frameNotes.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.apiEndpoint.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {endpointParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/llm/video/analyze</code>
            {endpointParts.slice(1).join('{code}')}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['videoAnalysisDoc.apiEndpoint.payloadHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.apiEndpoint.payloadFields'] as string[]).map((field, index) => (
              <li key={index}>{field}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.inputs.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.inputs.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.sampling.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.sampling.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.sampling.fps']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['videoAnalysisDoc.sampling.parametersHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.sampling.parameters'] as string[]).map((param, index) => (
              <li key={index}>{param}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.modelRequirements.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {modelParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">provider/model</code>
            {modelParts[1]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">google/*</code>
            {modelParts.slice(2).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['videoAnalysisDoc.modelRequirements.reasoning']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.analysis.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.analysis.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.analysis.prompting']}
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2">{t['videoAnalysisDoc.analysis.promptElementsHeading']}</h3>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.analysis.promptElements'] as string[]).map((element, index) => (
              <li key={index}>{element}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.outputs.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.outputs.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.billing.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.billing.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.billing.tracked'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.storage.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.storage.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['videoAnalysisDoc.storage.reuse']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.keyFiles.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['videoAnalysisDoc.keyFiles.items'] as string[]).map((file, index) => (
              <li key={index}>
                <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{file}</code>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['videoAnalysisDoc.integration.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.integration.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['videoAnalysisDoc.integration.followup']}
          </p>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['videoAnalysisDoc.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['videoAnalysisDoc.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/meeting-ingestion">{t['videoAnalysisDoc.cta.links.meeting']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/runtime-walkthrough">{t['videoAnalysisDoc.cta.links.runtime']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
