import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getPagesByCategory } from '@/data/pseo';
import { Code2, Layers } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Development by Technology Stack - Python, TypeScript, Rust | PlanToCode',
  description: 'Stack-specific AI development workflows. Python Django, TypeScript Next.js, Rust systems programming, and more with architectural awareness.',
  openGraph: {
    title: 'Technology Stack Workflows - PlanToCode',
    description: 'AI development workflows tailored to your tech stack.',
    url: 'https://www.plantocode.com/stacks',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/stacks',
  },
};

export default function StacksHubPage() {
  const stacks = getPagesByCategory('stacks').filter(p => p.publish === true);

  // Group by language
  const byLanguage = stacks.reduce((acc, page) => {
    const lang = page.language || 'other';
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(page);
    return acc;
  }, {} as Record<string, typeof stacks>);

  const languageInfo: Record<string, { name: string; description: string }> = {
    python: {
      name: 'Python',
      description: 'Django, Flask, FastAPI - AI that understands Python conventions and frameworks',
    },
    typescript: {
      name: 'TypeScript',
      description: 'Next.js, React, Node.js - Full-stack JavaScript development with type safety',
    },
    rust: {
      name: 'Rust',
      description: 'Systems programming, WebAssembly, async Rust - Memory-safe development',
    },
    go: {
      name: 'Go',
      description: 'Microservices, CLI tools, concurrent systems - Simple, fast, reliable',
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
              <Breadcrumbs items={[{ label: 'Technology Stacks' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Layers className="w-4 h-4" />
                  <span>Technology Stacks</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  AI Development by Technology Stack
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Stack-specific workflows that understand your language's conventions, frameworks,
                  and architectural patterns. Not generic AI - deep stack awareness.
                </p>
              </header>

              {/* Stack Categories */}
              {Object.entries(byLanguage).map(([language, pages]) => (
                <div key={language} className="mb-16">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                      <Code2 className="w-6 h-6 text-primary" />
                      {languageInfo[language]?.name || language}
                    </h2>
                    {languageInfo[language]?.description && (
                      <p className="text-foreground/70">{languageInfo[language].description}</p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pages.map((page) => (
                      <GlassCard key={page.slug} className="p-6 flex flex-col">
                        <div className="mb-3 flex items-center gap-2 flex-wrap">
                          {page.framework && (
                            <span className="inline-block px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
                              {page.framework}
                            </span>
                          )}
                          {page.use_case && (
                            <span className="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-medium capitalize">
                              {page.use_case.replace('-', ' ')}
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold mb-2 text-lg line-clamp-2">
                          {page.headline}
                        </h3>

                        <p className="text-sm text-foreground/70 mb-4 line-clamp-3 flex-grow">
                          {page.subhead}
                        </p>

                        {/* Stack-specific features */}
                        {page.key_features && page.key_features.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs text-foreground/60 mb-2 font-medium">Stack features:</p>
                            <ul className="text-xs text-foreground/70 space-y-1">
                              {page.key_features.slice(0, 3).map((feature, i) => (
                                <li key={i} className="line-clamp-1">• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                          View stack workflow
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Why Stack-Specific Matters */}
              <div className="mb-16">
                <h2 className="text-2xl font-bold mb-6 text-center">Why Stack-Specific AI Matters</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Convention Understanding</h3>
                    <p className="text-sm text-foreground/70">
                      AI understands Django's MVT pattern, Next.js App Router, Rust's ownership model.
                      Not just syntax - deep framework knowledge.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Dependency Awareness</h3>
                    <p className="text-sm text-foreground/70">
                      Knows how Python imports work, TypeScript module resolution, Rust's cargo dependencies.
                      Prevents breaking changes.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">Best Practice Enforcement</h3>
                    <p className="text-sm text-foreground/70">
                      Follows idiomatic patterns for each language and framework. Generated code looks
                      like it was written by an experienced developer in that stack.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Build Better Code in Your Stack
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  AI that truly understands your technology choices and architectural patterns.
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  Start Building
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
