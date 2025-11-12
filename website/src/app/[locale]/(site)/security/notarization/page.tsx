import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { cdnUrl } from '@/lib/cdn';
import { Header } from '@/components/landing/Header';
import { generatePageMetadata } from '@/content/metadata';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    locale,
    slug: '/security/notarization',
    title: 'macOS Notarization & Security',
    description: 'PlanToCode is signed and notarized by Apple for secure distribution on macOS. Learn about our security measures and Gatekeeper compliance.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function NotarizationPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-3xl">
          <h1 className="text-3xl font-bold mb-6">macOS Notarization</h1>
          <p className="text-foreground/90 mb-4">
            Our Mac app is signed and notarized by Apple. Notarization means Apple scans the app for malicious content and approves it for distribution. This reduces scary install prompts and helps Gatekeeper trust the app.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-6">
            <li>
              Apple Support: <a className="underline hover:text-primary" target="_blank" rel="noreferrer noopener" href="https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web">Gatekeeper and runtime protection</a>
            </li>
            <li>
              Apple Developer: <a className="underline hover:text-primary" target="_blank" rel="noreferrer noopener" href="https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution">Notarizing macOS software</a>
            </li>
          </ul>
          <p className="text-foreground/80">If you see warnings, try opening via the context menu and choose "Open", or see our <Link href="/downloads" className="underline hover:text-primary">Downloads</Link> page for guidance.</p>
        </main>
      </div>
    </>
  );
}
