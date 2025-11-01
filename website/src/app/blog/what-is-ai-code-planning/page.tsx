import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'What is AI Code Planning? A Developer\'s Guide to Safe Refactoring',
  description: 'Learn what AI code planning is, why it matters for large codebases, and how planning-first development prevents the chaos that direct AI code generation creates.',
  keywords: [
    'ai code planning',
    'ai coding assistant',
    'ai code generation',
    'implementation planning',
    'ai development tools',
    'code planning tools',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/blog/what-is-ai-code-planning',
    languages: {
      'en-US': 'https://www.plantocode.com/blog/what-is-ai-code-planning',
      'en': 'https://www.plantocode.com/blog/what-is-ai-code-planning',
      'x-default': 'https://www.plantocode.com/blog/what-is-ai-code-planning',
    },
  },
  openGraph: {
    title: 'What is AI Code Planning? A Developer\'s Guide to Safe Refactoring',
    description: 'Learn what AI code planning is, why it matters for large codebases, and how planning-first development prevents AI coding chaos.',
    url: 'https://www.plantocode.com/blog/what-is-ai-code-planning',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - What is AI Code Planning?',
    }],
  },
};

export default function WhatIsAICodePlanningPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            What is AI Code Planning? A Developer's Guide
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            AI coding assistants can write code faster than ever. But the faster they move, the more chaos they create.
            AI code planning adds a safety layer: <strong>think first, code second</strong>.
          </p>

          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h2 className="text-2xl font-bold mb-4">TL;DR</h2>
            <p className="mb-0">
              <strong>AI Code Planning</strong> is the practice of using AI to generate detailed implementation plans
              <em> before</em> writing any code. Instead of AI directly modifying files, it creates a file-by-file
              roadmap that humans review and approve. This prevents duplicate files, wrong paths, and production
              breaks common with direct AI code generation.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">The Problem with Direct AI Code Generation</h2>

          <p>
            Tools like GitHub Copilot, Cursor, and ChatGPT can generate code instantly. You describe a feature,
            and seconds later, files are created or modified. Fast, but chaotic:
          </p>

          <GlassCard className="my-8 bg-red-500/10 border-red-500/20">
            <h3 className="text-xl font-semibold mb-4">Common Problems</h3>
            <ul className="space-y-2 mb-0">
              <li>🔴 <strong>Duplicate files:</strong> AI creates <code>user-service.ts</code> when <code>userService.ts</code> already exists</li>
              <li>🔴 <strong>Wrong paths:</strong> Creates files in <code>src/components/</code> when they belong in <code>src/lib/</code></li>
              <li>🔴 <strong>Missed dependencies:</strong> Updates a function without updating files that import it</li>
              <li>🔴 <strong>Breaking changes:</strong> Modifies an API that 15 components depend on without updating them</li>
            </ul>
          </GlassCard>

          <p>
            These aren't edge cases. Browse the <a href="https://forum.cursor.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Cursor forum</a> or <a href="https://community.openai.com/c/api/copilot/49" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Copilot discussions</a>,
            and you'll find hundreds of reports of AI tools creating chaos in production codebases.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">What is AI Code Planning?</h2>

          <p>
            AI code planning flips the workflow: instead of generating code immediately, AI creates a <strong>detailed implementation plan</strong> first.
          </p>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">The Planning-First Workflow</h3>
            <ol className="space-y-3 mb-0">
              <li>
                <strong className="text-primary">1. Describe the task</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  "Add user authentication with JWT tokens"
                </p>
              </li>
              <li>
                <strong className="text-primary">2. AI analyzes your codebase</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Maps existing auth patterns, identifies files to modify, checks dependencies
                </p>
              </li>
              <li>
                <strong className="text-primary">3. AI generates an implementation plan</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  File-by-file breakdown: what changes in each file, in what order
                </p>
              </li>
              <li>
                <strong className="text-primary">4. You review and edit the plan</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Catch wrong assumptions, add missing files, adjust approach
                </p>
              </li>
              <li>
                <strong className="text-primary">5. Execute with confidence</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Hand off to Cursor/Copilot for code generation, or implement manually
                </p>
              </li>
            </ol>
          </GlassCard>

          <p className="mt-6">
            The key difference: <strong>visibility and control</strong>. You see what will change before any code is written.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">AI Code Planning vs AI Code Generation</h2>

          <GlassCard className="my-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-3">Aspect</th>
                    <th className="text-left p-3">Direct Generation</th>
                    <th className="text-left p-3">Planning-First</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Speed</strong></td>
                    <td className="p-3">⚡ Instant (seconds)</td>
                    <td className="p-3">⏱️ Slightly slower (+ review time)</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Visibility</strong></td>
                    <td className="p-3">❌ After-the-fact</td>
                    <td className="p-3">✅ Pre-execution</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Control</strong></td>
                    <td className="p-3">❌ AI decides everything</td>
                    <td className="p-3">✅ Human approval required</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Error Recovery</strong></td>
                    <td className="p-3">🔴 Hard (undo/revert)</td>
                    <td className="p-3">✅ Easy (edit plan)</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Best For</strong></td>
                    <td className="p-3">Prototypes, small projects</td>
                    <td className="p-3">Production code, teams, large codebases</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Why Planning Matters for Large Codebases</h2>

          <p>
            In a 5,000-line prototype, you can review every file AI touches. In a 500,000-line production codebase?
            Impossible. You need structure.
          </p>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Scale Challenges</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Small Codebase (5K lines)</h4>
                <ul className="text-sm space-y-1">
                  <li>• 20-50 files total</li>
                  <li>• Simple dependency tree</li>
                  <li>• Easy to review all changes</li>
                  <li>• Breaking things is low-risk</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Large Codebase (500K lines)</h4>
                <ul className="text-sm space-y-1">
                  <li>• 2,000+ files</li>
                  <li>• Complex import chains</li>
                  <li>• Impossible to review all manually</li>
                  <li>• Breaking things costs $$$</li>
                </ul>
              </div>
            </div>
          </GlassCard>

          <p className="mt-6">
            <strong>Example:</strong> You ask AI to "refactor user authentication." In a small project, it modifies 3 files.
            In a large codebase, it might need to touch 40 files across 8 modules. Without a plan, you won't know
            if AI missed critical dependencies until production breaks.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Features of AI Code Planning Tools</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🗺️ Dependency Mapping</h3>
              <p className="text-sm">
                AI analyzes import statements, type definitions, and cross-file references to identify all files
                affected by a change. No more "forgot to update the tests" surprises.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">📋 File-by-File Breakdown</h3>
              <p className="text-sm">
                Plans specify exactly what changes in each file: "Update <code>auth.ts</code> line 45-67, add new function..."
                You know the scope before execution.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">✅ Human Approval Gate</h3>
              <p className="text-sm">
                Nothing happens automatically. Review the plan, edit it, approve it—then hand off to code generation.
                You stay in control.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🔄 Multi-Model Planning</h3>
              <p className="text-sm">
                Generate plans from Claude, GPT-4, and Gemini. Compare approaches, merge the best ideas.
                Diversity improves plan quality.
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Real-World Use Cases</h2>

          <GlassCard className="my-8 bg-foreground/5">
            <h3 className="text-xl font-semibold mb-4">1. Refactoring a Monolith to Microservices</h3>
            <p className="mb-2">
              <strong>Task:</strong> Extract user management into a separate service
            </p>
            <p className="text-sm text-foreground/80 mb-3">
              <strong>Without planning:</strong> AI moves files, breaks 50+ import paths, creates incompatible
              interfaces between services. Hours of debugging.
            </p>
            <p className="text-sm text-foreground/80">
              <strong>With planning:</strong> Plan shows service boundary, API contracts, migration order. Review
              catches breaking changes before they happen. Clean execution.
            </p>
          </GlassCard>

          <GlassCard className="my-8 bg-foreground/5">
            <h3 className="text-xl font-semibold mb-4">2. Upgrading a Major Library</h3>
            <p className="mb-2">
              <strong>Task:</strong> Migrate from React Router v5 to v6
            </p>
            <p className="text-sm text-foreground/80 mb-3">
              <strong>Without planning:</strong> AI updates routing config but misses nested routes, forgets to
              update navigation hooks, breaks dynamic routes.
            </p>
            <p className="text-sm text-foreground/80">
              <strong>With planning:</strong> Plan identifies all route files, shows v5→v6 pattern changes,
              catches edge cases in review. Smooth migration.
            </p>
          </GlassCard>

          <GlassCard className="my-8 bg-foreground/5">
            <h3 className="text-xl font-semibold mb-4">3. Adding Feature Flags to 200 Components</h3>
            <p className="mb-2">
              <strong>Task:</strong> Wrap experimental features in feature flags
            </p>
            <p className="text-sm text-foreground/80 mb-3">
              <strong>Without planning:</strong> AI adds flags inconsistently, uses different patterns across
              files, misses some components entirely.
            </p>
            <p className="text-sm text-foreground/80">
              <strong>With planning:</strong> Plan shows standardized flag pattern, lists all 200 components,
              ensures consistency. QA verifies against the plan.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use AI Code Planning</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Use Planning When:</h3>
            <ul className="space-y-2 mb-0">
              <li>✓ <strong>Large codebase (50K+ lines)</strong> - Too complex to review all changes manually</li>
              <li>✓ <strong>Multi-file changes (5+ files)</strong> - Need visibility into cross-file dependencies</li>
              <li>✓ <strong>Production code</strong> - Breaking things has real costs</li>
              <li>✓ <strong>Team environments</strong> - Others need to understand your changes</li>
              <li>✓ <strong>Complex refactoring</strong> - Architectural changes, API migrations, library upgrades</li>
              <li>✓ <strong>Monorepos</strong> - Cross-package changes with shared dependencies</li>
            </ul>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Skip Planning When:</h3>
            <ul className="space-y-2 mb-0">
              <li>• <strong>Prototypes</strong> - Throwaway code where breaking things is fine</li>
              <li>• <strong>Single-file changes</strong> - Isolated modifications with no dependencies</li>
              <li>• <strong>Small projects (&lt;1K lines)</strong> - Easy to review everything manually</li>
            </ul>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">How to Get Started with AI Code Planning</h2>

          <ol className="space-y-4 my-8">
            <li>
              <strong>1. Choose a planning tool</strong>
              <p className="text-foreground/80">
                Tools like <a href="/" className="text-primary hover:underline">PlanToCode</a> specialize in generating
                implementation plans with file discovery and dependency mapping.
              </p>
            </li>
            <li>
              <strong>2. Start with one refactoring task</strong>
              <p className="text-foreground/80">
                Pick a multi-file change you've been avoiding (e.g., "rename this API endpoint").
                Generate a plan and see what the tool uncovers.
              </p>
            </li>
            <li>
              <strong>3. Review and refine the plan</strong>
              <p className="text-foreground/80">
                Edit the plan based on your domain knowledge. Add missing files, adjust the approach, fix assumptions.
              </p>
            </li>
            <li>
              <strong>4. Execute with your preferred tool</strong>
              <p className="text-foreground/80">
                Copy the plan into Cursor, Claude Code, or Copilot. The plan provides context for better code generation.
              </p>
            </li>
          </ol>

          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h3 className="text-xl font-semibold mb-3">Pro Tip: Multi-Model Planning</h3>
            <p className="text-sm mb-0">
              Don't rely on a single AI model. Generate plans from Claude Sonnet, GPT-4, and Gemini Pro. Compare
              approaches—one might catch edge cases the others miss. Merge the best ideas into a final plan.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">The Future of AI-Assisted Development</h2>

          <p>
            As codebases grow and AI tools get faster, the planning layer becomes more critical. Direct code generation
            works for prototypes, but production systems need structure.
          </p>

          <p className="mt-4">
            The trend is clear: <strong>AI should help us think, not just type</strong>. Code planning tools are the
            missing piece between "AI generated some code" and "AI helped me ship a solid feature."
          </p>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try Planning-First Development</h3>
            <p className="text-foreground/80 mb-6">
              See how AI code planning prevents chaos in large codebases. Review before execution.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Download PlanToCode
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs/implementation-plans"
                className="inline-flex items-center"
              >
                Read the Docs
              </LinkWithArrow>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Further Reading</h2>

          <ul className="space-y-2">
            <li>
              <LinkWithArrow href="/solutions/prevent-duplicate-files">
                How to Prevent AI from Creating Duplicate Files
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/solutions/safe-refactoring">
                Safe Refactoring Tools for Production Code
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/solutions/ai-wrong-paths">
                Why AI Gets File Paths Wrong (and How to Fix It)
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/docs/file-discovery">
                File Discovery: How AI Finds Related Files
              </LinkWithArrow>
            </li>
          </ul>

          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Published:</strong> November 2025 | <strong>Author:</strong> PlanToCode Team
          </p>
        </article>
      </main>
    </div>
  );
}
