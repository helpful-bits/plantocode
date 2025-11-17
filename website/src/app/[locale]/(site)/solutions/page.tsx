import { Metadata } from 'next';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { locales } from '@/i18n/config';
import {
  AlertTriangle, Boxes, Wrench, Library, Code2, FileWarning, Shield, Cog
} from 'lucide-react';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'solutions']);

  return generatePageMetadata({
    locale,
    slug: '/solutions',
    title: t['hub.meta.title'],
    description: t['hub.meta.description'],
  });
}
const solutionsMeta = [
  {
    slug: '/solutions/hard-bugs',
    key: 'hardBugs',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    category: 'Debugging'
  },
  {
    slug: '/solutions/large-features',
    key: 'largeFeatures',
    icon: Boxes,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    category: 'Development'
  },
  {
    slug: '/solutions/library-upgrades',
    key: 'libraryUpgrades',
    icon: Library,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    category: 'Maintenance'
  },
  {
    slug: '/solutions/maintenance-enhancements',
    key: 'maintenanceEnhancements',
    icon: Wrench,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    category: 'Maintenance'
  },
  {
    slug: '/solutions/legacy-code-refactoring',
    key: 'legacyCodeRefactoring',
    icon: Code2,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    category: 'Refactoring'
  },
  {
    slug: '/solutions/prevent-duplicate-files',
    key: 'preventDuplicateFiles',
    icon: FileWarning,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'Safety'
  },
  {
    slug: '/solutions/ai-wrong-paths',
    key: 'aiWrongPaths',
    icon: Shield,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    category: 'Safety'
  },
  {
    slug: '/solutions/safe-refactoring',
    key: 'safeRefactoring',
    icon: Cog,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    category: 'Refactoring'
  }
];
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function SolutionsHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as Locale, ['common', 'solutions']);
  // Group solutions by category
  const categoryMap: Record<string, string> = {
    'Debugging': t['hub.categories.debugging'] || 'Debugging',
    'Development': t['hub.categories.development'] || 'Development',
    'Maintenance': t['hub.categories.maintenance'] || 'Maintenance',
    'Refactoring': t['hub.categories.refactoring'] || 'Refactoring',
    'Safety': t['hub.categories.safety'] || 'Safety'
  };
  const categories = solutionsMeta.reduce((acc, solution) => {
    const category = solution.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(solution);
    return acc;
  }, {} as Record<string, typeof solutionsMeta>);
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.solutions'] || 'Solutions')} />
              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Code2 className="w-4 h-4" />
                  <span>{t['hub.badge'] || 'Development Solutions'}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  {t['hub.title'] || 'AI-Powered Development Solutions'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  {t['hub.description'] || 'Tackle complex development challenges with AI-powered planning.'}
                </p>
              </header>
              {/* Solutions by Category */}
              {Object.entries(categories).map(([category, items]) => (
                <div key={category} className="mb-16">
                  <h2 className="text-2xl font-bold mb-6">{categoryMap[category] || category}</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((solution) => {
                      const Icon = solution.icon;
                      const title = t[`hub.solutions.${solution.key}.title`] || '';
                      const description = t[`hub.solutions.${solution.key}.description`] || '';
                      return (
                        <GlassCard key={solution.slug} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                          <div className={`w-12 h-12 rounded-lg ${solution.bgColor} flex items-center justify-center mb-4`}>
                            <Icon className={`w-6 h-6 ${solution.color}`} />
                          </div>
                          <h3 className="font-semibold mb-2 text-lg">
                            {title}
                          </h3>
                          <p className="text-sm text-foreground/70 mb-4 flex-grow">
                            {description}
                          </p>
                          <LinkWithArrow href={solution.slug} className="text-sm mt-auto">
                            {t['hub.viewSolution'] || 'View solution'}
                          </LinkWithArrow>
                        </GlassCard>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['hub.cta.title'] || 'Ready to Solve Your Development Challenges?'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['hub.cta.description'] || 'Start planning complex changes with confidence.'}
                </p>
                <PlatformDownloadSection location="solutions_hub" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features">
                    {t['hub.cta.links.features'] || 'Explore features'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs">
                    {t['hub.cta.links.docs'] || 'Read documentation'}
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
