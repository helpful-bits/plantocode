import React from 'react';
import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { RelatedFeatures } from '@/components/RelatedContent';
import { Copy, Settings, Terminal, Edit3, GripVertical, CheckCircle2, Code2, Layers } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/copy-buttons',
      title: t['copyButtons.meta.title'],
      description: t['copyButtons.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'copy buttons',
    'workflow automation',
    'template system',
    'placeholder substitution',
    'reusable prompts',
    'terminal automation',
    'drag drop reordering',
    'smart templates',
    'prompt management',
    'ai workflow buttons',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function CopyButtonsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <React.Fragment>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Copy className="w-4 h-4" />
                  <span>{t['copyButtons.hero.badge'] ?? ''}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['copyButtons.hero.title'] ?? ''}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['copyButtons.hero.description'] ?? ''}
                </p>
              </div>
              {/* Core Concept */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Settings className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['copyButtons.concept.serverConfigured.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['copyButtons.concept.serverConfigured.description'] ?? ''}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <GripVertical className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['copyButtons.concept.dragDrop.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['copyButtons.concept.dragDrop.description'] ?? ''}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['copyButtons.concept.terminal.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['copyButtons.concept.terminal.description'] ?? ''}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Template System Deep Dive */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['copyButtons.templateSystem.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Code2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['copyButtons.templateSystem.placeholders.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['copyButtons.templateSystem.placeholders.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['copyButtons.templateSystem.placeholders.examples'] ?? []) as string[]).map((example, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span className="text-xs"><code className="bg-muted px-1 rounded text-foreground">{example}</code></span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Layers className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['copyButtons.templateSystem.processor.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['copyButtons.templateSystem.processor.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['copyButtons.templateSystem.processor.features'] ?? []) as string[]).map((feature, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Configuration Management */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['copyButtons.configuration.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Settings className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['copyButtons.configuration.projectSettings.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['copyButtons.configuration.projectSettings.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['copyButtons.configuration.projectSettings.features'] ?? []) as string[]).map((feature, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Edit3 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['copyButtons.configuration.visualUI.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['copyButtons.configuration.visualUI.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['copyButtons.configuration.visualUI.features'] ?? []) as string[]).map((feature, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Terminal Integration */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['copyButtons.terminalIntegration.title'] ?? ''}</h2>
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4">{t['copyButtons.terminalIntegration.oneClick.title'] ?? ''}</h3>
                      <p className="text-foreground/80 mb-6">
                        {t['copyButtons.terminalIntegration.oneClick.description'] ?? ''}
                      </p>
                      <ul className="space-y-3">
                        {((t['copyButtons.terminalIntegration.oneClick.features'] ?? []) as string[]).map((feature, index) => (
                          <li key={index} className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                            <span className="text-foreground/80">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-muted rounded-lg p-6 border border-border">
                      <div className="text-green-600 dark:text-green-400 mb-3 text-sm font-mono">Example Button Configuration:</div>
                      <div className="font-mono text-xs space-y-2">
                        <div className="text-cyan-600 dark:text-cyan-400">Label: "Parallel Claude Agents"</div>
                        <div className="text-yellow-600 dark:text-yellow-400">Template:</div>
                        <div className="text-foreground ml-2 text-wrap break-words">
                          {`{{IMPLEMENTATION_PLAN}}`}<br/>
                          <br/>
                          <strong>Now, think deeply!</strong> Read the files mentioned,<br/>
                          understand them and launch parallel Claude<br/>
                          coding agents that run <strong>at the same time</strong>...
                        </div>
                        <div className="text-green-600 dark:text-green-400 mt-3">→ One click = Full workflow execution</div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>
              {/* Technical Architecture */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['copyButtons.technical.title'] ?? ''}</h2>
                <GlassCard className="p-8">
                  <div className="font-mono text-sm">
                    <div className="text-muted-foreground mb-4"># Copy Button System Architecture</div>
                    <div className="mb-6">
                      <div className="text-green-500 dark:text-green-400 mb-2">## 1. Configuration Storage</div>
                      <div className="text-card-foreground ml-4" dangerouslySetInnerHTML={{__html: (t['copyButtons.technical.architecture.storage'] ?? '').replace(/→/g, '<br />→')}} />
                    </div>
                    <div className="mb-6">
                      <div className="text-green-500 dark:text-green-400 mb-2">## 2. Template Processing</div>
                      <div className="text-card-foreground ml-4" dangerouslySetInnerHTML={{__html: (t['copyButtons.technical.architecture.processing'] ?? '').replace(/→/g, '<br />→')}} />
                    </div>
                    <div className="mb-6">
                      <div className="text-green-500 dark:text-green-400 mb-2">## 3. UI Integration</div>
                      <div className="text-card-foreground ml-4" dangerouslySetInnerHTML={{__html: (t['copyButtons.technical.architecture.ui'] ?? '').replace(/→/g, '<br />→')}} />
                    </div>
                    <div className="mb-6">
                      <div className="text-green-500 dark:text-green-400 mb-2">## 4. Execution Flow</div>
                      <div className="text-card-foreground ml-4" dangerouslySetInnerHTML={{__html: (t['copyButtons.technical.architecture.execution'] ?? '').replace(/→/g, '<br />→')}} />
                    </div>
                    <div className="text-cyan-500 dark:text-cyan-400 mt-4">
                      [Extensible system: Add new placeholders and templates as needed]
                    </div>
                  </div>
                </GlassCard>
              </div>
              {/* Use Cases & Examples */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['copyButtons.useCases.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['copyButtons.useCases.parallel.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      {t['copyButtons.useCases.parallel.description'] ?? ''}
                    </p>
                    <div className="bg-muted rounded p-3 font-mono text-xs text-foreground">
                      <span className="text-green-600 dark:text-green-400">Button:</span> "Parallel Claude Agents"<br/>
                      <span className="text-cyan-600 dark:text-cyan-400">Saves:</span> Complex multi-agent setup instructions
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['copyButtons.useCases.investigation.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      {t['copyButtons.useCases.investigation.description'] ?? ''}
                    </p>
                    <div className="bg-muted rounded p-3 font-mono text-xs text-foreground">
                      <span className="text-green-600 dark:text-green-400">Button:</span> "Investigate Results"<br/>
                      <span className="text-cyan-600 dark:text-cyan-400">Saves:</span> Thorough validation workflows
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['copyButtons.useCases.customTeam.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      {t['copyButtons.useCases.customTeam.description'] ?? ''}
                    </p>
                    <div className="bg-muted rounded p-3 font-mono text-xs text-foreground">
                      <span className="text-green-600 dark:text-green-400">Template:</span> {`{{PROJECT_CONTEXT}}`}<br/>
                      <span className="text-cyan-600 dark:text-cyan-400">Dynamic:</span> Project-aware instructions
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['copyButtons.useCases.stepByStep.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      {t['copyButtons.useCases.stepByStep.description'] ?? ''}
                    </p>
                    <div className="bg-muted rounded p-3 font-mono text-xs text-foreground">
                      <span className="text-green-600 dark:text-green-400">Template:</span> {`{{STEP_CONTENT}}`}<br/>
                      <span className="text-cyan-600 dark:text-cyan-400">Result:</span> Focused step execution
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Unique Value */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">{t['copyButtons.comparison.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6 sm:p-8 border-red-500/20 bg-red-500/5">
                    <h3 className="text-xl font-bold mb-6 text-red-500 flex items-center gap-2">
                      <span className="text-2xl">✗</span>
                      {t['copyButtons.comparison.traditional.title'] ?? ''}
                    </h3>
                    <ul className="space-y-4">
                      {((t['copyButtons.comparison.traditional.items'] ?? []) as string[]).map((item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-red-400 mt-0.5 text-lg">✗</span>
                          <span className="text-foreground/70">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-6 sm:p-8 border-green-500/20 bg-green-500/5" highlighted>
                    <h3 className="text-xl font-bold mb-6 text-green-500 flex items-center gap-2">
                      <span className="text-2xl">✓</span>
                      {t['copyButtons.comparison.plantocode.title'] ?? ''}
                    </h3>
                    <ul className="space-y-4">
                      {((t['copyButtons.comparison.plantocode.items'] ?? []) as string[]).map((item, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-green-400 mt-0.5 text-lg">✓</span>
                          <span className="text-foreground/90 font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* Related Features */}
              <RelatedFeatures currentSlug="features/copy-buttons" maxItems={3} />

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['copyButtons.cta.title'] ?? ''}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['copyButtons.cta.description'] ?? ''}
                  </p>
                  <PlatformDownloadSection location="features_copy_buttons" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      {t['copyButtons.cta.links.planMode'] ?? ''}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/integrated-terminal">
                      {t['copyButtons.cta.links.terminal'] ?? ''}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}
