import type { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/demo',
    title: t['demo.meta.title'],
    description: t['demo.meta.description'],
  });
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
