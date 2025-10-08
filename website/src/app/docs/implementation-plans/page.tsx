import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Implementation Plans in Vibe Manager',
  description:
    'How the desktop app organises, reviews, and streams implementation plans using the Monaco-based plan viewer and plan history.',
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/implementation-plans',
  },
  openGraph: {
    title: 'Implementation Plans in Vibe Manager',
    description:
      'Understand how plan generation, Monaco-based review, and plan history work together inside the Implementation Plans panel.',
    url: 'https://www.vibemanager.app/docs/implementation-plans',
    type: 'article',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Implementation Plans in Vibe Manager',
  description:
    'Documentation for the Implementation Plans panel, including plan storage, Monaco review features, and navigation.',
};

export default function ImplementationPlansDocPage() {
  return (
    <>
      <StructuredData data={structuredData} />

      <DocsArticle
        title="Implementation Plans"
        description="How Vibe Manager collects plan jobs, streams content into the Monaco viewer, and keeps a navigable plan history."
        date="2025-09-19"
        readTime="6 min"
        category="Product Guide"
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          The Implementation Plans panel is where every generated plan is collected. Plans stream in from background jobs,
          appear in a sortable list, and can be opened in a Monaco-powered modal for detailed review before prompting an agent.
        </p>

        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">Where the plans come from</h2>
          <p className="text-muted-foreground leading-relaxed">
            Each plan corresponds to a background job in the current session. The panel subscribes to plan data, keeps track of
            which plan is currently open, and exposes navigation between earlier and newer jobs. This behaviour lives inside
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useImplementationPlansLogic</code> and the
            surrounding panel component.
          </p>
        </GlassCard>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Reviewing plans with Monaco</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Plan content is rendered through the shared <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">VirtualizedCodeViewer</code>,
              which wraps Monaco Editor. The viewer automatically detects common languages, supports copy-to-clipboard actions,
              virtualises very large plans, and offers optional metrics such as character counts and syntax-aware highlighting.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              When a plan is opened, the panel resolves the active plan by job identifier, passes the content to Monaco, and lets
              reviewers move between neighbouring jobs without losing the currently open modal.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Keeping relevant context attached</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              The panel stores which repository roots were selected during the file discovery workflow so that follow-up actions
              reuse the same scope. It also records plan-specific metadata, such as the project directory and any prepared
              prompt content, so downstream prompts can be generated or copied without recomputing the workflow.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Token estimation runs before prompts are copied. The panel calls the token estimation command with the project
              directory, selected files, and the currently chosen model, surfacing both system and user prompt totals so teams
              can stay under model limits.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Working with multiple plans</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Plans can be merged, deleted, or reopened later. The panel keeps a list of selected plan identifiers, manages a
              dedicated modal for terminal output tied to a plan, and exposes navigation helpers so reviewers can page through
              earlier plans without closing the viewer. Terminal access, prompt copy controls, and merge instructions all share
              the same job identifier so audit history stays consistent.
            </p>
          </GlassCard>
        </section>

        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">Need the desktop app?</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Implementation plans are available inside the Vibe Manager desktop application. Download the build for your
              platform to try the workflow end to end.
            </p>
            <PlatformDownloadSection location="docs_implementation_plans" />
            <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
              <LinkWithArrow href="/plan-mode/codex">
                See Codex plan mode workflow
              </LinkWithArrow>
              <LinkWithArrow href="/plan-mode/claude-code">
                See Claude plan mode workflow
              </LinkWithArrow>
              <LinkWithArrow href="/plan-mode/cursor">
                See Cursor plan mode workflow
              </LinkWithArrow>
            </div>
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
