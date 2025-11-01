import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safe Refactoring Tools - AI-Powered Planning for Risk-Free Code Changes',
  description: 'Stop breaking production with refactoring. PlanToCode provides a safety layer for AI-assisted refactoring with pre-execution review, dependency mapping, and multi-file change visibility.',
  keywords: [
    'safe refactoring tools',
    'ai refactoring',
    'refactoring safety',
    'code refactoring planning',
    'ai code refactoring',
    'safe code refactoring',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/safe-refactoring',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/safe-refactoring',
      'en': 'https://www.plantocode.com/solutions/safe-refactoring',
      'x-default': 'https://www.plantocode.com/solutions/safe-refactoring',
    },
  },
  openGraph: {
    title: 'Safe Refactoring Tools - AI-Powered Planning for Risk-Free Code Changes',
    description: 'Stop breaking production with refactoring. PlanToCode provides a safety layer for AI-assisted refactoring with pre-execution review and dependency mapping.',
    url: 'https://www.plantocode.com/solutions/safe-refactoring',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - Safe Refactoring with AI Planning',
    }],
  },
};

export default function SafeRefactoringPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            Safe Refactoring Tools: Why AI Needs a Planning Layer
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            AI coding tools can refactor code 10x faster than humans. They can also break production 10x faster.
            Here's how to get the speed without the chaos.
          </p>

          <GlassCard className="my-8 bg-red-500/10 border-red-500/20">
            <h2 className="text-2xl font-bold mb-4">The Refactoring Problem</h2>
            <p className="mb-4">
              <strong>Manual refactoring:</strong> Safe but slow. You carefully update each file, check dependencies, run tests.
            </p>
            <p className="mb-4">
              <strong>AI-powered refactoring:</strong> Fast but risky. Cursor, Copilot, and Claude can modify 20 files in seconds—but
              you don't know what changed until it's done.
            </p>
            <p>
              <strong>The gap:</strong> No review step. No "here's what I'm going to change" preview. Just instant execution and hope for the best.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Why Refactoring Breaks Things</h2>

          <p>Refactoring fails when AI tools miss hidden dependencies:</p>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">1. Import Chains</h3>
              <p className="text-sm">
                Rename <code>getUserData()</code> → <code>fetchUserProfile()</code> breaks 8 files that import it.
                AI sees the function but misses the cascade.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">2. Type Definitions</h3>
              <p className="text-sm">
                Change an interface property and watch TypeScript errors explode across the codebase. AI modifies the type
                but forgets files that depend on the old shape.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">3. Side Effects</h3>
              <p className="text-sm">
                Move database initialization code without updating startup scripts. The change compiles but fails at runtime
                when the DB isn't ready.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">4. Test Assumptions</h3>
              <p className="text-sm">
                Refactor error handling logic and break 15 integration tests that expect specific error messages.
                AI updates production code but forgets test mocks.
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Manual vs AI vs AI + Planning</h2>

          <GlassCard className="my-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-3">Approach</th>
                    <th className="text-left p-3">Speed</th>
                    <th className="text-left p-3">Safety</th>
                    <th className="text-left p-3">Visibility</th>
                    <th className="text-left p-3">Best For</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Manual</strong></td>
                    <td className="p-3">⏱️ Slow (hours/days)</td>
                    <td className="p-3">✅ High</td>
                    <td className="p-3">✅ Complete</td>
                    <td className="p-3">Small changes</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>AI Direct</strong></td>
                    <td className="p-3">⚡ Fast (minutes)</td>
                    <td className="p-3">❌ Low</td>
                    <td className="p-3">❌ After-the-fact</td>
                    <td className="p-3">Prototypes</td>
                  </tr>
                  <tr>
                    <td className="p-3"><strong>AI + Planning</strong></td>
                    <td className="p-3">⚡ Fast (minutes + review)</td>
                    <td className="p-3">✅ High</td>
                    <td className="p-3">✅ Pre-execution</td>
                    <td className="p-3">Production code</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">How PlanToCode Makes Refactoring Safe</h2>

          <p className="mb-6">
            PlanToCode adds a <strong>planning layer</strong> before any code is written. Instead of executing immediately,
            AI generates a detailed implementation plan that you review first.
          </p>

          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h3 className="text-2xl font-semibold mb-6">The Safe Refactoring Workflow</h3>
            <ol className="space-y-4">
              <li>
                <div>
                  <strong className="text-primary">1. Describe the refactoring</strong>
                  <p className="text-sm text-foreground/80 mt-1">
                    "Rename getUserData to fetchUserProfile across the entire codebase"
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong className="text-primary">2. AI maps dependencies</strong>
                  <p className="text-sm text-foreground/80 mt-1">
                    File discovery identifies all files that import or reference the function
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong className="text-primary">3. Generate implementation plan</strong>
                  <p className="text-sm text-foreground/80 mt-1">
                    File-by-file breakdown: what changes in each file, in what order
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong className="text-primary">4. Review and refine</strong>
                  <p className="text-sm text-foreground/80 mt-1">
                    Catch missing files, wrong assumptions, or edge cases BEFORE execution
                  </p>
                </div>
              </li>
              <li>
                <div>
                  <strong className="text-primary">5. Execute with confidence</strong>
                  <p className="text-sm text-foreground/80 mt-1">
                    Hand off approved plan to Claude Code, Cursor, or implement manually
                  </p>
                </div>
              </li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Real-World Example: Refactoring a 50K-Line Codebase</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Scenario: Migrate from REST to GraphQL</h3>
            <p className="mb-4">
              <strong>Task:</strong> Replace all REST API calls with GraphQL queries across a 50,000-line Next.js codebase.
            </p>

            <div className="bg-foreground/5 rounded-lg p-4 mb-4">
              <h4 className="font-semibold mb-2">Without Planning (Cursor/Copilot direct):</h4>
              <ul className="text-sm space-y-1">
                <li>• AI modifies API client files</li>
                <li>• Updates some component imports</li>
                <li>• Misses API calls in utility functions</li>
                <li>• Forgets to update error handling</li>
                <li>• Changes compile but fail at runtime</li>
                <li>• **Result:** 4 hours debugging production errors</li>
              </ul>
            </div>

            <div className="bg-primary/10 rounded-lg p-4">
              <h4 className="font-semibold mb-2">With PlanToCode:</h4>
              <ul className="text-sm space-y-1">
                <li>• File discovery finds 47 files using REST API</li>
                <li>• Plan shows migration order: types → client → components → utils</li>
                <li>• Identifies error handling patterns to preserve</li>
                <li>• Catches test files needing GraphQL mock updates</li>
                <li>• **Result:** Reviewed plan in 20 mins, executed safely</li>
              </ul>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Safety Features</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🔍 Dependency Mapping</h3>
              <p className="text-sm">
                AI-powered file discovery uncovers all files affected by the refactoring, including hidden imports,
                type dependencies, and cross-module references.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">✅ Pre-Execution Review</h3>
              <p className="text-sm">
                See exactly what will change before any code is written. Review file-by-file changes,
                edit the plan, and approve when ready.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">📋 Change Ordering</h3>
              <p className="text-sm">
                Plans specify the correct sequence: update types first, then implementations, then tests.
                Avoid intermediate broken states.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🧪 Test Coverage Check</h3>
              <p className="text-sm">
                Identify test files that need updates alongside production code. Don't ship refactoring
                with broken test suites.
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use Safe Refactoring</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Use Planning-First Refactoring When:</h3>
            <ul className="space-y-2">
              <li>✓ <strong>Large codebases (50K+ lines)</strong> - Too much code to review manually after changes</li>
              <li>✓ <strong>Multi-file refactoring</strong> - Renaming, moving, or restructuring across 5+ files</li>
              <li>✓ <strong>Production code</strong> - Changes going to users, not throwaway prototypes</li>
              <li>✓ <strong>Monorepos</strong> - Cross-package refactoring with shared dependencies</li>
              <li>✓ <strong>Team environments</strong> - Multiple developers need to understand the change scope</li>
              <li>✓ <strong>Breaking changes</strong> - API signature changes, type modifications, architectural shifts</li>
            </ul>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Skip Planning When:</h3>
            <ul className="space-y-2">
              <li>• <strong>Single-file changes</strong> - Isolated refactoring with no external dependencies</li>
              <li>• <strong>Prototypes</strong> - Throwaway code where breaking things is acceptable</li>
              <li>• <strong>Tiny projects</strong> - Less than 1,000 lines, easy to review everything manually</li>
            </ul>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Integration with Existing Tools</h2>

          <p className="mb-6">
            PlanToCode doesn't replace your AI coding tools—it complements them:
          </p>

          <GlassCard className="my-8 bg-foreground/5">
            <h3 className="text-xl font-semibold mb-4">Combined Workflow</h3>
            <ol className="space-y-3">
              <li>
                <strong>1. Plan with PlanToCode</strong>
                <p className="text-sm text-foreground/70 ml-4">Generate and review implementation plan with dependency mapping</p>
              </li>
              <li>
                <strong>2. Execute with your preferred tool</strong>
                <p className="text-sm text-foreground/70 ml-4">Paste plan into Cursor, Claude Code, or Copilot for code generation</p>
              </li>
              <li>
                <strong>3. Verify changes</strong>
                <p className="text-sm text-foreground/70 ml-4">Run tests, check diffs against the plan</p>
              </li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Getting Started</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Try Safe Refactoring in 3 Steps:</h3>
            <ol className="space-y-3">
              <li>
                <strong>1. Download PlanToCode</strong> (macOS, Windows, Linux)
              </li>
              <li>
                <strong>2. Open your project directory</strong> in the terminal
              </li>
              <li>
                <strong>3. Describe your refactoring</strong> and review the generated plan
              </li>
            </ol>
          </GlassCard>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Stop Breaking Production with Refactoring</h3>
            <p className="text-foreground/80 mb-6">
              Add a safety layer to your AI coding workflow. Review changes before they happen.
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
                How Planning Works
              </LinkWithArrow>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Frequently Asked Questions</h2>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-2">Does this slow down development?</h3>
            <p className="text-foreground/80">
              <strong>Initial review:</strong> Yes, reviewing a plan takes 5-15 minutes. <strong>Debugging broken refactoring:</strong> Can take hours or days.
              Net result: Faster overall, especially for complex changes.
            </p>
          </GlassCard>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-2">Can I use this with Cursor/Claude Code/Copilot?</h3>
            <p className="text-foreground/80">
              Yes. PlanToCode generates implementation plans that you can copy into any AI coding tool. The plan provides
              context so the tool makes better decisions during code generation.
            </p>
          </GlassCard>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-2">What programming languages are supported?</h3>
            <p className="text-foreground/80">
              All languages. File discovery works at the file system level and uses static analysis for imports.
              TypeScript, JavaScript, Python, Rust, Go, Java, and more.
            </p>
          </GlassCard>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-2">How does dependency mapping work?</h3>
            <p className="text-foreground/80">
              AI-powered file discovery analyzes import statements, type references, and cross-file dependencies.
              It builds a graph of which files depend on which, so refactoring plans include all affected files.
            </p>
          </GlassCard>

          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Last updated:</strong> November 2025. Information based on current PlanToCode capabilities
            and integration with Claude Code, Cursor, GitHub Copilot, and other AI coding tools.
          </p>
        </article>
      </main>
    </div>
  );
}
