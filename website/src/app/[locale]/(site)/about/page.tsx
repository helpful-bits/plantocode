import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/about',
      title: t['about.meta.title'],
      description: t['about.meta.description'],
    }),
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16">
            <div className="container mx-auto max-w-5xl space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {t['aboutPage.hero.title']}
              </h1>
              <p className="text-muted-foreground">
                {t['aboutPage.hero.description']}
              </p>
            </div>
          </section>

          <section className="py-12 lg:py-16">
            <div className="container mx-auto max-w-5xl space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['aboutPage.reference.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['aboutPage.reference.description']}
              </p>
            </div>
          </section>

          <section className="py-12 lg:py-16">
            <div className="container mx-auto max-w-5xl space-y-6">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['aboutPage.governance.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['aboutPage.governance.description']}
              </p>
            </div>
          </section>

          <section className="py-12 lg:py-16">
            <div className="container mx-auto max-w-5xl space-y-6">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t['aboutPage.stack.title']}
              </h2>
              <p className="text-muted-foreground">
                {t['aboutPage.stack.description']}
              </p>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
