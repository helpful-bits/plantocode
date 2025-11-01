import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import { ComparisonPageClient } from '@/components/compare/ComparisonPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PlanToCode vs Warp - AI Terminal Comparison for Developers',
  description: 'Compare PlanToCode\'s architectural AI planning with Warp\'s terminal AI. File discovery, multi-model plans, implementation workflows.',
  keywords: [
    'warp',
    'plantocode vs warp',
    'warp alternative',
    'ai code planning',
    'implementation planning',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/compare/plantocode-vs-warp-ai-terminal',
    languages: {
      'en-US': 'https://www.plantocode.com/compare/plantocode-vs-warp-ai-terminal',
      'en': 'https://www.plantocode.com/compare/plantocode-vs-warp-ai-terminal',
      'x-default': 'https://www.plantocode.com/compare/plantocode-vs-warp-ai-terminal',
    },
  },
  openGraph: {
    title: 'PlanToCode vs Warp - AI Terminal Comparison for Developers',
    description: 'Compare PlanToCode\'s architectural AI planning with Warp\'s terminal AI. File discovery, multi-model plans, implementation workflows.',
    url: 'https://www.plantocode.com/compare/plantocode-vs-warp-ai-terminal',
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
            PlanToCode vs Warp AI Terminal
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            Architectural awareness vs terminal suggestions
          </p>

          <GlassCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Feature</th>
                    <th className="text-left p-2">PlanToCode</th>
                    <th className="text-left p-2">Warp</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">AI Scope</td>
                    <td className="p-2">Full codebase awareness</td>
                    <td className="p-2">Terminal commands only</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Planning</td>
                    <td className="p-2">Multi-model implementation plans</td>
                    <td className="p-2">Command suggestions</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">File Discovery</td>
                    <td className="p-2">AI-powered dependency mapping</td>
                    <td className="p-2">Not available</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Integration</td>
                    <td className="p-2">Claude Code, Cursor, Codex CLI</td>
                    <td className="p-2">Built-in Warp AI (no native integration with Cursor or Claude Code)</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Pricing</td>
                    <td className="p-2">$5 credits, pay-as-you-go</td>
                    <td className="p-2">Free, Pro, Turbo, Business, Lightspeed (as of 2025‑09‑26).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Pain Points Solved</h2>

          
          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Warp AI only knows terminal context, not your codebase</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> PlanToCode understands your entire architecture
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Command suggestions don't prevent breaking changes</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Full impact analysis before any execution
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: No planning or review before execution</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Generate, review, and merge implementation plans
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Comparison Workflow</h2>

          <GlassCard className="my-6">
            <ol className="space-y-3">
              <li><strong>1. Compare AI capabilities</strong></li>
              <li><strong>2. Show architectural awareness</strong></li>
              <li><strong>3. Demonstrate planning workflow</strong></li>
              <li><strong>4. Highlight integration options</strong></li>
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
              <h3 className="text-xl font-semibold mb-4">Use Warp When:</h3>
              <ul className="space-y-2">
                <li>• Need immediate code generation</li>
                <li>• Working on smaller projects</li>
                <li>• Comfortable with direct execution</li>
                <li>• Prefer integrated development environment</li>
              </ul>
            </GlassCard>
          </div>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try Architectural AI</h3>
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
