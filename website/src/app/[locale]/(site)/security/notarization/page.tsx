import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { cdnUrl } from '@/lib/cdn';
import { Header } from '@/components/landing/Header';
import { generatePageMetadata } from '@/content/metadata';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import { loadMessagesFor } from '@/lib/i18n';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return generatePageMetadata({
    locale,
    slug: '/security/notarization',
    title: t['securityNotarization.meta.title'],
    description: t['securityNotarization.meta.description'],
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: t['securityNotarization.meta.imageAlt'],
    }],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function NotarizationPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['pages']);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-3xl">
          <h1 className="text-3xl font-bold mb-6">{t['securityNotarization.hero.title']}</h1>
          <p className="text-foreground/90 mb-4">
            {t['securityNotarization.hero.subtitle']}
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-6">
            <li>
              {t['securityNotarization.links.gatekeeper.label']}{' '}
              <a
                className="underline hover:text-primary"
                target="_blank"
                rel="noreferrer noopener"
                href="https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web"
              >
                {t['securityNotarization.links.gatekeeper.text']}
              </a>
            </li>
            <li>
              {t['securityNotarization.links.notarize.label']}{' '}
              <a
                className="underline hover:text-primary"
                target="_blank"
                rel="noreferrer noopener"
                href="https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution"
              >
                {t['securityNotarization.links.notarize.text']}
              </a>
            </li>
          </ul>
          <p className="text-foreground/80">
            {t['securityNotarization.footer.text']}{' '}
            <Link href="/downloads" className="underline hover:text-primary">
              {t['securityNotarization.footer.link']}
            </Link>
            .
          </p>
        </main>
      </div>
    </>
  );
}
