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
    slug: '/docs/distribution-macos',
    title: t['distributionMacos.meta.title'],
    description: t['distributionMacos.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function DistributionMacosDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['distributionMacos.title']}
      description={t['distributionMacos.description']}
      date={t['distributionMacos.date']}
      readTime={t['distributionMacos.readTime']}
      category={t['distributionMacos.category']}
    >
      <p>{t['distributionMacos.intro']}</p>

      <section>
        <h2>{t['distributionMacos.signing.heading']}</h2>
        <p>{t['distributionMacos.signing.description']}</p>
        <ul>
          {(t['distributionMacos.signing.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.entitlements.heading']}</h2>
        <p>{t['distributionMacos.entitlements.description']}</p>
        <ul>
          {(t['distributionMacos.entitlements.items'] as string[]).map((item) => (
            <li key={item}><code>{item}</code></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.build.heading']}</h2>
        <p>{t['distributionMacos.build.description']}</p>
        <ol>
          {(t['distributionMacos.build.steps'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{t['distributionMacos.universalBinaries.heading']}</h2>
        <p>{t['distributionMacos.universalBinaries.description']}</p>
        <ul>
          {(t['distributionMacos.universalBinaries.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.notarization.heading']}</h2>
        <p>{t['distributionMacos.notarization.description']}</p>
        <ul>
          {(t['distributionMacos.notarization.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.updater.heading']}</h2>
        <p>{t['distributionMacos.updater.description']}</p>
        <ul>
          {(t['distributionMacos.updater.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.latestJson.heading']}</h2>
        <p>{t['distributionMacos.latestJson.description']}</p>
        <ul>
          {(t['distributionMacos.latestJson.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.pitfalls.heading']}</h2>
        <p>{t['distributionMacos.pitfalls.description']}</p>
        <ul>
          {(t['distributionMacos.pitfalls.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['distributionMacos.verification.heading']}</h2>
        <p>{t['distributionMacos.verification.description']}</p>
        <ul>
          {(t['distributionMacos.verification.items'] as string[]).map((item) => (
            <li key={item}><code>{item}</code></li>
          ))}
        </ul>
      </section>
    </DocsArticle>
  );
}
