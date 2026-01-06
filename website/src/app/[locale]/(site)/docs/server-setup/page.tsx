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
    slug: '/docs/server-setup',
    title: t['serverSetup.meta.title'],
    description: t['serverSetup.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ServerSetupDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['serverSetup.title']}
      description={t['serverSetup.description']}
      date={t['serverSetup.date']}
      readTime={t['serverSetup.readTime']}
      category={t['serverSetup.category']}
    >
      <p>{t['serverSetup.intro']}</p>

      <section>
        <h2>{t['serverSetup.layers.heading']}</h2>
        <p>{t['serverSetup.layers.description']}</p>
        <ul>
          {(t['serverSetup.layers.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.servers.heading']}</h2>
        <p>{t['serverSetup.servers.description']}</p>
        <ul>
          {(t['serverSetup.servers.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.requirements.heading']}</h2>
        <ul>
          {(t['serverSetup.requirements.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.hardening.heading']}</h2>
        <p>{t['serverSetup.hardening.description']}</p>
        <ul>
          {(t['serverSetup.hardening.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.postgresql.heading']}</h2>
        <p>{t['serverSetup.postgresql.description']}</p>
        <ul>
          {(t['serverSetup.postgresql.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.redis.heading']}</h2>
        <p>{t['serverSetup.redis.description']}</p>
        <ul>
          {(t['serverSetup.redis.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.zeroDowntime.heading']}</h2>
        <p>{t['serverSetup.zeroDowntime.description']}</p>
        <ul>
          {(t['serverSetup.zeroDowntime.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.quickStart.heading']}</h2>
        <ol>
          {(t['serverSetup.quickStart.steps'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{t['serverSetup.vault.heading']}</h2>
        <p>{t['serverSetup.vault.description']}</p>
        <ul>
          {(t['serverSetup.vault.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.operations.heading']}</h2>
        <ul>
          {(t['serverSetup.operations.items'] as string[]).map((item) => (
            <li key={item}><code>{item}</code></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.ssl.heading']}</h2>
        <p>{t['serverSetup.ssl.description']}</p>
        <ul>
          {(t['serverSetup.ssl.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.security.heading']}</h2>
        <ul>
          {(t['serverSetup.security.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{t['serverSetup.recovery.heading']}</h2>
        <p>{t['serverSetup.recovery.description']}</p>
        <ul>
          {(t['serverSetup.recovery.items'] as string[]).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </DocsArticle>
  );
}
