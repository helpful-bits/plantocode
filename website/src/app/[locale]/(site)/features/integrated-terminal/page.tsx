import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { RelatedFeatures } from '@/components/RelatedContent';
import { Terminal, Mic } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords, generateSoftwareApplicationSchema } from '@/content/metadata';
import { StructuredData } from '@/components/seo/StructuredData';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/integrated-terminal',
      title: t['integratedTerminal.meta.title'],
      description: t['integratedTerminal.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'pty terminal',
    'persistent terminal sessions',
    'voice transcription terminal',
    'xterm.js integration',
    'job-centric terminal',
    'cli auto-launch',
    'terminal integration',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function IntegratedTerminalPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  const softwareAppJsonLd = generateSoftwareApplicationSchema({
    url: 'https://www.plantocode.com/features/integrated-terminal',
    description: 'Integrated terminal with persistent sessions for AI code execution. Run Claude Code, Cursor CLI, and Codex with voice transcription support.'
  });

  return (
    <>
      <StructuredData data={softwareAppJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Terminal className="w-4 h-4" />
                  <span>{t['integratedTerminal.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['integratedTerminal.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['integratedTerminal.hero.description']}
                </p>
              </div>
              {/* A Terminal Built for Your Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['integratedTerminal.features.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Terminal className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['integratedTerminal.features.integratedPlanning.title']}</h3>
                        <p className="text-foreground/80">
                          {t['integratedTerminal.features.integratedPlanning.description']}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Terminal className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['integratedTerminal.features.persistent.title']}</h3>
                        <p className="text-foreground/80">
                          {t['integratedTerminal.features.persistent.description']}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['integratedTerminal.features.voiceSupport.title']}</h3>
                        <p className="text-foreground/80">
                          {t['integratedTerminal.features.voiceSupport.description']}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Related Features */}
              <RelatedFeatures currentSlug="features/integrated-terminal" maxItems={3} />

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['integratedTerminal.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['integratedTerminal.cta.description']}
                  </p>
                  <PlatformDownloadSection location="features_integrated_terminal" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/voice-transcription">
                      {t['integratedTerminal.cta.links.voice']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs/terminal-sessions">
                      {t['integratedTerminal.cta.links.docs']}
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
