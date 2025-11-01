import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import { ComparisonPageClient } from '@/components/compare/ComparisonPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PlanToCode vsCursor Agents - AI Planning Tool Comparison',
  description: 'Compare PlanToCode\'sarchitectural planning with Cursor Agents\' editor-first approach. Context awareness, execution control, plan review.',
  keywords: [
    'cursor-agents',
    'plantocode vs cursor-agents',
    'cursor-agents alternative',
    'ai code planning',
    'implementation planning',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/compare/plantocode-vs-cursor-agents',
    languages: {
      'en-US': 'https://www.plantocode.com/compare/plantocode-vs-cursor-agents',
      'en': 'https://www.plantocode.com/compare/plantocode-vs-cursor-agents',
      'x-default': 'https://www.plantocode.com/compare/plantocode-vs-cursor-agents',
    },
  },
  openGraph: {
    title: 'PlanToCode vsCursor Agents - AI Planning Tool Comparison',
    description: 'Compare PlanToCode\'sarchitectural planning with Cursor Agents\' editor-first approach. Context awareness, execution control, plan review.',
    url: 'https://www.plantocode.com/compare/plantocode-vs-cursor-agents',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function ComparisonPage() {
  return (
    <ComparisonPageClient>
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            PlanToCode vsCursor Agents
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            Architectural planning vs editor-first AI
          </p>

          <GlassCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Feature</th>
                    <th className="text-left p-2">PlanToCode</th>
                    <th className="text-left p-2">Cursor Agents</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Context Awareness</td>
                    <td className="p-2">Full project architecture mapping</td>
                    <td className="p-2">Indexed codebase context (Codebase Indexing), multi-file edits, Agent Terminal and Shell Mode with approvals/allowlists.</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Execution Control</td>
                    <td className="p-2">Plan review and approval workflow</td>
                    <td className="p-2">Autonomous edits and terminal execution with review/diff flow and optional approvals/allowlists.</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Plan Review</td>
                    <td className="p-2">Multi-step plan generation and review</td>
                    <td className="p-2">Review/diff UI, checkpoints, and apply workflow for multi-file changes</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Cross-File Changes</td>
                    <td className="p-2">Coordinated multi-file planning</td>
                    <td className="p-2">Agent/tool-driven multi-file edits</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Terminal Integration</td>
                    <td className="p-2">Native terminal with AI plans</td>
                    <td className="p-2">Shared agent terminal and Shell/Agent modes; background agents can run in remote environments (tmux). Persistence behavior depends on agent/editor context.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Pain Points Solved</h2>

          
          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Cursor agents work file-by-file without architectural view</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Full project context with dependency mapping
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: No review process before changes are made</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Generate, review, approve, then execute plans
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Limited to editor context and workflows</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Terminal-native with broader system integration
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Comparison Workflow</h2>

          <GlassCard className="my-6">
            <ol className="space-y-3">
              <li><strong>1. Compare architectural vs editor-first approach</strong></li>
              <li><strong>2. Show cross-file coordination benefits</strong></li>
              <li><strong>3. Demonstrate plan review workflow</strong></li>
              <li><strong>4. Highlight terminal integration</strong></li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Why Choose PlanToCode?</h2>

          <p>
            PlanToCode takes a <strong>planning-first approach</strong> to AI-assisted development.
            Instead of generating code immediately, we help you create detailed implementation plans
            that you can review, edit, and approve before execution.
          </p>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-4">The Planning-First Workflow</h3>
            <ol className="space-y-2">
              <li><strong>1. Describe your goal</strong> - Use natural language or voice input</li>
              <li><strong>2. AI generates implementation plan</strong> - File-by-file breakdown with exact paths</li>
              <li><strong>3. Review and refine</strong> - Edit the plan, catch issues early</li>
              <li><strong>4. Execute with confidence</strong> - Hand off to your preferred tool (Claude Code, Cursor, etc.)</li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use Each Tool</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-4">Use PlanToCode When:</h3>
              <ul className="space-y-2">
                <li>• Working in large/complex codebases</li>
                <li>• Need to review changes before execution</li>
                <li>• Want to prevent duplicate files and wrong paths</li>
                <li>• Require approval workflows for teams</li>
                <li>• Working across multiple AI models</li>
              </ul>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-4">Use Cursor Agents When:</h3>
              <ul className="space-y-2">
                <li>• Need immediate code generation</li>
                <li>• Working on smaller projects</li>
                <li>• Comfortable with direct execution</li>
                <li>• Prefer integrated development environment</li>
              </ul>
            </GlassCard>
          </div>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try Architectural Planning</h3>
            <p className="text-foreground/80 mb-6">
              Experience the planning-first approach to AI-assisted development
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Download PlanToCode
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs"
                className="inline-flex items-center"
              >
                View Documentation
              </LinkWithArrow>
            </div>
          </div>

          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Last updated:</strong> November 2025. This comparison is based on publicly available
            information and hands-on testing. Both tools serve different purposes and can complement
            each other in a comprehensive development workflow.
          </p>
        </article>
      </main>
    </ComparisonPageClient>
  );
}
