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
    slug: '/docs/model-configuration',
    title: t['modelConfiguration.meta.title'],
    description: t['modelConfiguration.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function ModelConfigurationDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <DocsArticle
      title={t['modelConfiguration.title'] ?? ''}
      description={t['modelConfiguration.description'] ?? ''}
      date={t['modelConfiguration.date'] ?? ''}
      readTime={t['modelConfiguration.readTime'] ?? ''}
      category={t['modelConfiguration.category'] ?? ''}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['modelConfiguration.intro']}
      </p>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['modelConfiguration.taskDefaults.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['modelConfiguration.taskDefaults.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['modelConfiguration.selectorToggle.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {(t['modelConfiguration.selectorToggle.description'] ?? '').split('{code}')[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">ModelSelectorToggle</code>
            {(t['modelConfiguration.selectorToggle.description'] ?? '').split('{code}')[1] || ''}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['modelConfiguration.selectorToggle.guardrails']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['modelConfiguration.promptEstimation.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['modelConfiguration.promptEstimation.description']}
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
