import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { getPagesByCategory } from '@/data/pseo';
import { Code2, Layers } from 'lucide-react';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/stacks',
    title: t['stacks.meta.title'],
    description: t['stacks.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function StacksHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
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
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.stacks'] || 'Technology Stacks')} />
              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Layers className="w-4 h-4" />
                  <span>{t['stacks.badge.technologyStacks'] || 'Technology Stacks'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  {t['stacks.hero.heading'] || 'AI Development by Technology Stack'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['stacks.hero.subtitle'] || 'Stack-specific workflows that understand your language\'s conventions, frameworks, and architectural patterns. Not generic AI - deep stack awareness.'}
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
                            <p className="text-xs text-foreground/60 mb-2 font-medium">{t['stacks.card.stackFeatures'] || 'Stack features:'}</p>
                            <ul className="text-xs text-foreground/70 space-y-1">
                              {page.key_features.slice(0, 3).map((feature, i) => (
                                <li key={i} className="line-clamp-1">• {feature}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                          {t['stacks.card.viewWorkflow'] || 'View stack workflow'}
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}
              {/* Why Stack-Specific Matters */}
              <div className="mb-16">
                <h2 className="text-2xl font-bold mb-6 text-center">{t['stacks.section.whyMatters'] || 'Why Stack-Specific AI Matters'}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['stacks.benefits.convention.title'] || 'Convention Understanding'}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['stacks.benefits.convention.description'] || 'AI understands Django\'s MVT pattern, Next.js App Router, Rust\'s ownership model. Not just syntax - deep framework knowledge.'}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['stacks.benefits.dependency.title'] || 'Dependency Awareness'}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['stacks.benefits.dependency.description'] || 'Knows how Python imports work, TypeScript module resolution, Rust\'s cargo dependencies. Prevents breaking changes.'}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['stacks.benefits.practices.title'] || 'Best Practice Enforcement'}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['stacks.benefits.practices.description'] || 'Follows idiomatic patterns for each language and framework. Generated code looks like it was written by an experienced developer in that stack.'}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['stacks.cta.heading'] || 'Build Better Code in Your Stack'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  {t['stacks.cta.description'] || 'AI that truly understands your technology choices and architectural patterns.'}
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  {t['stacks.cta.button'] || 'Start Building'}
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
