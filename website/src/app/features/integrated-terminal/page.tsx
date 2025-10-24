import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Terminal, Mic } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terminal for plans - persistent PTY sessions | PlanToCode',
  description: 'A persistent, integrated terminal for running plans and commands inside PlanToCode. Real shells, project-aware context, and seamless copy-to-terminal.',
  keywords: [
    'pty terminal',
    'persistent terminal sessions',
    'voice transcription terminal',
    'xterm.js integration',
    'job-centric terminal',
    'cli auto-launch',
    'terminal integration',
  ],
  openGraph: {
    title: 'Integrated PTY Terminal for Plans | PlanToCode',
    description: 'A persistent, integrated terminal for running plans and commands inside PlanToCode. Real shells, project-aware context, and seamless copy-to-terminal.',
    url: 'https://www.plantocode.com/features/integrated-terminal',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/integrated-terminal',
  },
};

export default function IntegratedTerminalPage() {
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
                  <Terminal className="w-4 h-4" />
                  <span>Integrated PTY Terminal</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Job-centric terminal that keeps context
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Run your plan in a persistent terminal. Built for fast, focused execution.
                </p>
              </div>

              {/* A Terminal Built for Your Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">A Terminal Built for Your Workflow</h2>
                <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Terminal className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Integrated with Planning</h3>
                        <p className="text-foreground/80">
                          Execute implementation plans and copy steps directly to the terminal without leaving the application.
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
                        <h3 className="text-xl font-bold mb-3">Persistent Sessions</h3>
                        <p className="text-foreground/80">
                          Your terminal sessions stay with your work, preserving context between tasks and restarts.
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
                        <h3 className="text-xl font-bold mb-3">Voice and Copy Support</h3>
                        <p className="text-foreground/80">
                          Use one-click copy-paste for commands or dictate them directly using voice input to move faster.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience the Terminal That Never Loses Context</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    A terminal built for planning and execution—integrated, persistent, and fast.
                  </p>
                  <PlatformDownloadSection location="features_integrated_terminal" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/voice-transcription">
                      Explore voice commands
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs/terminal">
                      Read technical docs
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