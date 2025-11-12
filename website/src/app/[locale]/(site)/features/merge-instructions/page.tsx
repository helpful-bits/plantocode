import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { RelatedFeatures } from '@/components/RelatedContent';
import { GitMerge, MessageSquare, CheckCircle2, Layers, Target, Brain } from 'lucide-react';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/merge-instructions',
      title: t['features.mergeInstructions.meta.title'],
      description: t['features.mergeInstructions.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'architectural synthesis',
    'implementation plan merge',
    'source traceability',
    'conflict resolution',
    'SOLID principles',
    'emergent solutions',
    'multi-model synthesis',
    'plan consolidation',
    'intelligent merging',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function MergeInstructionsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <GitMerge className="w-4 h-4" />
                  <span>{t['mergeInstructions.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['mergeInstructions.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['mergeInstructions.hero.description']}
                </p>
              </div>
              {/* Key Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['mergeInstructions.features.architecturalAnalysis.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['mergeInstructions.features.architecturalAnalysis.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['mergeInstructions.features.solidResolution.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['mergeInstructions.features.solidResolution.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Layers className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['mergeInstructions.features.sourceTraceability.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['mergeInstructions.features.sourceTraceability.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['mergeInstructions.process.title']}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Layers className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['mergeInstructions.process.multiModel.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['mergeInstructions.process.multiModel.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.multiModel.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.multiModel.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.multiModel.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.multiModel.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <MessageSquare className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['mergeInstructions.process.instructions.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['mergeInstructions.process.instructions.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.instructions.examples.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.instructions.examples.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.instructions.examples.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.instructions.examples.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['mergeInstructions.process.deepAnalysis.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['mergeInstructions.process.deepAnalysis.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.deepAnalysis.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.deepAnalysis.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.deepAnalysis.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.deepAnalysis.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Brain className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['mergeInstructions.process.synthesis.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['mergeInstructions.process.synthesis.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.synthesis.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.synthesis.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.synthesis.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['mergeInstructions.process.synthesis.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* System Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['mergeInstructions.capabilities.title']}</h2>
                <div className="grid md:grid-cols-2 gap-6 mb-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-primary">{t['mergeInstructions.capabilities.whatAIDoes.title']}</h3>
                    <ul className="space-y-3 text-sm text-foreground/80">
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{t[`mergeInstructions.capabilities.whatAIDoes.items.${i}`]}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-primary">{t['mergeInstructions.capabilities.instructionControl.title']}</h3>
                    <ul className="space-y-3 text-sm">
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                        const item = t[`mergeInstructions.capabilities.instructionControl.examples.${i}`] as { type: string; example: string } | undefined;
                        if (!item) return null;
                        return (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-500 dark:text-yellow-400 font-semibold">{item.type}:</span>
                            <span className="text-foreground/80">{item.example}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </GlassCard>
                </div>
                <GlassCard className="p-6 max-w-5xl mx-auto" highlighted>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-6 font-mono text-sm">
                    <div className="text-gray-400 mb-3"># Example merged output with source traceability:</div>
                    <div className="space-y-1">
                      <div className="text-green-400">Step 1: Set up database schema [src:P1 step 3]</div>
                      <div className="text-green-400">Step 2: Implement authentication [src:P2 step 1, P3 step 2]</div>
                      <div className="text-green-400">Step 3: Create API endpoints [src:P3 step 4 - cleaner approach]</div>
                      <div className="text-green-400">Step 4: Add error handling [src:EMERGENT - combining P1, P2 patterns]</div>
                      <div className="text-green-400">Step 5: Implement caching [src:P1 step 7, optimized with P2 insights]</div>
                    </div>
                  </div>
                </GlassCard>
              </div>
              {/* Technical Implementation */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['mergeInstructions.implementation.title']}</h2>
                <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <MessageSquare className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['mergeInstructions.implementation.backend.title']}</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          {t['mergeInstructions.implementation.backend.description']}
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i}>• {t[`mergeInstructions.implementation.backend.features.${i}`]}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['mergeInstructions.implementation.aiPrompt.title']}</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          {t['mergeInstructions.implementation.aiPrompt.description']}
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i}>• {t[`mergeInstructions.implementation.aiPrompt.features.${i}`]}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Layers className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['mergeInstructions.implementation.frontend.title']}</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          {t['mergeInstructions.implementation.frontend.description']}
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i}>• {t[`mergeInstructions.implementation.frontend.features.${i}`]}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['mergeInstructions.implementation.metadata.title']}</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          {t['mergeInstructions.implementation.metadata.description']}
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <li key={i}>• {t[`mergeInstructions.implementation.metadata.features.${i}`]}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Real Value Proposition */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['mergeInstructions.value.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['mergeInstructions.value.architecturalSynthesis.title']}</h3>
                    <p className="text-foreground/80">
                      {t['mergeInstructions.value.architecturalSynthesis.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['mergeInstructions.value.completeTraceability.title']}</h3>
                    <p className="text-foreground/80">
                      {t['mergeInstructions.value.completeTraceability.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['mergeInstructions.value.solidPractices.title']}</h3>
                    <p className="text-foreground/80">
                      {t['mergeInstructions.value.solidPractices.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Related Features */}
              <RelatedFeatures currentSlug="features/merge-instructions" maxItems={3} />

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['mergeInstructions.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['mergeInstructions.cta.description']}
                  </p>
                  <PlatformDownloadSection location="features_merge_instructions" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      {t['mergeInstructions.cta.links.planMode']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/demo">
                      {t['mergeInstructions.cta.links.demo']}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
