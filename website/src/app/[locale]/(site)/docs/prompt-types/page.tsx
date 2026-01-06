import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

type CatalogItem = {
  title: string;
  job: string;
  description: string;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/prompt-types',
    title: t['promptTypes.meta.title'],
    description: t['promptTypes.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function PromptTypesDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const catalogItems = Array.isArray(t['promptTypes.catalog.items'])
    ? (t['promptTypes.catalog.items'] as CatalogItem[])
    : [];
  const assemblySteps = Array.isArray(t['promptTypes.assembly.steps'])
    ? (t['promptTypes.assembly.steps'] as string[])
    : [];
  const tokenItems = Array.isArray(t['promptTypes.tokenGuards.items'])
    ? (t['promptTypes.tokenGuards.items'] as string[])
    : [];
  const designItems = Array.isArray(t['promptTypes.designNotes.items'])
    ? (t['promptTypes.designNotes.items'] as string[])
    : [];

  return (
    <DocsArticle
      title={t['promptTypes.title']}
      description={t['promptTypes.description']}
      date={t['promptTypes.date']}
      readTime={t['promptTypes.readTime']}
      category={t['promptTypes.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['promptTypes.intro']}
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.catalog.heading']}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {catalogItems.map((item) => (
            <GlassCard key={item.job} className="p-6">
              <p className="text-xs uppercase text-muted-foreground mb-2">
                <code className="rounded bg-muted px-2 py-0.5 text-foreground">{item.job}</code>
              </p>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{item.description}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.templateStructure.heading']}</h2>
        <GlassCard className="p-6 space-y-4">
          <p className="text-muted-foreground leading-relaxed">
            {t['promptTypes.templateStructure.description']}
          </p>
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">{t['promptTypes.templateStructure.sampleLabel']}</p>
            <pre className="rounded-lg bg-slate-950 p-4 text-sm text-slate-100 overflow-x-auto">
              <code>{t['promptTypes.templateStructure.sample']}</code>
            </pre>
          </div>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['promptTypes.visuals.template.title']}
        description={t['promptTypes.visuals.template.description']}
        imageSrc={t['promptTypes.visuals.template.imageSrc']}
        imageAlt={t['promptTypes.visuals.template.imageAlt']}
        caption={t['promptTypes.visuals.template.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.assembly.heading']}</h2>
        <GlassCard className="p-6">
          <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
            {assemblySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.serverConfig.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['promptTypes.serverConfig.description']}
          </p>
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">{t['promptTypes.serverConfig.fields']}</p>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.tokenGuards.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['promptTypes.tokenGuards.description']}
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {tokenItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.versioning.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['promptTypes.versioning.description']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['promptTypes.designNotes.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {designItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['promptTypes.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['promptTypes.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/background-jobs">{t['promptTypes.cta.links.jobs']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/merge-instructions">{t['promptTypes.cta.links.merge']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
