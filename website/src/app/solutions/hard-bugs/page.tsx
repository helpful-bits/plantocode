import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs, buildSolutionBreadcrumbs } from '@/components/Breadcrumbs';
import { RelatedSolutions } from '@/components/RelatedContent';
import { AlertTriangle, ListChecks, TerminalSquare, AudioWaveform, FileSearch } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Resolve hard bugs with reproducible context - PlanToCode',
  description:
    'How PlanToCode captures plan history, terminal logs, and live transcripts so tricky production issues can be reproduced without guesswork.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Resolve hard bugs with reproducible context - PlanToCode',
    description:
      'Use PlanToCode to capture plan history, persistent terminal output, and searchable transcripts when investigating complex defects.',
    url: 'https://www.plantocode.com/solutions/hard-bugs',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/hard-bugs',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/hard-bugs',
      'en': 'https://www.plantocode.com/solutions/hard-bugs',
    },
  },
};

export default function HardBugsPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <Breadcrumbs items={buildSolutionBreadcrumbs('Hard Bugs')} />

              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-500 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Production debugging</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Resolve hard bugs with preserved context
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  PlanToCode keeps every plan, terminal session, and spoken note attached to the job you are debugging. Reopen the exact commands, token budgets, and plan revisions used to isolate an issue.
                </p>
              </header>

              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileSearch className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Reproduce the failing surface</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Start with the file discovery workflow to narrow a repository to the modules referenced in the incident. The workflow validates session inputs, queues background jobs, and stores the selected roots so every follow-up plan uses the same scope.
                  </p>
                  <LinkWithArrow href="/docs/file-discovery" className="text-sm mt-4">
                    Workflow details
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ListChecks className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Review every proposed fix</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Implementation plans stream into the Monaco viewer with language detection, copy controls, and navigation between historical jobs. Token estimates run before you copy prompts into an external tool, helping you confirm the fix stays within the model’s limits.
                  </p>
                  <LinkWithArrow href="/docs/implementation-plans" className="text-sm mt-4">
                    Plan viewer overview
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <TerminalSquare className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Persist terminal output</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Each debugging terminal runs inside a managed PTY. Session metadata, working directories, and full output logs are stored in SQLite and can be reopened after crashes. CLI detection verifies that claude, cursor, codex, or gemini binaries are installed before you run commands.
                  </p>
                  <LinkWithArrow href="/docs/terminal-sessions" className="text-sm mt-4">
                    Terminal behaviour
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <AudioWaveform className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Capture voice notes in context</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Voice transcription integrates directly with the terminal and prompt editors. The recording hook manages microphone permissions, device selection, silence detection, and inserts recognised text beside the commands that triggered it.
                  </p>
                  <LinkWithArrow href="/docs/voice-transcription" className="text-sm mt-4">
                    Transcription pipeline
                  </LinkWithArrow>
                </GlassCard>
              </div>

              <RelatedSolutions currentSlug="solutions/hard-bugs" maxItems={3} />

              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">Debug Production Issues with Confidence</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  Preserve every investigation, reproduce every step, never lose context.
                  This is how production debugging should work: disciplined, reproducible, complete.
                </p>
                <PlatformDownloadSection location="solutions_hard_bugs" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/integrated-terminal">
                    Explore terminal persistence
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/features/voice-transcription">
                    Learn about voice notes
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
