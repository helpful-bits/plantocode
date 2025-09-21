import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { MacDownloadButton } from '@/components/ui/MacDownloadButton';
import { WindowsStoreButton } from '@/components/ui/WindowsStoreButton';
import { CheckCircle2, Shield } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Header } from '@/components/landing/Header';

export const metadata: Metadata = {
  title: 'Download - Vibe Manager AI Architect Studio',
  description: 'Download Vibe Manager for macOS and Windows. AI Architect Studio for heavy coding-agent users. Integrated terminal for codex, claude, cursor, aider. Microsoft Store available.',
  keywords: [
    'vibe manager download',
    'ai architect studio',
    'integrated terminal download',
    'claude terminal',
    'codex integration',
    'microsoft store',
    'macos developer tools',
    'heavy coding agent users',
  ],
  openGraph: {
    title: 'Download Vibe Manager - AI Coding Planning Tool',
    description: 'Download Vibe Manager for Windows and macOS. Multi-model planning with integrated terminal for codex, claude, cursor, aider. Available on Microsoft Store.',
    url: 'https://www.vibemanager.app/download',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/download',
  },
};

export default function DownloadPage() {
  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-4xl">
              <div className="text-center mb-12">
                <Reveal as="h1" className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Download Vibe Manager
                </Reveal>
                <Reveal as="p" className="text-lg sm:text-xl md:text-2xl mb-8 text-foreground/80 max-w-3xl mx-auto leading-relaxed" delay={0.1}>
                  AI Architect Studio for heavy coding-agent users. Run codex, claude, cursor, aider directly in-app.
                </Reveal>
              </div>

              <div className="grid gap-8 md:gap-12">
                {/* macOS Section */}
                <Reveal delay={0.2}>
                  <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-8 h-8 text-primary-foreground"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">macOS</h2>
                          <p className="text-foreground/60">For Heavy Coding-Agent Users</p>
                        </div>
                      </div>
                      
                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 text-foreground">System Requirements</h3>
                        <ul className="space-y-2 text-foreground/80">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>macOS 11.0 (Big Sur) or later</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>Apple Silicon (M1/M2/M3/M4) processor</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>4GB RAM minimum (8GB recommended)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>Internet connection required for AI features</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mb-8">
                        <GlassCard className="bg-primary/5 border-primary/20">
                          <div className="p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">Professional Ready</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                Fully notarized by Apple. Code signed. Integrated terminal with full CLI support.
                                Built for staff/principal engineers tackling large codebases.
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <MacDownloadButton
                          location="download_page_mac"
                          size="lg"
                          className="min-w-[200px]"
                        />
                      </div>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Windows Section */}
                <Reveal delay={0.3}>
                  <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-8 h-8 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.351"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Windows</h2>
                          <p className="text-foreground/60">Microsoft Store - Professional Ready</p>
                        </div>
                      </div>
                      
                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 text-foreground">System Requirements</h3>
                        <ul className="space-y-2 text-foreground/80">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>Windows 10 version 1903 (Build 18362) or later</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>Windows 11 supported</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>x64 or ARM64 processor</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>4GB RAM minimum (8GB recommended)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>Internet connection required for AI features</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mb-8">
                        <GlassCard className="bg-primary/5 border-primary/20">
                          <div className="p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">Terminal Integration</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                PowerShell and Command Prompt support. Run codex, claude, cursor, aider natively.
                                Built for power users who need production-grade tooling.
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <WindowsStoreButton size="large" />
                      </div>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Trust Indicators */}
                <Reveal delay={0.4}>
                  <GlassCard highlighted>
                    <div className="p-8 sm:p-12">
                      <h3 className="text-2xl font-bold text-center mb-8">Built for Heavy Coding-Agent Users</h3>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold mb-2">Integrated Terminal</h4>
                          <p className="text-foreground/80 text-sm">
                            Run codex, claude, cursor, aider directly. Voice dictation. Session transcripts. No context switching.
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">Multi-Model Planning</h4>
                          <p className="text-foreground/80 text-sm">
                            GPT-5, Claude Sonnet 4, Gemini 2.5 Pro, o3/o4-mini, Grok 4, DeepSeek R1, Kimi K2. Council of LLMs approach.
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">Professional Options</h4>
                          <p className="text-foreground/80 text-sm">
                            Single-tenant servers. On-prem deployment. Terminal governance. Built for teams that can't use cloud-only.
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">$10 Free Credits</h4>
                          <p className="text-foreground/80 text-sm">
                            Start immediately. Pay-as-you-go. No subscriptions. Token transparency for power users who track costs.
                          </p>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Additional CTAs */}
                <Reveal delay={0.5}>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-4 text-foreground">Ready to Level Up?</h3>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                      <a href="/schedule" className="text-primary hover:underline font-semibold">Talk to an architect →</a>
                      <span className="hidden sm:inline text-foreground/40">•</span>
                      <a href="/schedule" className="text-primary hover:underline font-semibold">Professional options →</a>
                      <span className="hidden sm:inline text-foreground/40">•</span>
                      <a href="/docs/integrated-terminal-cli-orchestration" className="text-primary hover:underline font-semibold">Terminal docs →</a>
                    </div>
                    <p className="text-sm text-foreground/60">
                      Made in Germany • GDPR Compliant • Local Session Storage
                    </p>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}