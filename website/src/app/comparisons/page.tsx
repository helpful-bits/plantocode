import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getPagesByCategory } from '@/data/pseo';
import { Layers, GitCompare } from 'lucide-react';

export const metadata: Metadata = {
  title: 'PlanToCode vs Alternatives - Feature Comparisons',
  description: 'Compare PlanToCode with tmux, script, asciinema, Cursor, Claude Code, and other development tools. See how architectural planning improves your workflow.',
  openGraph: {
    title: 'PlanToCode Comparisons - vs tmux, Cursor, Claude Code',
    description: 'Detailed feature comparisons with alternative development tools.',
    url: 'https://www.plantocode.com/comparisons',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/comparisons',
  },
};

export default function ComparisonsHubPage() {
  const comparisons = getPagesByCategory('comparisons').filter(p => p.publish === true);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Comparisons' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <GitCompare className="w-4 h-4" />
                  <span>Tool Comparisons</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  PlanToCode vs Alternatives
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  See how PlanToCode's architectural planning approach compares to traditional terminal tools,
                  AI coding assistants, and other development workflows.
                </p>
              </header>

              {/* Comparison Grid */}
              <div className="grid md:grid-cols-2 gap-6 mb-16">
                {comparisons.map((page) => (
                  <GlassCard key={page.slug} className="p-6 flex flex-col">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium">
                        Comparison
                      </span>
                    </div>

                    <h3 className="font-semibold mb-2 text-xl line-clamp-2">
                      {page.headline}
                    </h3>

                    <p className="text-sm text-foreground/70 mb-4 line-clamp-2">
                      {page.subhead}
                    </p>

                    {/* Key differences */}
                    {page.pain_points && page.pain_points.length > 0 && (
                      <div className="mb-4 flex-grow">
                        <p className="text-xs text-foreground/60 mb-2 font-medium">Why developers switch:</p>
                        <ul className="text-xs text-foreground/70 space-y-2">
                          {page.pain_points.slice(0, 3).map((pain, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Layers className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{pain.solution}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                      View comparison
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>

              {/* What Makes PlanToCode Different */}
              <div className="mb-16">
                <h2 className="text-2xl font-bold mb-6 text-center">What Makes PlanToCode Different</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Architectural Awareness</h3>
                    <p className="text-sm text-foreground/70">
                      Multi-stage file discovery maps your entire codebase architecture before making changes.
                      Most tools only see what you show them.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Multi-Model Planning</h3>
                    <p className="text-sm text-foreground/70">
                      Generate plans from multiple AI models (GPT-5, Claude 4.5, Gemini 2.5 Pro) and merge the best insights.
                      Single-model tools miss perspectives.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Human-in-the-Loop</h3>
                    <p className="text-sm text-foreground/70">
                      Review, edit, and approve every plan before execution. Persistent terminal sessions let you pause,
                      investigate, and resume anytime.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Experience the Difference
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  See why developers are switching to PlanToCode for complex, mission-critical work.
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  Try PlanToCode Free
                </LinkWithArrow>
                <p className="text-sm text-foreground/60 mt-4">
                  $5 free credits • No credit card required
                </p>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
