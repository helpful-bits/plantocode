import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getPagesByCategory } from '@/data/pseo';
import { Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Use Cases by Role - AI Tools for Engineers | PlanToCode',
  description: 'Explore PlanToCode use cases by engineering role: Backend, Frontend, Mobile, Platform, Security, Data, ML, DevOps, QA, and more.',
  openGraph: {
    title: 'Use Cases by Role - AI Tools for Engineers | PlanToCode',
    description: 'AI-powered development tools tailored for your engineering role.',
    url: 'https://www.plantocode.com/use-cases',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/use-cases',
  },
};

export default function UseCasesHubPage() {
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
              <Breadcrumbs items={[{ label: 'Use Cases' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Users className="w-4 h-4" />
                  <span>Role-Based Use Cases</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  AI Development Tools by Role
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  Discover how PlanToCode helps engineers across different roles tackle their specific challenges.
                  From architectural decisions to test automation, find use cases tailored to your work.
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
                            <p className="text-xs text-foreground/60 mb-2 font-medium">Solves:</p>
                            <ul className="text-xs text-foreground/70 space-y-1">
                              {page.pain_points.slice(0, 2).map((pain, i) => (
                                <li key={i} className="line-clamp-1">• {pain.problem}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                          View use case
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Ready to Enhance Your Engineering Workflow?
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Join engineers who trust PlanToCode for complex development challenges.
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  Download PlanToCode
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
