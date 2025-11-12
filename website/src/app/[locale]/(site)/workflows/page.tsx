import { Metadata } from 'next';

import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { getPagesByCategory } from '@/data/pseo';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { GitMerge, Code2, Terminal } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'pages']);

  return generatePageMetadata({
    locale,
    slug: '/workflows',
    title: t['workflows.hub.meta.title'],
    description: t['workflows.hub.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function WorkflowsHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as Locale, ['common', 'pages']);

  const workflows = getPagesByCategory('workflows').filter(p => p.publish === true);

  // Group workflows by type
  const byTool = workflows.reduce((acc, page) => {
    const tool = page.tool_integration || 'general';
    if (!acc[tool]) acc[tool] = [];
    acc[tool].push(page);
    return acc;
  }, {} as Record<string, typeof workflows>);

  const toolNames: Record<string, string> = {
    'claude-code': t['workflows.hub.toolCategories.claudeCode'] ?? '',
    'cursor': t['workflows.hub.toolCategories.cursor'] ?? '',
    'codex-cli': t['workflows.hub.toolCategories.codexCli'] ?? '',
    'general': t['workflows.hub.toolCategories.general'] ?? '',
  };

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.workflows'] || 'Workflows')} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <GitMerge className="w-4 h-4" />
                  <span>{t['workflows.hub.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  {t['workflows.hub.title'] || 'AI-Powered Development Workflows'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['workflows.hub.description']}
                </p>
              </header>

              {/* Workflow Categories */}
              {Object.entries(byTool).map(([tool, pages]) => (
                <div key={tool} className="mb-16">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    {tool === 'claude-code' && <Code2 className="w-6 h-6 text-primary" />}
                    {tool === 'cursor' && <Terminal className="w-6 h-6 text-primary" />}
                    {tool === 'codex-cli' && <GitMerge className="w-6 h-6 text-primary" />}
                    {toolNames[tool] || tool}
                  </h2>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pages.map((page) => (
                      <GlassCard key={page.slug} className="p-6 flex flex-col">
                        <div className="mb-3">
                          {/* OS Badge */}
                          {page.os && (
                            <span className="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-medium capitalize">
                              {page.os}
                            </span>
                          )}
                        </div>

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
                          {t['workflows.hub.card.viewLink']}
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['workflows.hub.cta.title']}
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  {t['workflows.hub.cta.subtitle']}
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  {t['workflows.hub.cta.downloadLink']}
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
