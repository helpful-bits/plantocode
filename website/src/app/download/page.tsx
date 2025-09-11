import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { WindowsStoreButton } from '@/components/ui/WindowsStoreButton';
import { CheckCircle2, Download, Apple, Monitor, Smartphone, Shield } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Header } from '@/components/landing/Header';

export const metadata: Metadata = {
  title: 'Download Vibe Manager - Multi-Model AI Planning Tool',
  description: 'Download Vibe Manager for macOS. Windows version coming soon. Multi-model planning for Claude Code, Cursor, and OpenAI Codex CLI.',
  keywords: [
    'vibe manager download',
    'claude code companion',
    'ai coding assistant download',
    'mac app download',
    'windows app coming soon',
    'multi-model planning tool',
  ],
  openGraph: {
    title: 'Download Vibe Manager - AI Coding Planning Tool',
    description: 'Download Vibe Manager for macOS. Windows version coming soon. Multi-model planning for Claude Code, Cursor, and OpenAI Codex CLI.',
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
                <Reveal as="h1" className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-primary-emphasis">
                  Download Vibe Manager
                </Reveal>
                <Reveal as="p" className="text-lg sm:text-xl md:text-2xl mb-8 text-foreground/80 max-w-3xl mx-auto leading-relaxed" delay={0.1}>
                  Choose your platform and start enhancing your AI coding workflow today
                </Reveal>
              </div>

              <div className="grid gap-8 md:gap-12">
                {/* macOS Section */}
                <Reveal delay={0.2}>
                  <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent">
                          <Apple className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-primary-emphasis">macOS</h2>
                          <p className="text-foreground/60">Available Now</p>
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
                            <span>Intel or Apple Silicon (M1/M2/M3) processor</span>
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
                              <h4 className="font-semibold text-foreground mb-1">Notarized & Code Signed</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                Our macOS app is fully notarized by Apple and code signed for your security. 
                                No warnings or security prompts during installation.
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <DownloadButton
                          location="download_page_mac"
                          size="lg"
                          variant="cta"
                          className="min-w-[200px]"
                        >
                          <Download className="w-5 h-5 mr-2" />
                          Download for Mac
                        </DownloadButton>
                      </div>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Windows Section */}
                <Reveal delay={0.3}>
                  <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700">
                          <Monitor className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-primary-emphasis">Windows</h2>
                          <p className="text-foreground/60">Available on Microsoft Store</p>
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

                      <div className="flex justify-center">
                        <WindowsStoreButton size="medium" />
                      </div>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Mobile Section */}
                <Reveal delay={0.4}>
                  <GlassCard className="opacity-60">
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600">
                          <Smartphone className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground/50">Mobile</h2>
                          <p className="text-foreground/40">Coming Later</p>
                        </div>
                      </div>
                      
                      <p className="text-foreground/50 text-center">
                        iOS and Android versions are planned for future release. 
                        Stay tuned for updates!
                      </p>
                    </div>
                  </GlassCard>
                </Reveal>

                {/* Additional Info */}
                <Reveal delay={0.5}>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-4 text-foreground">Need Help?</h3>
                    <p className="text-foreground/80 mb-6">
                      Visit our <a href="/docs" className="text-primary hover:text-primary/80 underline">documentation</a> for 
                      installation guides and troubleshooting tips.
                    </p>
                    <p className="text-sm text-foreground/60">
                      By downloading Vibe Manager, you agree to our{' '}
                      <a href="/terms" className="text-primary hover:text-primary/80 underline">Terms of Service</a> and{' '}
                      <a href="/privacy" className="text-primary hover:text-primary/80 underline">Privacy Policy</a>.
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