import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Layers, Workflow, Merge, ClipboardList, Settings } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Ship Large Features with Traceable Plans - PlanToCode',
  description:
    'Use PlanToCode to coordinate implementation plans, model selections, and background workflows when delivering multi-step features.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Ship Large Features with Traceable Plans - PlanToCode',
    description:
      'Organise multi-step implementation work with plan history, model guardrails, and reusable workflows.',
    url: 'https://www.plantocode.com/solutions/large-features',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/large-features',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/large-features',
      'en': 'https://www.plantocode.com/solutions/large-features',
    },
  },
};
const sections = [
  { icon: Workflow, key: 'sameScope', link: '/docs/file-discovery' },
  { icon: ClipboardList, key: 'coordinatePlans', link: '/docs/implementation-plans' },
  { icon: Settings, key: 'pickModel', link: '/docs/model-configuration' },
  { icon: Merge, key: 'keepAligned', link: '/docs/terminal-sessions' },
];
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function LargeFeaturesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Layers className="w-4 h-4" />
                  <span>{t['largeFeatures.badge'] || 'Feature planning'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  {t['largeFeatures.title'] || 'Ship large features with traceable plans'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['largeFeatures.description'] || 'Multi-stage delivery depends on consistent scope, reviewable plans, and predictable token usage.'}
                </p>
              </header>
              <div className="grid md:grid-cols-2 gap-6">
                {sections.map(({ icon: Icon, key, link }) => (
                  <GlassCard key={key} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">{t[`largeFeatures.sections.${key}.title`] || ''}</h2>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      {t[`largeFeatures.sections.${key}.description`] || ''}
                    </p>
                    <LinkWithArrow href={link} className="text-sm mt-4">
                      {t[`largeFeatures.sections.${key}.link`] || 'Learn more'}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['largeFeatures.cta.title'] || 'Ship Complex Features with Confidence'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['largeFeatures.cta.description'] || 'From first workflow to final deployment, maintain perfect traceability.'}
                </p>
                <PlatformDownloadSection location="solutions_large_features" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/implementation-plans">
                    {t['largeFeatures.cta.links.plans'] || 'See implementation planning'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/file-discovery">
                    {t['largeFeatures.cta.links.workflows'] || 'Learn about scoped workflows'}
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
