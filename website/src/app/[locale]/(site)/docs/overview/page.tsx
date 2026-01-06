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
    slug: '/docs/overview',
    title: t['overview.meta.title'],
    description: t['overview.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function OverviewDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['overview.title']}
      description={t['overview.description']}
      date={t['overview.date']}
      readTime={t['overview.readTime']}
      category={t['overview.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['overview.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['overview.visuals.systemMap.title']}
        description={t['overview.visuals.systemMap.description']}
        imageSrc={t['overview.visuals.systemMap.imageSrc']}
        imageAlt={t['overview.visuals.systemMap.imageAlt']}
        caption={t['overview.visuals.systemMap.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['overview.coreLoop.heading']}</h2>
        <GlassCard className="p-6">
          <ol className="space-y-3 text-muted-foreground list-decimal pl-6">
            {(t['overview.coreLoop.steps'] as string[]).map((step, index) => (
              <li key={index} className="leading-relaxed">{step}</li>
            ))}
          </ol>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['overview.components.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['overview.components.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['overview.dependencies.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['overview.dependencies.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['overview.codeMap.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 font-mono text-sm text-muted-foreground ml-6 list-disc">
            {(t['overview.codeMap.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Continue to the runtime walkthrough</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            See how the core loop executes in practice with detailed job timelines and artifact flows.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/runtime-walkthrough">Runtime walkthrough</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/architecture">Architecture overview</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
