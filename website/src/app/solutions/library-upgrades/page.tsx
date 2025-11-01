import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { PackageSearch, ClipboardCheck, ShieldCheck, FileOutput, GitBranch } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Upgrade Libraries with Guardrails - PlanToCode',
  description:
    'Plan migrations, monitor terminal output, and keep transcripts when updating frameworks or dependencies.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Upgrade Libraries with Guardrails - PlanToCode',
    description:
      'Use PlanToCode to scope changes, review plans, and capture execution history during library upgrades.',
    url: 'https://www.plantocode.com/solutions/library-upgrades',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/library-upgrades',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/library-upgrades',
      'en': 'https://www.plantocode.com/solutions/library-upgrades',
    },
  },
};

export default function LibraryUpgradesPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500 text-sm font-medium">
                  <GitBranch className="w-4 h-4" />
                  <span>Upgrade planning</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Upgrade libraries with guardrails
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Modernising dependencies often spans multiple repositories and teams. PlanToCode helps you scope the work, document each step, and keep an auditable trail of what changed.
                </p>
              </header>

              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <PackageSearch className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Identify affected files</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Trigger the file discovery workflow against your project directory to gather upgrade hotspots. The orchestrated background jobs record selected roots and make them available to every subsequent plan or prompt.
                  </p>
                  <LinkWithArrow href="/docs/file-discovery" className="text-sm mt-4">
                    File discovery workflow
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Track upgrade plans</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Review generated plans inside the Monaco viewer, compare revisions, and merge overlapping proposals. Plans stay linked to background jobs, so you can reopen the relevant terminal session or prompt copy modal whenever you revisit the upgrade.
                  </p>
                  <LinkWithArrow href="/docs/implementation-plans" className="text-sm mt-4">
                    Implementation plans
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Stay within model limits</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Upgrade prompts often include large diffs. Task-level model settings define which models are allowed, and the selector toggle blocks any choice whose context window cannot handle the estimated prompt plus output tokens.
                  </p>
                  <LinkWithArrow href="/docs/model-configuration" className="text-sm mt-4">
                    Model guardrails
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileOutput className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">Document execution history</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    Terminal sessions keep full output logs and connection health, even after restarts. Voice transcription can add spoken context to tricky migration steps, creating a searchable trail for release notes and change reviews.
                  </p>
                  <LinkWithArrow href="/docs/terminal-sessions" className="text-sm mt-4">
                    Terminal & transcription
                  </LinkWithArrow>
                </GlassCard>
              </div>

              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">Upgrade Dependencies Without Fear</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  Audit every change, track every migration, maintain full control.
                  This is how library upgrades should work: safe, auditable, reversible.
                </p>
                <PlatformDownloadSection location="solutions_library_upgrades" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/plan-mode">
                    Explore upgrade planning
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/file-discovery">
                    Learn about scope analysis
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
