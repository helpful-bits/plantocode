import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/distribution-windows',
    title: t['distributionWindows.meta.title'],
    description: t['distributionWindows.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function DistributionWindowsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['distributionWindows.title']}
      description={t['distributionWindows.description']}
      date={t['distributionWindows.date']}
      readTime={t['distributionWindows.readTime']}
      category={t['distributionWindows.category']}
    >
      <p>{t['distributionWindows.intro']}</p>

      <section>
        <h2>{t['distributionWindows.prereqs.heading']}</h2>
        <p>{t['distributionWindows.prereqs.description']}</p>
        <ul>
          {(t['distributionWindows.prereqs.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.nsisBuild.heading']}</h2>
        <p>{t['distributionWindows.nsisBuild.description']}</p>
        <ul>
          {(t['distributionWindows.nsisBuild.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.codeSigning.heading']}</h2>
        <p>{t['distributionWindows.codeSigning.description']}</p>
        <ul>
          {(t['distributionWindows.codeSigning.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.msixPackaging.heading']}</h2>
        <p>{t['distributionWindows.msixPackaging.description']}</p>
        <ul>
          {(t['distributionWindows.msixPackaging.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.msixConfig.heading']}</h2>
        <p>{t['distributionWindows.msixConfig.description']}</p>
        <ul>
          {(t['distributionWindows.msixConfig.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.msixSteps.heading']}</h2>
        <p>{t['distributionWindows.msixSteps.description']}</p>
        <ol>
          {(t['distributionWindows.msixSteps.steps'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{t['distributionWindows.store.heading']}</h2>
        <p>{t['distributionWindows.store.description']}</p>
        <ul>
          {(t['distributionWindows.store.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.updaterWindows.heading']}</h2>
        <p>{t['distributionWindows.updaterWindows.description']}</p>
        <ul>
          {(t['distributionWindows.updaterWindows.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.webview2.heading']}</h2>
        <p>{t['distributionWindows.webview2.description']}</p>
        <ul>
          {(t['distributionWindows.webview2.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionWindows.troubleshooting.heading']}</h2>
        <p>{t['distributionWindows.troubleshooting.description']}</p>
        <ul>
          {(t['distributionWindows.troubleshooting.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </DocsArticle>
  );
}
