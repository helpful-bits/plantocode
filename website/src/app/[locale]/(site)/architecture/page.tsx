import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);
  const title = t['architecture.meta.title'];
  const description = t['architecture.meta.description'];

  return generatePageMetadata({
    locale,
    slug: '/architecture',
    title,
    description,
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ArchitecturePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16">
            <div className="container mx-auto max-w-5xl text-center space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t['architecturePage.hero.title']}
              </h1>
              <p className="text-muted-foreground">
                {t['architecturePage.hero.description']}
              </p>
            </div>
          </section>

          <section className="py-8">
            <div className="container mx-auto max-w-5xl">
              <DocsMediaBlock
                title={t['architecturePage.visuals.systemMap.title']}
                description={t['architecturePage.visuals.systemMap.description']}
                imageSrc={t['architecturePage.visuals.systemMap.imageSrc']}
                imageAlt={t['architecturePage.visuals.systemMap.imageAlt']}
                caption={t['architecturePage.visuals.systemMap.caption']}
              />
            </div>
          </section>

          <section className="py-12">
            <div className="container mx-auto max-w-6xl">
              <div className="grid gap-8 md:grid-cols-2">
              <GlassCard>
                <h2 className="text-xl font-semibold">{t['architecturePage.sections.shell.title']}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t['architecturePage.sections.shell.description']}
                </p>
              </GlassCard>

              <GlassCard>
                <h2 className="text-xl font-semibold">{t['architecturePage.sections.core.title']}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t['architecturePage.sections.core.description']}
                </p>
              </GlassCard>

              <GlassCard>
                <h2 className="text-xl font-semibold">{t['architecturePage.sections.jobs.title']}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t['architecturePage.sections.jobs.description']}
                </p>
              </GlassCard>

              <GlassCard>
                <h2 className="text-xl font-semibold">{t['architecturePage.sections.llm.title']}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t['architecturePage.sections.llm.description']}
                </p>
              </GlassCard>
              </div>
            </div>
          </section>

          <section className="py-12 lg:py-16">
            <div className="container mx-auto max-w-5xl space-y-6">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['architecturePage.communication.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['architecturePage.communication.description']}
              </p>
              <p className="text-muted-foreground">
                {t['architecturePage.communication.followup']}
              </p>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
