import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);
  const title = t['evolution.meta.title'];
  const description = t['evolution.meta.description'];

  return generatePageMetadata({
    locale,
    slug: '/evolution',
    title,
    description,
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function EvolutionPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t['evolutionPage.hero.title']}
              </h1>
              <p className="text-muted-foreground">
                {t['evolutionPage.hero.description']}
              </p>
            </div>
          </section>

          <section className="py-8">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
              <DocsMediaBlock
                title={t['evolutionPage.visuals.timeline.title']}
                description={t['evolutionPage.visuals.timeline.description']}
                imageSrc={t['evolutionPage.visuals.timeline.imageSrc']}
                imageAlt={t['evolutionPage.visuals.timeline.imageAlt']}
                caption={t['evolutionPage.visuals.timeline.caption']}
              />
            </div>
          </section>

          <section className="py-12">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['evolutionPage.origins.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['evolutionPage.origins.description']}
              </p>
            </div>
          </section>

          <section className="py-12">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['evolutionPage.choices.title']}
              </h2>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  <strong>{t['evolutionPage.choices.items.0.title']}</strong> {t['evolutionPage.choices.items.0.description']}
                </li>
                <li>
                  <strong>{t['evolutionPage.choices.items.1.title']}</strong> {t['evolutionPage.choices.items.1.description']}
                </li>
                <li>
                  <strong>{t['evolutionPage.choices.items.2.title']}</strong> {t['evolutionPage.choices.items.2.description']}
                </li>
              </ul>
            </div>
          </section>

          <section className="py-12">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['evolutionPage.sourceAvailable.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['evolutionPage.sourceAvailable.description']}
              </p>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
