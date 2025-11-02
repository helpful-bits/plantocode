import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import { ComparisonPageClient } from '@/components/compare/ComparisonPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'vsVS Code Tasks - Development Workflow Comparison',
  description: 'Compare PlanToCode\'sdynamic AI planning with VS Code\'s static task system. AI generation, adaptability, context awareness.',
  keywords: [
    'vscode-tasks',
    'plantocode vs vscode-tasks',
    'vscode-tasks alternative',
    'ai code planning',
    'implementation planning',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/compare/plantocode-vs-vscode-tasks',
    languages: {
      'en-US': 'https://www.plantocode.com/compare/plantocode-vs-vscode-tasks',
      'en': 'https://www.plantocode.com/compare/plantocode-vs-vscode-tasks',
      'x-default': 'https://www.plantocode.com/compare/plantocode-vs-vscode-tasks',
    },
  },
  openGraph: {
    title: 'vsVS Code Tasks - Development Workflow Comparison',
    description: 'Compare PlanToCode\'sdynamic AI planning with VS Code\'s static task system. AI generation, adaptability, context awareness.',
    url: 'https://www.plantocode.com/compare/plantocode-vs-vscode-tasks',
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
            PlanToCode vsVS Code Tasks
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            Dynamic AI plans vs static task runners
          </p>

          <GlassCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Feature</th>
                    <th className="text-left p-2">PlanToCode</th>
                    <th className="text-left p-2">Vscode Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">AI Generation</td>
                    <td className="p-2">AI generates plans based on project context</td>
                    <td className="p-2">Manual task configuration required</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Adaptability</td>
                    <td className="p-2">Plans adapt to changing project needs</td>
                    <td className="p-2">Static task definitions</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Context Awareness</td>
                    <td className="p-2">Full codebase understanding</td>
                    <td className="p-2">Basic file path awareness</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Error Handling</td>
                    <td className="p-2">AI analyzes failures and suggests fixes</td>
                    <td className="p-2">Basic error output only</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Cross-Project Learning</td>
                    <td className="p-2">Learns patterns across projects</td>
                    <td className="p-2">Project-specific configurations</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Pain Points Solved</h2>

          
          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: VS Code tasks require manual configuration and maintenance</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> AI automatically generates context-aware execution plans
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Static tasks can't adapt to changing project structure</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Dynamic plans that understand current project state
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Limited error analysis and recovery suggestions</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> AI-powered failure analysis with actionable fixes
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Comparison Workflow</h2>

          <GlassCard className="my-6">
            <ol className="space-y-3">
              <li><strong>1. Compare static vs dynamic task generation</strong></li>
              <li><strong>2. Show context-aware planning advantages</strong></li>
              <li><strong>3. Demonstrate adaptive execution</strong></li>
              <li><strong>4. Highlight AI-powered error handling</strong></li>
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
              <h3 className="text-xl font-semibold mb-4">Use Vscode Tasks When:</h3>
              <ul className="space-y-2">
                <li>• Need immediate code generation</li>
                <li>• Working on smaller projects</li>
                <li>• Comfortable with direct execution</li>
                <li>• Prefer integrated development environment</li>
              </ul>
            </GlassCard>
          </div>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try Dynamic AI Planning</h3>
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
