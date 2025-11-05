import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { Building, Globe, Mail, Brain, Terminal, Layers, FileText, Zap, Copy } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';

export const metadata: Metadata = {
  title: 'About PlanToCode - AI Development Planning Tool',
  description: 'AI development planning with multi-model integration, persistent terminals, voice transcription, and architectural synthesis.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/about',
    languages: {
      'en-US': 'https://www.plantocode.com/about',
      'en': 'https://www.plantocode.com/about',
    },
  },
  openGraph: {
    title: 'About PlanToCode - AI Development Planning Tool',
    description: 'AI development planning with multi-model integration, persistent terminals, voice transcription, and architectural synthesis.',
    url: 'https://www.plantocode.com/about',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

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

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-primary" />
                        {t['about.whatWeBuilt.multiModel.title']}
                      </h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.whatWeBuilt.multiModel.description']}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-primary" />
                        {t['about.whatWeBuilt.environment.title']}
                      </h3>
                      <p className="text-foreground/80 leading-relaxed">
                        {t['about.whatWeBuilt.environment.description']}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Core Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['about.capabilities.title']}</h2>

                <div className="grid md:grid-cols-3 gap-6">
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
                      <Layers className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.discovery.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.discovery.description']}
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
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.terminal.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.terminal.description']}
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
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['about.capabilities.voice.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['about.capabilities.voice.description']}
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['about.architecture.title']}</h2>

                <GlassCard className="p-8 bg-black/50">
                  <div className="font-mono text-sm">
                    <div className="text-gray-500 mb-4"># PlanToCode Architecture</div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Frontend</div>
                      <div className="text-white ml-4">
                        → React + TypeScript<br />
                        → Monaco Editor (VS Code's editor)<br />
                        → xterm.js for terminal rendering<br />
                        → Tauri for cross-platform desktop
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Backend Services</div>
                      <div className="text-white ml-4">
                        → Rust/Tauri for system integration<br />
                        → SQLite for local persistence<br />
                        → PTY sessions with health monitoring<br />
                        → Multi-provider AI orchestration
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Key Patterns</div>
                      <div className="text-white ml-4">
                        → Job-centric design with background processing<br />
                        → Real-time streaming with progress tracking<br />
                        → Context-aware template processing<br />
                        → Session persistence across restarts
                      </div>
                    </div>

                    <div className="text-cyan-400 mt-4">
                      [{t['about.architecture.comment']}]
                    </div>
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