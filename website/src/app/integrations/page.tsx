import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { cdnUrl } from '@/lib/cdn';
import { getPagesByCategory } from '@/data/pseo';
import { Terminal, Plug } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Tool Integrations - Claude, Cursor, Codex',
  description: 'Integrate PlanToCode with your favorite AI coding tools. Claude Code terminal execution, Cursor Composer context, Codex CLI planning workflows.',
  openGraph: {
    title: 'AI Tool Integrations - PlanToCode',
    description: 'Seamlessly integrate with Claude Code, Cursor, Codex CLI and more.',
    url: 'https://www.plantocode.com/integrations',
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
    canonical: 'https://www.plantocode.com/integrations',
  },
};

export default function IntegrationsHubPage() {
  const integrations = getPagesByCategory('integrations').filter(p => p.publish === true);

  // Group by tool
  const byTool = integrations.reduce((acc, page) => {
    const tool = page.tool_integration || 'other';
    if (!acc[tool]) acc[tool] = [];
    acc[tool].push(page);
    return acc;
  }, {} as Record<string, typeof integrations>);

  const toolInfo: Record<string, { name: string; description: string }> = {
    'claude-code': {
      name: 'Claude Code',
      description: 'Run Claude Code in persistent terminals with review and approval workflows',
    },
    'cursor': {
      name: 'Cursor',
      description: 'Enhance Cursor Composer with architectural context and file discovery',
    },
    'codex-cli': {
      name: 'Codex CLI',
      description: 'Plan first, then execute with Codex CLI in controlled environments',
    },
  };

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Integrations' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Plug className="w-4 h-4" />
                  <span>Tool Integrations</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  AI Coding Tool Integrations
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  PlanToCode enhances your existing AI coding tools with architectural planning,
                  file discovery, and persistent terminal sessions. No replacement - pure augmentation.
                </p>
              </header>

              {/* Integration Categories */}
              {Object.entries(byTool).map(([tool, pages]) => (
                <div key={tool} className="mb-16">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                      <Terminal className="w-6 h-6 text-primary" />
                      {toolInfo[tool]?.name || tool}
                    </h2>
                    {toolInfo[tool]?.description && (
                      <p className="text-foreground/70">{toolInfo[tool].description}</p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pages.map((page) => (
                      <GlassCard key={page.slug} className="p-6 flex flex-col">
                        <div className="mb-3 flex items-center gap-2">
                          {page.feature && (
                            <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 text-purple-500 text-xs font-medium capitalize">
                              {page.feature.replace('-', ' ')}
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold mb-2 text-lg line-clamp-2">
                          {page.headline}
                        </h3>

                        <p className="text-sm text-foreground/70 mb-4 line-clamp-3 flex-grow">
                          {page.subhead}
                        </p>

                        {/* Key features */}
                        {page.key_features && page.key_features.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-foreground/60 mb-2 font-medium">Features:</p>
                            <ul className="text-xs text-foreground/70 space-y-1">
                              {page.key_features.slice(0, 3).map((feature, i) => (
                                <li key={i} className="line-clamp-1">• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                          View integration
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Enhance Your AI Coding Tools Today
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Add architectural awareness, file discovery, and persistent terminals to the tools you already use.
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
