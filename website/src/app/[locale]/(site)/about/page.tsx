import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { Building, Globe, Mail, Brain, Layers, FileText, Zap, Copy } from 'lucide-react';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/about',
      title: t['about.meta.title'],
      description: t['about.meta.description'],
    }),
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
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
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['about.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['about.hero.subtitle']}
                </p>
              </div>

              {/* What We Are */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">{t['about.whatWeBuilt.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 leading-relaxed">
                    {t['about.whatWeBuilt.intro']}
                  </p>

                  <div className="grid md:grid-cols-1 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-primary" />
                        {t['about.whatWeBuilt.multiModel.title']}
                      </h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.whatWeBuilt.multiModel.description']}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Core Capabilities - Planning First */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['about.capabilities.title']}</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  {/* Row 1: Planning-focused capabilities */}
                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.planning.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.planning.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.synthesis.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.synthesis.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Layers className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.discovery.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.discovery.description']}
                    </p>
                  </GlassCard>

                  {/* Row 2: Supporting capabilities */}
                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.voice.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.voice.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Copy className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.automation.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.automation.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.remote.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.remote.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Our Philosophy */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">{t['about.philosophy.title']}</h2>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-3">{t['about.philosophy.noTruncation.title']}</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.philosophy.noTruncation.description']}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">{t['about.philosophy.traceability.title']}</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.philosophy.traceability.description']}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">{t['about.philosophy.tooling.title']}</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.philosophy.tooling.description']}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">{t['about.philosophy.transparency.title']}</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.philosophy.transparency.description']}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Technical Architecture */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['about.architecture.title']}</h2>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-3">Planning Engine</h3>
                      <ul className="text-foreground/80 leading-relaxed list-disc list-inside space-y-2">
                        <li>Multi-model AI orchestration (GPT-5.1, Claude Sonnet 4.5, Gemini 3 Pro)</li>
                        <li>Structured XML plan generation</li>
                        <li>Intelligent plan merging with SOLID principles</li>
                        <li>Source attribution tracking</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">File Discovery Workflow</h3>
                      <ul className="text-foreground/80 leading-relaxed list-disc list-inside space-y-2">
                        <li>Root folder selection (hierarchical intelligence)</li>
                        <li>Regex pattern filtering with path validation</li>
                        <li>AI-powered relevance assessment</li>
                        <li>Extended discovery for related files</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">Development Tools</h3>
                      <ul className="text-foreground/80 leading-relaxed list-disc list-inside space-y-2">
                        <li>Monaco Editor for plan review and editing</li>
                        <li>React + TypeScript frontend</li>
                        <li>SQLite for local persistence</li>
                        <li>Tauri for cross-platform desktop</li>
                      </ul>
                    </div>

                    <p className="text-foreground/60 italic text-sm mt-6">
                      {t['about.architecture.comment']}
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* Company Information */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['about.company.title']}</h2>

                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                      <Building className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="text-foreground font-medium text-lg">{t['about.company.name']}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Globe className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Jurisdiction</p>
                        <p className="text-foreground font-medium text-lg">{t['about.company.jurisdiction']}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Mail className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">{t['about.company.contact']}</p>
                        <ObfuscatedEmail
                          user="support"
                          domain="plantocode.com"
                          className="text-primary hover:underline font-medium text-lg"
                        />
                      </div>
                    </div>
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