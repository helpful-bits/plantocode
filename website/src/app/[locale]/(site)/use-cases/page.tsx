import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { getPagesByCategory } from '@/data/pseo';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { Users } from 'lucide-react';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common']);

  return generatePageMetadata({
    locale,
    slug: '/use-cases',
    title: t['useCases.meta.title'],
    description: t['useCases.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function UseCasesHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common']);
  const useCases = getPagesByCategory('use-cases').filter(p => p.publish === true);
  // Group by role
  const byRole = useCases.reduce((acc, page) => {
    const role = page.role || 'general';
    if (!acc[role]) acc[role] = [];
    acc[role].push(page);
    return acc;
  }, {} as Record<string, typeof useCases>);
  const roleNames: Record<string, string> = {
    'backend-engineer': 'Backend Engineer',
    'frontend-engineer': 'Frontend Engineer',
    'mobile-engineer': 'Mobile Engineer',
    'platform-engineer': 'Platform Engineer',
    'security-engineer': 'Security Engineer',
    'data-engineer': 'Data Engineer',
    'ml-engineer': 'ML Engineer',
    'devops-engineer': 'DevOps Engineer',
    'sdet': 'SDET',
    'qa-lead': 'QA Lead',
    'tech-lead': 'Tech Lead',
    'staff-engineer': 'Staff Engineer',
    'engineering-manager': 'Engineering Manager',
    'general': 'General Use Cases',
  };
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.useCases'] || 'Use Cases')} />
              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Users className="w-4 h-4" />
                  <span>{t['useCases.badge.roleBasedUseCases'] || 'Role-Based Use Cases'}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  {t['useCases.header.title'] || 'AI Development Tools by Role'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  {t['useCases.header.description'] || 'Discover how PlanToCode helps engineers across different roles tackle their specific challenges. From architectural decisions to test automation, find use cases tailored to your work.'}
                </p>
              </header>
              {/* Use Cases by Role */}
              {Object.entries(byRole).map(([role, pages]) => (
                <div key={role} className="mb-16">
                  <h2 className="text-2xl font-bold mb-6">
                    {roleNames[role] || role}
                  </h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pages.map((page) => (
                      <GlassCard key={page.slug} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                        <h3 className="font-semibold mb-2 text-lg line-clamp-2">
                          {page.headline}
                        </h3>
                        <p className="text-sm text-foreground/70 mb-4 line-clamp-3 flex-grow">
                          {page.subhead}
                        </p>
                        {/* Pain points preview */}
                        {page.pain_points && page.pain_points.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-foreground/60 mb-2 font-medium">{t['useCases.card.solves'] || 'Solves:'}</p>
                            <ul className="text-xs text-foreground/70 space-y-1">
                              {page.pain_points.slice(0, 2).map((pain, i) => (
                                <li key={i} className="line-clamp-1">• {pain.problem}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                          {t['useCases.card.viewUseCase'] || 'View use case'}
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}
              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['useCases.cta.heading'] || 'Ready to Enhance Your Engineering Workflow?'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['useCases.cta.description'] || 'Join engineers who trust PlanToCode for complex development challenges.'}
                </p>
                <PlatformDownloadSection location="use_cases_hub" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/solutions">
                    {t['useCases.cta.links.solutions'] || 'View solutions'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/demo">
                    {t['useCases.cta.links.demo'] || 'Watch demo'}
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
