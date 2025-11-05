import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { PackageSearch, ClipboardCheck, ShieldCheck, FileOutput, GitBranch } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Upgrade Libraries with Guardrails - PlanToCode',
  description:
    'Plan migrations, monitor terminal output, and keep transcripts when updating frameworks or dependencies.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Upgrade Libraries with Guardrails - PlanToCode',
    description:
      'Use PlanToCode to scope changes, review plans, and capture execution history during library upgrades.',
    url: 'https://www.plantocode.com/solutions/library-upgrades',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/library-upgrades',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/library-upgrades',
      'en': 'https://www.plantocode.com/solutions/library-upgrades',
    },
  },
};
const sections = [
  { icon: PackageSearch, key: 'identifyFiles', link: '/docs/file-discovery' },
  { icon: ClipboardCheck, key: 'trackPlans', link: '/docs/implementation-plans' },
  { icon: ShieldCheck, key: 'modelLimits', link: '/docs/model-configuration' },
  { icon: FileOutput, key: 'executionHistory', link: '/docs/terminal-sessions' },
];
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function LibraryUpgradesPage({ params }: { params: Promise<{ locale: Locale }> }) {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500 text-sm font-medium">
                  <GitBranch className="w-4 h-4" />
                  <span>{t['libraryUpgrades.badge'] || 'Upgrade planning'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  {t['libraryUpgrades.title'] || 'Upgrade libraries with guardrails'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['libraryUpgrades.description'] || 'Modernising dependencies often spans multiple repositories and teams.'}
                </p>
              </header>
              <div className="grid md:grid-cols-2 gap-6">
                {sections.map(({ icon: Icon, key, link }) => (
                  <GlassCard key={key} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">{t[`libraryUpgrades.sections.${key}.title`] || ''}</h2>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      {t[`libraryUpgrades.sections.${key}.description`] || ''}
                    </p>
                    <LinkWithArrow href={link} className="text-sm mt-4">
                      {t[`libraryUpgrades.sections.${key}.link`] || 'Learn more'}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['libraryUpgrades.cta.title'] || 'Upgrade Dependencies Without Fear'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['libraryUpgrades.cta.description'] || 'Audit every change, track every migration, maintain full control.'}
                </p>
                <PlatformDownloadSection location="solutions_library_upgrades" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/implementation-plans">
                    {t['libraryUpgrades.cta.links.planning'] || 'Explore upgrade planning'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/file-discovery">
                    {t['libraryUpgrades.cta.links.scope'] || 'Learn about scope analysis'}
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
