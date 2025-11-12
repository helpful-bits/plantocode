import { GlassCard } from '@/components/ui/GlassCard';
import { BlogArticle } from '@/components/blog/BlogArticle';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import type { Metadata } from 'next';
import { locales } from '@/i18n/config';
import { loadMessages, type Locale } from '@/lib/i18n';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/blog/ai-pair-programming-vs-ai-planning',
      title: t['blog.ai-pair-programming-vs-ai-planning.meta.title'],
      description: t['blog.ai-pair-programming-vs-ai-planning.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'ai pair programming',
    'ai code planning',
    'copilot vs planning',
    'ai development workflow',
    'ai coding assistant',
    'implementation planning',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function AIPairProgrammingVsAIPlanningPage() {
  return (
    <BlogArticle
      title="AI Pair Programming vs AI Planning"
      description="Both approaches use AI to write code. But they solve fundamentally different problems. Here's when to use each (and why you probably need both)."
      date="2025-11-03"
      readTime="12 min"
      category="Concepts"
      author="PlanToCode Team"
    >

          <h2 className="text-3xl font-bold mt-12 mb-6">Definitions</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">AI Pair Programming</h3>
              <p className="text-sm mb-3">
                AI assists as you write code in real-time. Autocomplete, inline suggestions, chat-based generation.
              </p>
              <p className="text-sm font-semibold">Tools:</p>
              <ul className="text-sm space-y-1">
                <li>• GitHub Copilot</li>
                <li>• Cursor</li>
                <li>• Tabnine</li>
                <li>• Amazon CodeWhisperer</li>
              </ul>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">AI Planning</h3>
              <p className="text-sm mb-3">
                AI generates implementation plans <em>before</em> code is written. File-by-file roadmaps with
                dependency mapping and human review.
              </p>
              <p className="text-sm font-semibold">Tools:</p>
              <ul className="text-sm space-y-1">
                <li>• PlanToCode</li>
                <li>• Claude Code (with planning workflow)</li>
                <li>• Custom GPT-4 prompts</li>
              </ul>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Differences</h2>

          <GlassCard className="my-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-3">Aspect</th>
                    <th className="text-left p-3">Pair Programming</th>
                    <th className="text-left p-3">Planning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Speed</strong></td>
                    <td className="p-3">⚡ Real-time</td>
                    <td className="p-3">⏱️ Review step adds time</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Scope</strong></td>
                    <td className="p-3">Line-by-line, function-level</td>
                    <td className="p-3">Multi-file, architectural</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Control</strong></td>
                    <td className="p-3">Accept/reject suggestions</td>
                    <td className="p-3">Edit plan before execution</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Visibility</strong></td>
                    <td className="p-3">See code as it's written</td>
                    <td className="p-3">See roadmap before changes</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-3"><strong>Best For</strong></td>
                    <td className="p-3">New features, boilerplate</td>
                    <td className="p-3">Refactoring, migrations</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use AI Pair Programming</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Best Use Cases</h3>
            <ul className="space-y-3 mb-0">
              <li>
                ✓ <strong>Writing new features from scratch</strong><br/>
                <span className="text-sm text-foreground/80">
                  AI suggests implementations as you write. Greenfield code with no legacy constraints.
                </span>
              </li>
              <li>
                ✓ <strong>Generating boilerplate code</strong><br/>
                <span className="text-sm text-foreground/80">
                  CRUD operations, API endpoints, test scaffolding—repetitive patterns AI handles well.
                </span>
              </li>
              <li>
                ✓ <strong>Solo development on small projects</strong><br/>
                <span className="text-sm text-foreground/80">
                  Less than 10K lines, simple architecture, you can review everything manually.
                </span>
              </li>
              <li>
                ✓ <strong>Learning new APIs or frameworks</strong><br/>
                <span className="text-sm text-foreground/80">
                  AI suggests correct syntax and patterns. Faster than reading docs.
                </span>
              </li>
              <li>
                ✓ <strong>Quick prototyping and experimentation</strong><br/>
                <span className="text-sm text-foreground/80">
                  Move fast, break things. Code quality matters less than iteration speed.
                </span>
              </li>
            </ul>
          </GlassCard>

          <GlassCard className="my-8 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-lg font-semibold mb-2">⚠️ When Pair Programming Struggles</h3>
            <ul className="text-sm space-y-1 mb-0">
              <li>• Large codebases (50K+ lines) - Misses architectural context</li>
              <li>• Multi-file refactoring - No cross-file dependency awareness</li>
              <li>• Team environments - No review gate before changes ship</li>
              <li>• Production code with strict requirements - Too risky without planning</li>
            </ul>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use AI Planning</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Best Use Cases</h3>
            <ul className="space-y-3 mb-0">
              <li>
                ✓ <strong>Refactoring existing code</strong><br/>
                <span className="text-sm text-foreground/80">
                  Plans show which files change, in what order. Prevents breaking dependencies.
                </span>
              </li>
              <li>
                ✓ <strong>Library upgrades and migrations</strong><br/>
                <span className="text-sm text-foreground/80">
                  Map all usages of old API, plan replacement strategy, execute systematically.
                </span>
              </li>
              <li>
                ✓ <strong>Large-scale architectural changes</strong><br/>
                <span className="text-sm text-foreground/80">
                  Splitting monoliths, changing data flows, restructuring modules—need visibility.
                </span>
              </li>
              <li>
                ✓ <strong>Team collaboration on complex features</strong><br/>
                <span className="text-sm text-foreground/80">
                  Multiple developers need shared understanding. Plans provide that blueprint.
                </span>
              </li>
              <li>
                ✓ <strong>Compliance and audit requirements</strong><br/>
                <span className="text-sm text-foreground/80">
                  Document what changed, why, and who approved. Plans create audit trail.
                </span>
              </li>
            </ul>
          </GlassCard>

          <GlassCard className="my-8 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-lg font-semibold mb-2">⚠️ When Planning Is Overkill</h3>
            <ul className="text-sm space-y-1 mb-0">
              <li>• Single-file changes with no dependencies</li>
              <li>• Quick bug fixes in isolated code</li>
              <li>• Throwaway prototypes where quality doesn't matter</li>
              <li>• Simple UI tweaks with no business logic</li>
            </ul>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">The Winning Combination: Both</h2>

          <p>
            The best teams don't choose one or the other. They use both, for different tasks.
          </p>

          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h3 className="text-xl font-semibold mb-4">Recommended Workflow</h3>
            <ol className="space-y-4 mb-0">
              <li>
                <strong>1. Plan with AI (for complex changes)</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Use PlanToCode to generate file-by-file implementation plan. Review, refine, approve.
                </p>
              </li>
              <li>
                <strong>2. Implement with pair programming (for execution)</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Hand plan to Copilot/Cursor. AI generates code following your approved roadmap.
                </p>
              </li>
              <li>
                <strong>3. Review and iterate</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Check implementation matches plan. Run tests. Ship with confidence.
                </p>
              </li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Real-World Examples</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Example 1: Adding User Authentication</h3>
            <p className="mb-3"><strong>Approach: Pair Programming (Copilot)</strong></p>
            <div className="bg-foreground/5 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold mb-2">Why:</p>
              <ul className="text-sm space-y-1">
                <li>• Mostly new code (auth service, middleware, routes)</li>
                <li>• Limited impact on existing code</li>
                <li>• Standard patterns Copilot knows well</li>
              </ul>
            </div>
            <p className="text-sm text-foreground/80">
              <strong>Result:</strong> Implemented in 2 hours with Copilot suggesting boilerplate.
              Worked great.
            </p>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Example 2: Migrating from Redux to Zustand</h3>
            <p className="mb-3"><strong>Approach: Planning First (PlanToCode) + Execution (Cursor)</strong></p>
            <div className="bg-foreground/5 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold mb-2">Why:</p>
              <ul className="text-sm space-y-1">
                <li>• Affects 40+ components</li>
                <li>• Need to update store, actions, selectors systematically</li>
                <li>• Risk of breaking existing features</li>
              </ul>
            </div>
            <p className="text-sm text-foreground/80">
              <strong>Result:</strong> Plan identified all Redux usage, mapped to Zustand patterns. Cursor
              executed the plan file-by-file. Zero production breaks.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Choosing Your Workflow</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Decision Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">If your task is...</th>
                    <th className="text-left p-2">Use This</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">New feature, greenfield code</td>
                    <td className="p-2"><strong>Pair Programming</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Refactoring, renaming, restructuring</td>
                    <td className="p-2"><strong>Planning</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Affecting 1-3 files</td>
                    <td className="p-2"><strong>Pair Programming</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Affecting 5+ files</td>
                    <td className="p-2"><strong>Planning</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Solo dev, small project</td>
                    <td className="p-2"><strong>Pair Programming</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Team collaboration needed</td>
                    <td className="p-2"><strong>Planning</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Prototype, can break things</td>
                    <td className="p-2"><strong>Pair Programming</strong></td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Production, can't break things</td>
                    <td className="p-2"><strong>Planning</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Common Misconceptions</h2>

          <div className="space-y-6 my-8">
            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">❌ "Planning is slower"</h3>
              <p className="text-sm">
                <strong>Reality:</strong> Planning adds 10-30 minutes upfront but saves hours of debugging.
                Net result: faster overall for complex changes.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">❌ "Copilot can do everything"</h3>
              <p className="text-sm">
                <strong>Reality:</strong> Copilot excels at line-level suggestions but lacks architectural context.
                It can't see the full codebase like a planning tool can.
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-lg font-semibold mb-2">❌ "You have to choose one"</h3>
              <p className="text-sm">
                <strong>Reality:</strong> Best teams use both. Plan complex changes, pair program for execution.
                They complement each other.
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Conclusion</h2>

          <p>
            AI pair programming and AI planning solve different problems:
          </p>

          <ul className="my-6 space-y-2">
            <li>
              <strong>Pair programming:</strong> Fast code generation, real-time assistance, great for new features
            </li>
            <li>
              <strong>Planning:</strong> Architectural visibility, dependency mapping, essential for refactoring
            </li>
          </ul>

          <p>
            Don't think of them as competitors. Think of planning as the "think" phase and pair programming
            as the "execute" phase. Use both, and you get AI-assisted development that's both fast and safe.
          </p>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try the Planning-First Workflow</h3>
            <p className="text-foreground/80 mb-6">
              Use PlanToCode for planning, Copilot/Cursor for execution. Get the best of both worlds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Download PlanToCode
              </LinkWithArrow>
              <LinkWithArrow
                href="/blog/what-is-ai-code-planning"
                className="inline-flex items-center"
              >
                Learn About AI Planning
              </LinkWithArrow>
            </div>
          </div>

    </BlogArticle>
  );
}
