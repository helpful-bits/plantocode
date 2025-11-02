import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { cdnUrl } from '@/lib/cdn';
import { getPagesByCategory } from '@/data/pseo';
import { GitMerge, Code2, Terminal } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Coding Workflows - PlanToCode Integration Patterns',
  description: 'AI development workflows for complex tasks. Integrate with Claude Code, Cursor, Codex for refactors, bug triage, and migrations.',
  openGraph: {
    title: 'AI Coding Workflows - PlanToCode Integration Patterns',
    description: 'Explore AI-powered development workflows for complex tasks.',
    url: 'https://www.plantocode.com/workflows',
    type: 'website',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/workflows',
  },
};

export default function WorkflowsHubPage() {
  const workflows = getPagesByCategory('workflows').filter(p => p.publish === true);

  // Group workflows by type
  const byTool = workflows.reduce((acc, page) => {
    const tool = page.tool_integration || 'general';
    if (!acc[tool]) acc[tool] = [];
    acc[tool].push(page);
    return acc;
  }, {} as Record<string, typeof workflows>);

  const toolNames: Record<string, string> = {
    'claude-code': 'Claude Code Workflows',
    'cursor': 'Cursor Workflows',
    'codex-cli': 'Codex CLI Workflows',
    'general': 'General Workflows',
  };

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Workflows' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <GitMerge className="w-4 h-4" />
                  <span>AI Development Workflows</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  AI-Powered Development Workflows
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Discover proven workflows for complex development tasks. Each workflow combines file discovery,
                  multi-model planning, and integrated terminal execution to solve real engineering challenges.
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
                          View workflow
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Ready to Transform Your Development Workflow?
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Start with file discovery, generate comprehensive plans, and execute with confidence.
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
