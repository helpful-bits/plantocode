import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Wrench, RefreshCw, History, Settings2, Archive } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Maintenance & Enhancements with Repeatable Workflows - PlanToCode',
  description:
    'Apply systematic maintenance tasks with scoped discovery, plan history, and auditable terminal logs.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Maintenance & Enhancements with Repeatable Workflows - PlanToCode',
    description:
      'Keep context across maintenance tasks with stored roots, historical plans, and voice notes.',
    url: 'https://www.plantocode.com/solutions/maintenance-enhancements',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/maintenance-enhancements',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/maintenance-enhancements',
      'en': 'https://www.plantocode.com/solutions/maintenance-enhancements',
    },
  },
};
const sections = [
  { icon: RefreshCw, key: 'reuseWorkflows', link: '/docs/file-discovery' },
  { icon: History, key: 'planHistory', link: '/docs/implementation-plans' },
  { icon: Settings2, key: 'controlModels', link: '/docs/model-configuration' },
  { icon: Archive, key: 'preserveLogs', link: '/docs/terminal-sessions' },
];
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function MaintenanceEnhancementsPage({ params }: { params: Promise<{ locale: Locale }> }) {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 text-yellow-500 text-sm font-medium">
                  <Wrench className="w-4 h-4" />
                  <span>{t['maintenanceEnhancements.badge'] || 'Ongoing maintenance'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  {t['maintenanceEnhancements.title'] || 'Maintain systems with repeatable workflows'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['maintenanceEnhancements.description'] || 'Maintenance work slows down when teams lose track of scope or repeat the same investigations.'}
                </p>
              </header>
              <div className="grid md:grid-cols-2 gap-6">
                {sections.map(({ icon: Icon, key, link }) => (
                  <GlassCard key={key} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">{t[`maintenanceEnhancements.sections.${key}.title`] || ''}</h2>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      {t[`maintenanceEnhancements.sections.${key}.description`] || ''}
                    </p>
                    <LinkWithArrow href={link} className="text-sm mt-4">
                      {t[`maintenanceEnhancements.sections.${key}.link`] || 'Learn more'}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['maintenanceEnhancements.cta.title'] || 'Transform Maintenance into Strategic Advantage'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['maintenanceEnhancements.cta.description'] || 'Build systematic maintenance workflows.'}
                </p>
                <PlatformDownloadSection location="solutions_maintenance" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/file-discovery">
                    {t['maintenanceEnhancements.cta.links.workflows'] || 'Explore scoped workflows'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/implementation-plans">
                    {t['maintenanceEnhancements.cta.links.history'] || 'Learn about plan history'}
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
