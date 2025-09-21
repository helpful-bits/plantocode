import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { StructuredData } from '@/components/seo/StructuredData';
import { 
  Brain, 
  Play, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle, 
  Zap, 
  Target, 
  Users, 
  Code2, 
  Search,
  FileSearch,
  RefreshCw
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cline Plan & Act - Plan First, Implement After Approval',
  description: 'Cline\'s Plan mode analyzes your repo with no file changes. Switch to Act to implement safely. Full workflow guide & tips.',
  keywords: [
    'cline plan mode',
    'cline act mode',
    'cline workflow',
    'AI coding assistant',
    'plan first development',
    'safe AI implementation',
    'code planning',
    'AI development workflow',
    'vibe manager cline',
    'multi-model planning'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/cline-plan-mode'
  },
  openGraph: {
    title: 'Cline Plan & Act - Plan First, Implement After Approval',
    description: 'Cline\'s Plan mode analyzes your repo with no file changes. Switch to Act to implement safely. Full workflow guide & tips.',
    url: 'https://www.vibemanager.app/docs/cline-plan-mode',
    type: 'article'
  }
};

export default function ClinePlanModePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://www.vibemanager.app'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Cline Plan Mode',
            item: 'https://www.vibemanager.app/cline-plan-mode'
          }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is the difference between Plan and Act modes in Cline?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Plan mode analyzes your codebase and creates implementation strategies without making any file changes. Act mode executes the agreed-upon plan by writing, editing, and modifying files. This separation ensures you can review and approve strategies before implementation.'
            }
          },
          {
            '@type': 'Question',
            name: 'How do I switch from Plan to Act mode in Cline?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'After reviewing a plan in Plan mode, you can switch to Act mode by explicitly telling Cline to "implement the plan" or "switch to Act mode". Cline will then begin executing the approved strategy with file modifications.'
            }
          },
          {
            '@type': 'Question',
            name: 'Can I use Plan mode multiple times before implementing?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes! You can iterate through multiple Plan cycles to refine your approach. This is especially useful for complex features where you want to explore different architectural approaches before committing to implementation.'
            }
          },
          {
            '@type': 'Question',
            name: 'How does Vibe Manager enhance Cline\'s Plan mode?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Vibe Manager adds multi-model planning capabilities, allowing you to get different AI perspectives on the same plan. It also provides intelligent context curation to ensure Cline has the most relevant codebase information for accurate planning.'
            }
          }
        ]
      },
      {
        '@type': 'HowTo',
        name: 'How to Use Cline Plan & Act Workflow',
        description: 'Step-by-step guide to using Cline\'s Plan and Act modes for safe AI-assisted development',
        step: [
          {
            '@type': 'HowToStep',
            name: 'Start with Plan Mode',
            text: 'Begin by asking Cline to analyze your codebase and create an implementation plan without making changes.'
          },
          {
            '@type': 'HowToStep',
            name: 'Review the Strategy',
            text: 'Carefully review the proposed implementation strategy, architecture decisions, and file modifications.'
          },
          {
            '@type': 'HowToStep',
            name: 'Refine if Needed',
            text: 'If the plan needs adjustments, stay in Plan mode and iterate until you have an approved strategy.'
          },
          {
            '@type': 'HowToStep',
            name: 'Switch to Act Mode',
            text: 'Once satisfied with the plan, explicitly tell Cline to switch to Act mode and begin implementation.'
          },
          {
            '@type': 'HowToStep',
            name: 'Monitor Implementation',
            text: 'Watch as Cline executes the plan, making the agreed-upon file changes and modifications.'
          }
        ]
      }
    ]
  };

  return (
    <>
      <StructuredData data={structuredData} />
      
      <DocsArticle
        title="Cline Plan Mode: Think First. Act with Confidence."
        description="Cline's Plan mode analyzes your repo with no file changes. Switch to Act to implement safely. Full workflow guide & tips."
        date="2024-09-12"
        readTime="8 min"
        category="Workflow"
      >
        {/* Lead Paragraph */}
        <div className="text-lg text-foreground/90 leading-relaxed mb-8">
          Cline's explicit Plan & Act dual-mode design separates strategy from execution. 
          <strong className="text-foreground"> Plan mode analyzes your codebase and creates implementation strategies without touching files</strong>. 
          Act mode executes the approved plan with confidence. This workflow prevents costly mistakes and ensures you maintain full control over your development process.
        </div>

        {/* Visual Workflow Diagram */}
        <div className="my-12">
          <GlassCard className="p-8">
            <h3 className="text-2xl font-bold mb-6 text-center text-foreground">Plan → Act Workflow</h3>
            <div className="flex flex-col lg:flex-row items-center justify-center gap-8">
              {/* Plan Phase */}
              <div className="flex flex-col items-center text-center space-y-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">Plan Mode</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <FileSearch className="w-4 h-4" />
                    <span>Analyze codebase</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    <span>Research patterns</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Create strategy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>No file changes</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center">
                <ArrowRight className="w-8 h-8 text-primary" />
              </div>

              {/* Review Phase */}
              <div className="flex flex-col items-center text-center space-y-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <Users className="w-8 h-8 text-yellow-500" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">Review & Approve</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Review strategy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    <span>Iterate if needed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>Catch issues early</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Approve plan</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center">
                <ArrowRight className="w-8 h-8 text-primary" />
              </div>

              {/* Act Phase */}
              <div className="flex flex-col items-center text-center space-y-4 flex-1">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Play className="w-8 h-8 text-green-500" />
                </div>
                <h4 className="text-lg font-semibold text-foreground">Act Mode</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4" />
                    <span>Execute plan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Write files</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>Fast implementation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Predictable results</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* How Plan Mode Works */}
        <h2>How Plan Mode Works</h2>
        <p>
          Plan mode is Cline's analytical phase where it <strong>reads your codebase extensively but makes zero file modifications</strong>. 
          This separation is crucial for maintaining control over your development process.
        </p>

        <div className="grid md:grid-cols-2 gap-6 my-8">
          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-primary" />
              Deep Codebase Analysis
            </h4>
            <p className="text-muted-foreground text-sm">
              Analyzes existing patterns, architecture decisions, and coding conventions to ensure 
              the proposed solution fits seamlessly into your current codebase structure.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Strategic Planning
            </h4>
            <p className="text-muted-foreground text-sm">
              Creates detailed implementation strategies including file modifications, 
              new components needed, and integration points with existing code.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Research Phase
            </h4>
            <p className="text-muted-foreground text-sm">
              Identifies dependencies, potential conflicts, and edge cases that need 
              to be addressed during implementation without making any changes.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Safe Strategy First
            </h4>
            <p className="text-muted-foreground text-sm">
              Ensures you can review and approve the complete implementation strategy 
              before any files are modified, preventing costly mistakes.
            </p>
          </GlassCard>
        </div>

        {/* Switching to Act */}
        <h2>Switching to Act Mode</h2>
        <p>
          Once you've reviewed and approved the plan, <strong>explicitly tell Cline to switch to Act mode</strong>. 
          This transition signals that you're ready for implementation and file modifications to begin.
        </p>

        <GlassCard className="my-8 bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-1">
              <Play className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-foreground mb-2">Example Transition Commands</h4>
              <div className="space-y-2 text-sm">
                <code className="block bg-slate-900 dark:bg-slate-950 text-green-400 px-3 py-2 rounded">
                  "Great plan! Please switch to Act mode and implement this."
                </code>
                <code className="block bg-slate-900 dark:bg-slate-950 text-green-400 px-3 py-2 rounded">
                  "I approve this strategy. Begin implementation in Act mode."
                </code>
                <code className="block bg-slate-900 dark:bg-slate-950 text-green-400 px-3 py-2 rounded">
                  "Execute the plan - switch to Act mode and make the changes."
                </code>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Best Practices */}
        <h2>Best Practices: Loop Plan ↔ Act for Complex Tasks</h2>
        <p>
          For complex features, <strong>don't try to plan everything upfront</strong>. Instead, use iterative Plan ↔ Act cycles 
          to build incrementally with confidence at each step.
        </p>

        <div className="space-y-6 my-8">
          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Iterative Development
            </h4>
            <p className="text-muted-foreground mb-3">
              Break large features into smaller, manageable pieces. Plan one piece, implement it, then plan the next.
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>• Plan: "Add user authentication foundation"</div>
              <div>• Act: Implement basic auth setup</div>
              <div>• Plan: "Add protected routes and middleware"</div>
              <div>• Act: Implement route protection</div>
              <div>• Plan: "Add user profile management"</div>
            </div>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Plan Refinement
            </h4>
            <p className="text-muted-foreground mb-3">
              If a plan doesn't feel right, stay in Plan mode and iterate. It's much cheaper to refine strategy than fix implementation.
            </p>
            <div className="text-sm text-muted-foreground">
              Ask for alternative approaches: "Can you explore a different architectural approach for this component?"
            </div>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Scope Control
            </h4>
            <p className="text-muted-foreground">
              Keep each Plan-Act cycle focused on a single, well-defined outcome. This prevents scope creep and 
              maintains predictable results throughout your development process.
            </p>
          </GlassCard>
        </div>

        {/* Vibe Manager + Cline Integration */}
        <h2>Vibe Manager + Cline Integration</h2>
        <p>
          Vibe Manager supercharges Cline's Plan mode with <strong>multi-model planning</strong> and 
          <strong>intelligent context curation</strong>. Get different AI perspectives on the same plan 
          and ensure Cline has the most relevant codebase context for accurate planning.
        </p>

        <div className="grid md:grid-cols-2 gap-6 my-8">
          <GlassCard className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              Multi-Model Planning
            </h4>
            <p className="text-muted-foreground text-sm mb-4">
              Run the same planning request through different AI models to get diverse perspectives 
              and identify potential blind spots in your implementation strategy.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Claude Sonnet 4 for detailed analysis</li>
              <li>• GPT-5 for alternative approaches</li>
              <li>• Compare and synthesize insights</li>
            </ul>
          </GlassCard>

          <GlassCard className="bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/20">
            <h4 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-teal-500" />
              Intelligent Context Curation
            </h4>
            <p className="text-muted-foreground text-sm mb-4">
              Automatically identify and include the most relevant files, patterns, and dependencies 
              for Cline's planning phase, ensuring comprehensive analysis.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Auto-detect related components</li>
              <li>• Include relevant test files</li>
              <li>• Surface architectural patterns</li>
            </ul>
          </GlassCard>
        </div>

        {/* FAQ Section */}
        <h2>Frequently Asked Questions</h2>
        
        <div className="space-y-4 my-8">
          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              What is the difference between Plan and Act modes in Cline?
            </h4>
            <p className="text-muted-foreground text-sm">
              Plan mode analyzes your codebase and creates implementation strategies without making any file changes. 
              Act mode executes the agreed-upon plan by writing, editing, and modifying files. This separation ensures 
              you can review and approve strategies before implementation.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              How do I switch from Plan to Act mode in Cline?
            </h4>
            <p className="text-muted-foreground text-sm">
              After reviewing a plan in Plan mode, you can switch to Act mode by explicitly telling Cline to 
              "implement the plan" or "switch to Act mode". Cline will then begin executing the approved strategy 
              with file modifications.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              Can I use Plan mode multiple times before implementing?
            </h4>
            <p className="text-muted-foreground text-sm">
              Yes! You can iterate through multiple Plan cycles to refine your approach. This is especially useful 
              for complex features where you want to explore different architectural approaches before committing 
              to implementation.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              How does Vibe Manager enhance Cline's Plan mode?
            </h4>
            <p className="text-muted-foreground text-sm">
              Vibe Manager adds multi-model planning capabilities, allowing you to get different AI perspectives 
              on the same plan. It also provides intelligent context curation to ensure Cline has the most relevant 
              codebase information for accurate planning.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              Should I always use Plan mode before Act mode?
            </h4>
            <p className="text-muted-foreground text-sm">
              For any non-trivial changes, yes. Plan mode prevents costly mistakes and ensures you understand 
              the full scope of changes before implementation. For simple, single-file changes, you might skip 
              directly to Act mode, but planning first is generally the safer approach.
            </p>
          </GlassCard>

          <GlassCard>
            <h4 className="text-lg font-semibold text-foreground mb-2">
              Can I go back to Plan mode after starting Act mode?
            </h4>
            <p className="text-muted-foreground text-sm">
              Yes! If you encounter unexpected complexity during implementation, you can pause Act mode and return 
              to Plan mode to reassess the strategy. This flexibility is part of what makes the Plan ↔ Act workflow 
              so powerful for complex development tasks.
            </p>
          </GlassCard>
        </div>

      </DocsArticle>
    </>
  );
}