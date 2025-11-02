import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import { ComparisonPageClient } from '@/components/compare/ComparisonPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'vsAider - AI Development Tool Comparison',
  description: 'Compare PlanToCode\'splan-first approach with Aider\'s agent-first CLI. Planning workflow, file discovery, session persistence, multi-model support.',
  keywords: [
    'aider',
    'plantocode vs aider',
    'aider alternative',
    'ai code planning',
    'implementation planning',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/compare/plantocode-vs-aider',
    languages: {
      'en-US': 'https://www.plantocode.com/compare/plantocode-vs-aider',
      'en': 'https://www.plantocode.com/compare/plantocode-vs-aider',
      'x-default': 'https://www.plantocode.com/compare/plantocode-vs-aider',
    },
  },
  openGraph: {
    title: 'vsAider - AI Development Tool Comparison',
    description: 'Compare PlanToCode\'splan-first approach with Aider\'s agent-first CLI. Planning workflow, file discovery, session persistence, multi-model support.',
    url: 'https://www.plantocode.com/compare/plantocode-vs-aider',
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
            PlanToCode vsAider
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            Plan-first terminal vs agent-first CLI
          </p>

          <GlassCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Feature</th>
                    <th className="text-left p-2">PlanToCode</th>
                    <th className="text-left p-2">Aider</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Planning Approach</td>
                    <td className="p-2">Generate & review plans before execution</td>
                    <td className="p-2">Direct agent execution</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">File Discovery</td>
                    <td className="p-2">AI-powered dependency mapping</td>
                    <td className="p-2">Git-based file tracking</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Session Persistence</td>
                    <td className="p-2">SQLite with hot reload</td>
                    <td className="p-2">Chat history only</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Multi-Model Support</td>
                    <td className="p-2">Claude, GPT-4, multiple providers</td>
                    <td className="p-2">OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, OpenRouter (many providers), and local models (Ollama/OpenAI‑compatible)</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">Execution Safety</td>
                    <td className="p-2">Plan review before changes</td>
                    <td className="p-2">Direct file modifications</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Key Pain Points Solved</h2>

          
          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Aider makes changes directly without review</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Generate plans first, review before execution
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: No architectural context for file selection</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> AI-powered dependency mapping finds related files
            </p>
          </GlassCard>

          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: Lost context between sessions</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> Persistent sessions with full context restoration
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Comparison Workflow</h2>

          <GlassCard className="my-6">
            <ol className="space-y-3">
              <li><strong>1. Compare planning vs direct execution</strong></li>
              <li><strong>2. Show file discovery advantages</strong></li>
              <li><strong>3. Demonstrate session persistence</strong></li>
              <li><strong>4. Highlight safety features</strong></li>
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
              <h3 className="text-xl font-semibold mb-4">Use Aider When:</h3>
              <ul className="space-y-2">
                <li>• Need immediate code generation</li>
                <li>• Working on smaller projects</li>
                <li>• Comfortable with direct execution</li>
                <li>• Prefer integrated development environment</li>
              </ul>
            </GlassCard>
          </div>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Try Plan-First Development</h3>
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
