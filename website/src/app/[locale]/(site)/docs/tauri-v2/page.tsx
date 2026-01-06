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
    slug: '/docs/tauri-v2',
    title: t['tauriV2.meta.title'],
    description: t['tauriV2.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function TauriV2DocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['tauriV2.title']}
      description={t['tauriV2.description']}
      date={t['tauriV2.date']}
      readTime={t['tauriV2.readTime']}
      category={t['tauriV2.category']}
    >
      <p>{t['tauriV2.intro']}</p>

      <section>
        <h2>{t['tauriV2.projectLayout.heading']}</h2>
        <p>{t['tauriV2.projectLayout.description']}</p>
        <ul>
          {(t['tauriV2.projectLayout.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.configuration.heading']}</h2>
        <p>{t['tauriV2.configuration.description']}</p>
        <ul>
          {(t['tauriV2.configuration.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.capabilities.heading']}</h2>
        <p>{t['tauriV2.capabilities.description']}</p>
        <ul>
          {(t['tauriV2.capabilities.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.plugins.heading']}</h2>
        <p>{t['tauriV2.plugins.description']}</p>
        <ul>
          {(t['tauriV2.plugins.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.appState.heading']}</h2>
        <p>{t['tauriV2.appState.description']}</p>
        <ul>
          {(t['tauriV2.appState.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.commands.heading']}</h2>
        <p>{t['tauriV2.commands.description']}</p>
        <ul>
          {(t['tauriV2.commands.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.singleInstance.heading']}</h2>
        <p>{t['tauriV2.singleInstance.description']}</p>
        <ul>
          {(t['tauriV2.singleInstance.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.devWorkflow.heading']}</h2>
        <p>{t['tauriV2.devWorkflow.description']}</p>
        <ul>
          {(t['tauriV2.devWorkflow.items'] as string[]).map((item) => (
            <li key={item}><code>{item}</code></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.mobile.heading']}</h2>
        <p>{t['tauriV2.mobile.description']}</p>
        <ul>
          {(t['tauriV2.mobile.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['tauriV2.distribution.heading']}</h2>
        <p>{t['tauriV2.distribution.description']}</p>
        <ul>
          {(t['tauriV2.distribution.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </DocsArticle>
  );
}
