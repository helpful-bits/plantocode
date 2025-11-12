import type { Metadata } from 'next';

import { Header } from '@/components/landing/Header';
import { ScreenshotGallery } from '@/components/demo/ScreenshotGallery';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/screenshots',
      title: t['screenshots.meta.title'],
      description: t['screenshots.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'plantocode screenshots',
    'ai planning interface',
    'implementation plan examples',
    'file discovery workflow',
    'terminal integration demo',
    'monaco editor screenshots',
    'multi-model planning UI',
    'voice transcription interface',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ScreenshotsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />

        <main className="flex-grow">
          <section className="pt-20 sm:pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['screenshots.title']}
                </h1>
                <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto">
                  {t['screenshots.description']}
                </p>
              </div>
            </div>
          </section>

          <ScreenshotGallery />
        </main>
      </div>
    </>
  );
}