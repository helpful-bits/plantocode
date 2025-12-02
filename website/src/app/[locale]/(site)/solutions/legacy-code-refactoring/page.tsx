import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildSolutionBreadcrumbs } from '@/components/breadcrumbs/utils';
import { RelatedSolutions } from '@/components/RelatedContent';
import { RefreshCw, FileSearch, GitMerge, Shield, Layers } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/solutions/legacy-code-refactoring',
      title: t['solutions.legacyCodeRefactoring.meta.title'],
      description: t['solutions.legacyCodeRefactoring.meta.description'],
    }),
    keywords: mergeKeywords(
      [
        'legacy code refactoring tools',
        'legacy code refactoring',
        'refactor legacy code',
        'modernize legacy code',
        'ai refactoring',
        'code modernization',
      ],
      COMMON_KEYWORDS.core
    ),
  };
}

const sections = [
  { icon: FileSearch, key: 'dependencyMapping', link: '/docs/file-discovery' },
  { icon: GitMerge, key: 'multiModelPlanning', link: '/docs/implementation-plans' },
  { icon: Shield, key: 'safeRefactoring', link: '/features/merge-instructions' },
  { icon: Layers, key: 'incrementalMigration', link: '/docs/terminal-sessions' },
];

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function LegacyCodeRefactoringPage({ params }: { params: Promise<{ locale: Locale }> }) {
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
              <Breadcrumbs items={buildSolutionBreadcrumbs(t['solutions.legacyCodeRefactoring.title'] || 'Legacy Code Refactoring')} />
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <RefreshCw className="w-4 h-4" />
                  <span>{t['solutions.legacyCodeRefactoring.badge'] || 'Code modernization'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  {t['solutions.legacyCodeRefactoring.title'] || 'Modernize legacy codebases without breaking production'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['solutions.legacyCodeRefactoring.description'] || 'PlanToCode discovers hidden dependencies, generates multi-model migration plans, and enables incremental refactoring with rollback safety.'}
                </p>
              </header>
              <div className="grid md:grid-cols-2 gap-6">
                {sections.map(({ icon: Icon, key, link }) => (
                  <GlassCard key={key} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">{t[`solutions.legacyCodeRefactoring.sections.${key}.title`] || ''}</h2>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      {t[`solutions.legacyCodeRefactoring.sections.${key}.description`] || ''}
                    </p>
                    <LinkWithArrow href={link} className="text-sm mt-4">
                      {t[`solutions.legacyCodeRefactoring.sections.${key}.link`] || 'Learn more'}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>
              <RelatedSolutions currentSlug="solutions/legacy-code-refactoring" maxItems={3} />
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['solutions.legacyCodeRefactoring.cta.title'] || 'Start Modernizing Your Legacy Code'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['solutions.legacyCodeRefactoring.cta.description'] || 'Discover dependencies, plan migrations, and execute with confidence.'}
                </p>
                <PlatformDownloadSection location="solutions_legacy_refactoring" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/file-discovery">
                    {t['solutions.legacyCodeRefactoring.cta.links.discovery'] || 'Explore file discovery'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/implementation-plans">
                    {t['solutions.legacyCodeRefactoring.cta.links.plans'] || 'Learn about migration plans'}
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
