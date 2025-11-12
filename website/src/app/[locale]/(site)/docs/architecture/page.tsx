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
    slug: '/docs/architecture',
    title: t['architecture.meta.title'],
    description: t['architecture.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function PlanToCodeArchitecturePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <DocsArticle
      title={t['architecture.title'] ?? ''}
      description={t['architecture.description'] ?? ''}
      date={t['architecture.date'] ?? ''}
      readTime={t['architecture.readTime'] ?? ''}
      category={t['architecture.category'] ?? ''}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['architecture.intro']}
      </p>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.frontend.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.frontend.ui']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.frontend.providers']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.tauriCommands.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.tauriCommands.commands']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.tauriCommands.terminal']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.persistence.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.persistence.database']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.persistence.modelConfig']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.voicePipeline.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.voicePipeline.description']}
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
