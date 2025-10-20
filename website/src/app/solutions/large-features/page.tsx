import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Layers, Workflow, Merge, ClipboardList, Settings } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Ship Large Features with Traceable Plans - PlanToCode',
  description:
    'Use PlanToCode to coordinate implementation plans, model selections, and background workflows when delivering multi-step features.',
  openGraph: {
    title: 'Ship Large Features with Traceable Plans - PlanToCode',
    description:
      'Organise multi-step implementation work with plan history, model guardrails, and reusable workflows.',
    url: 'https://www.plantocode.com/solutions/large-features',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/large-features',
  },
};

export default function LargeFeaturesPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Layers className="w-4 h-4" />
                  <span>Feature planning</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Ship large features with traceable plans
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Multi-stage delivery depends on consistent scope, reviewable plans, and predictable token usage. PlanToCode keeps these signals connected from the first workflow run to the final terminal session.
                </p>
              </header>

              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Workflow className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Start with the same scope</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Use the file discovery workflow to gather relevant directories for every task. Inputs are validated, background jobs run via the Workflow Orchestrator, and the selected roots are stored so later plan revisions reuse the same repository slice.
                  </p>
                  <LinkWithArrow href="/docs/file-discovery" className="text-sm mt-4">
                    File discovery workflow
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ClipboardList className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Coordinate implementation plans</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Plans stream into the Monaco viewer and stay linked to their background jobs. Navigate previous drafts, merge multiple plans, and open the terminal modal for a specific job without losing context. Token estimates run before you export prompts.
                  </p>
                  <LinkWithArrow href="/docs/implementation-plans" className="text-sm mt-4">
                    Implementation plans
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Settings className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Pick the right model per task</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Each task type provides a default model and an allowed list. The model selector toggle prevents sending prompts that exceed the model&rsquo;s context window and surfaces the estimated token requirements drawn from the backend command.
                  </p>
                  <LinkWithArrow href="/docs/model-configuration" className="text-sm mt-4">
                    Model configuration
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Merge className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Keep execution aligned</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Terminal sessions store output logs in SQLite and expose connection health, so long-running feature work remains auditable. If your team records walk-throughs, voice transcription adds searchable notes alongside the commands that executed them.
                  </p>
                  <LinkWithArrow href="/docs/terminal-sessions" className="text-sm mt-4">
                    Terminal and transcription
                  </LinkWithArrow>
                </GlassCard>
              </div>

              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ship Complex Features with Confidence</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  From first workflow to final deployment, maintain perfect traceability.
                  This is how feature delivery should work: coordinated, predictable, traceable.
                </p>
                <PlatformDownloadSection location="solutions_large_features" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/implementation-plans">
                    See implementation planning
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/file-discovery">
                    Learn about scoped workflows
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
