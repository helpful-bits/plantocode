import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Implementation Plans - Review AI Changes | PlanToCode',
  description:
    'Guide to AI implementation planning. Generate, review, and approve file-by-file plans before execution. Prevent duplicates and wrong paths.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/implementation-plans',
    languages: {
      'en-US': 'https://www.plantocode.com/docs/implementation-plans',
      'en': 'https://www.plantocode.com/docs/implementation-plans',
    },
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Human-in-the-Loop Implementation Plans in PlanToCode',
    description:
      'Understand how human-in-the-loop governance and file-by-file review workflows ensure safe AI development with complete control over code modifications.',
    url: 'https://www.plantocode.com/docs/implementation-plans',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Human-in-the-Loop Implementation Plans in PlanToCode',
  description:
    'How PlanToCode ensures safe AI development through human-in-the-loop governance, file-by-file granularity, and complete review workflows before code modifications.',
};

export default function ImplementationPlansDocPage() {
  return (
    <>
      <StructuredData data={structuredData} />

      <DocsArticle
        title="Implementation Plans"
        description="How PlanToCode enables confident adoption of AI coding agents through human-in-the-loop governance, granular file-by-file plans, and comprehensive review workflows."
        date="2025-09-19"
        readTime="6 min"
        category="Product Guide"
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          Review and approve every plan before execution. Human-in-the-loop governance with file-by-file granularity ensures AI-generated changes align with corporate requirements and team workflows.
        </p>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Human-in-the-Loop Governance</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              PlanToCode implements a comprehensive human-in-the-loop (HITL) workflow that ensures team leads and stakeholders
              retain full control over every aspect of AI-generated implementation plans. This governance model prevents the
              regressions, bugs, and unintended modifications that can occur when AI coding agents operate autonomously.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Every plan must pass through a structured review workflow before any code modifications begin:
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">Review:</span>
                <span>Plans open in Monaco editor where reviewers can examine every proposed change with full syntax highlighting and professional editing tools.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">Edit:</span>
                <span>Stakeholders can directly modify steps, adjust approaches, add constraints, or remove risky operations using VS Code editing features.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">Request Changes:</span>
                <span>Teams can request modifications from the AI system, generating alternative approaches or merging multiple plans with custom instructions.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">Approve:</span>
                <span>Only after explicit approval can plans be securely transmitted to the chosen coding agent or assigned software developer for execution.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">Reject:</span>
                <span>Plans that don't meet requirements can be rejected entirely, with full audit trails maintained for compliance and learning.</span>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              This workflow ensures all development efforts align with corporate product requirements, team workflows, and business objectives.
              No code changes occur without explicit human approval.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">File-by-File Granularity</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Implementation plans use a highly granular structure that breaks down development tasks on a file-by-file basis,
              with exact file paths corresponding to the project's repository structure. This granularity is fundamental to
              preventing regressions and enabling confident adoption of AI coding agents in corporate environments.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Each step in a plan explicitly declares which files will be:
            </p>
            <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
              <li>Modified (with specific line ranges and changes described)</li>
              <li>Created (with complete file paths and initial content structure)</li>
              <li>Deleted (with justification and dependency analysis)</li>
              <li>Referenced (for context but not modified)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4 mb-4">
              This level of detail makes the impact of proposed changes crystal clear before any code is touched.
              Team leads can immediately identify if critical legacy code will be modified, if breaking changes are proposed,
              or if the plan touches files that require additional scrutiny.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The file-by-file approach also enables precise transmission of approved plans to coding agents. Instead of
              vague instructions like "update the authentication system," agents receive exact specifications:
              "modify src/auth/session_manager.rs lines 45-67 to add token rotation, create src/auth/token_store.rs
              with the following structure..."
            </p>
          </GlassCard>
        </section>

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
          <h2 className="text-2xl font-bold">Context and Metadata for Corporate Governance</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              The panel stores which repository roots were selected during the file discovery workflow so that follow-up actions
              reuse the same scope. It also records plan-specific metadata, such as the project directory and any prepared
              prompt content, so downstream prompts can be generated or copied without recomputing the workflow.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Token estimation runs before prompts are copied. The panel calls the token estimation command with the project
              directory, selected files, and the currently chosen model, surfacing both system and user prompt totals so teams
              can stay under model limits.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              All metadata persists with the plan for audit purposes. Corporate teams can track which stakeholders
              reviewed which plans, what modifications were requested, and the complete reasoning chain from initial
              task description through file discovery to final approved plan.
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
            <h2 className="text-xl font-semibold mb-3">Ready to adopt AI coding agents safely?</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Human-in-the-loop implementation plans are available inside the PlanToCode desktop application. Download the build for your platform to experience safe, governed AI-assisted development.
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
