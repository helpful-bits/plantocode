import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Wrench, ClipboardList, GaugeCircle, History, Files } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Maintain Systems with Repeatable Workflows',
  description:
    'Use Vibe Manager to document ongoing maintenance tasks, keep an audit trail, and prevent regressions.',
  openGraph: {
    title: 'Maintain Systems with Repeatable Workflows',
    description:
      'Capture reusable plans, model guardrails, and persistent logs for technical debt work.',
    url: 'https://www.vibemanager.app/solutions/maintenance-enhancements',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/solutions/maintenance-enhancements',
  },
};

export default function MaintenanceEnhancementsPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-500 text-sm font-medium">
                  <Wrench className="w-4 h-4" />
                  <span>Ongoing maintenance</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Maintain systems with repeatable workflows
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Maintenance work slows down when teams lose track of scope or repeat the same investigations. Vibe Manager keeps the context, plans, and execution history needed to apply fixes safely.
                </p>
              </header>

              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Files className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Reuse scoped workflows</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    File discovery jobs collect the directories touched by previous maintenance tasks. When similar work returns, you can rerun plans against the stored roots instead of manually rebuilding the scope.
                  </p>
                  <LinkWithArrow href="/docs/file-discovery" className="text-sm mt-4">
                    File discovery workflow
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ClipboardList className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Keep plan history</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Maintenance plans stream into the Monaco viewer with navigation between revisions, merge actions, and prompt copy controls. Reopen previous jobs to see exactly which steps were taken and whether they need to be repeated.
                  </p>
                  <LinkWithArrow href="/docs/implementation-plans" className="text-sm mt-4">
                    Implementation plans
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <GaugeCircle className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Control model usage</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    The model selector toggle enforces context windows per maintenance task. Token estimates from the backend let you confirm that large patch descriptions still fit the chosen model before you send them to an agent.
                  </p>
                  <LinkWithArrow href="/docs/model-configuration" className="text-sm mt-4">
                    Model guardrails
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <History className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Preserve execution logs</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Terminal sessions persist in SQLite with timestamps, exit codes, and captured output. Voice transcription can append spoken notes to the same job, giving future maintainers full context on what changed and why.
                  </p>
                  <LinkWithArrow href="/docs/terminal-sessions" className="text-sm mt-4">
                    Terminal and transcription
                  </LinkWithArrow>
                </GlassCard>
              </div>

              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Maintenance into Strategic Advantage</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  Stop reactive fire-fighting and build systematic maintenance workflows.
                  Preserved context, reusable plans, and model guardrails turn technical debt into manageable, repeatable processes.
                </p>
                <PlatformDownloadSection location="solutions_maintenance" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/workflows/file-discovery">
                    Explore scoped workflows
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/implementation-plans">
                    Learn about plan history
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
