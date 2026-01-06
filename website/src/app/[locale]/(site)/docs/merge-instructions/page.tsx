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
    slug: '/docs/merge-instructions',
    title: t['mergeInstructionsDoc.meta.title'],
    description: t['mergeInstructionsDoc.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function MergeInstructionsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['mergeInstructionsDoc.title']}
      description={t['mergeInstructionsDoc.description']}
      date={t['mergeInstructionsDoc.date']}
      readTime={t['mergeInstructionsDoc.readTime']}
      category={t['mergeInstructionsDoc.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['mergeInstructionsDoc.intro']}
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.processor.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.processor.description']}
          </p>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground"><strong>Payload:</strong> {t['mergeInstructionsDoc.processor.payload']}</p>
            <p className="text-sm text-muted-foreground"><strong>Storage:</strong> {t['mergeInstructionsDoc.processor.storage']}</p>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.inputs.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['mergeInstructionsDoc.inputs.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.xmlFormat.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.xmlFormat.description']}
          </p>
          <pre className="rounded-lg bg-slate-950 p-4 text-sm text-slate-100 overflow-x-auto">
            <code>{t['mergeInstructionsDoc.xmlFormat.example']}</code>
          </pre>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.prompt.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.prompt.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['mergeInstructionsDoc.prompt.sections'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['mergeInstructionsDoc.visuals.mergeWalkthrough.title']}
        description={t['mergeInstructionsDoc.visuals.mergeWalkthrough.description']}
        videoSrc={t['mergeInstructionsDoc.visuals.mergeWalkthrough.videoSrc']}
        posterSrc={t['mergeInstructionsDoc.visuals.mergeWalkthrough.posterSrc']}
        caption={t['mergeInstructionsDoc.visuals.mergeWalkthrough.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.rules.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.rules.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['mergeInstructionsDoc.rules.examples'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.output.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.output.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.output.provenance']}
          </p>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground"><strong>Metadata:</strong> {t['mergeInstructionsDoc.output.metadata']}</p>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['mergeInstructionsDoc.ui.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.ui.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['mergeInstructionsDoc.ui.audit']}
          </p>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['mergeInstructionsDoc.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['mergeInstructionsDoc.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/implementation-plans">{t['mergeInstructionsDoc.cta.links.plans']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/runtime-walkthrough">{t['mergeInstructionsDoc.cta.links.runtime']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
