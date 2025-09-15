// Page review metadata (internal use)
// lastReviewed: 2025-09-12
// confidence: High
// reviewFrequency: 90d

import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import type { HowTo, FAQPage } from 'schema-dts';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Claude Code Plan Mode — Safe, Read-Only Planning (Keyboard: Shift+Tab)',
  description: 'Learn Claude Code\'s Plan Mode: analyze your repo safely, draft an implementation plan, and switch to execution with confidence. Keyboard shortcut included.',
  keywords: [
    'claude code plan mode',
    'claude plan mode',
    'shift tab',
    'claude plan mode',
    'read only planning',
    'claude code keyboard shortcuts',
    'implementation planning',
    'safe ai coding',
    'claude code permissions',
    'vibe manager planning'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/claude-code-plan-mode',
  },
  openGraph: {
    title: 'Claude Code Plan Mode — Safe, Read-Only Planning (Shift+Tab)',
    description: 'Master Claude Code\'s Plan Mode for safe, read-only analysis and implementation planning. Use Shift+Tab to toggle permissions.',
    url: 'https://www.vibemanager.app/docs/claude-code-plan-mode',
    type: 'article',
    images: [{
      url: cdnUrl('/images/og-claude-plan-mode.png'),
      width: 1200,
      height: 630,
      alt: 'Claude Code Plan Mode Guide with Keyboard Shortcuts',
    }],
  },
};

const howToJsonLd: HowTo = {
  '@type': 'HowTo',
  name: 'How to Use Claude Code Plan Mode',
  description: 'Learn to use Claude Code\'s Plan Mode for safe, read-only planning before code execution.',
  totalTime: 'PT5M',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Enable Plan Mode',
      text: 'Press Shift+Tab to toggle Claude Code into Plan Mode for read-only analysis',
    },
    {
      '@type': 'HowToStep',
      name: 'Analyze Your Repository',
      text: 'Claude Code analyzes your codebase without making any modifications',
    },
    {
      '@type': 'HowToStep',
      name: 'Review Implementation Plan',
      text: 'Review the generated plan and provide feedback before any code changes',
    },
    {
      '@type': 'HowToStep',
      name: 'Approve and Execute',
      text: 'Use Shift+Tab to switch to execution mode and implement the plan',
    }
  ]
};

const faqJsonLd: FAQPage = {
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What\'s the keyboard shortcut for Plan Mode?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Shift+Tab toggles permission modes in Claude Code, switching between Plan Mode (read-only) and execution mode.'
      }
    },
    {
      '@type': 'Question',
      name: 'Can I have different models for planning vs implementation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Plan Mode is optimized for planning phase and you can switch to your preferred execution model for implementation.'
      }
    },
    {
      '@type': 'Question',
      name: 'Will Claude edit files in Plan Mode?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No—Plan Mode is read-only until you approve the plan and switch to execution mode.'
      }
    }
  ]
};

export default function ClaudeCodePlanModePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      howToJsonLd,
      faqJsonLd
    ]
  };

  return (
    <>
      <StructuredData data={structuredData} />
      
      <DocsArticle
        title="Claude Code Plan Mode: Think First, Then Ship"
        description="Master Claude Code's Plan Mode for safe repository analysis and implementation planning. Use Shift+Tab keyboard shortcut to toggle between read-only planning and execution modes."
        date="2025-09-12"
        readTime="8 min"
        category="Planning Guide"
      >
        {/* Hero Section */}
        <GlassCard className="p-8 mb-12 bg-gradient-to-br from-primary/5 to-cyan/5">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Safe, Read-Only Planning Mode</h2>
            <p className="text-lg mb-6 text-muted-foreground leading-relaxed">
              Use <kbd className="bg-primary/10 text-primary px-2 py-1 rounded font-mono text-sm">Shift+Tab</kbd> to 
              enable Claude Code's Plan Mode. Analyze your repository safely in read-only mode, 
              draft comprehensive implementation plans, and get approval before any code changes (execution requires approval).
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <code className="bg-slate-900 dark:bg-slate-950 text-emerald-400 px-4 py-2 rounded-lg font-mono text-sm">
                Shift+Tab → Plan Mode (Read-Only)
              </code>
              <code className="bg-slate-900 dark:bg-slate-950 text-cyan-400 px-4 py-2 rounded-lg font-mono text-sm">
                /permissions → View Settings
              </code>
            </div>
          </div>
        </GlassCard>

        <p className="text-base text-muted-foreground leading-relaxed mb-4">
          Claude Code's Plan Mode revolutionizes AI-assisted development by separating planning from execution. 
          Think of it as a safety mechanism that lets Claude analyze your entire repository, understand complex 
          requirements, and draft detailed implementation strategies—all without touching a single file until you're ready.
        </p>

        {/* What Plan Mode Does */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">What Plan Mode Does</h2>

        <GlassCard className="p-6 mb-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Read-Only Analysis</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span>Explores your entire codebase safely</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span>Maps dependencies and architecture</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span>Identifies relevant files and patterns</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-500">✓</span>
                  <span>Understands existing conventions</span>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">OpusPlan Pairing</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2 text-blue-500">⚡</span>
                  <span>Optimized for deep analysis and planning</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-blue-500">⚡</span>
                  <span>Generates comprehensive implementation strategies</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-blue-500">⚡</span>
                  <span>Provides detailed step-by-step plans</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-blue-500">⚡</span>
                  <span>Requires explicit approval before execution</span>
                </li>
              </ul>
            </div>
          </div>
        </GlassCard>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 mb-8">
          <h4 className="font-semibold mb-2 text-amber-600 dark:text-amber-400">🛡️ Safety First</h4>
          <p className="text-sm text-muted-foreground">
            Plan Mode is completely read-only. Claude Code cannot modify, create, or delete any files while in 
            Planning (read-only) mode. All changes require switching modes using Shift+Tab before execution.
          </p>
        </div>

        {/* How to Enable Plan Mode */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">How to Enable Plan Mode</h2>

        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Keyboard Shortcut Method</h3>
          <p className="mb-4">The fastest way to toggle between planning and execution modes:</p>
          
          <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-200">Press:</span>
              <kbd className="bg-primary/20 text-primary px-4 py-2 rounded-lg font-mono text-lg font-bold">
                Shift + Tab
              </kbd>
            </div>
            <div className="text-sm text-slate-200 space-y-2">
              <div>• <span className="text-green-400">Plan Mode:</span> Read-only analysis and planning</div>
              <div>• <span className="text-cyan-400">Execution Mode:</span> Can modify files and implement plans</div>
              <div>• Toggle instantly between modes as needed</div>
            </div>
          </div>

          <h4 className="text-lg font-semibold mb-3">Alternative Commands</h4>
          <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 mb-4">
            <code className="text-emerald-400 font-mono text-sm">{`# Enable Plan Mode (read-only) explicitly
claude --permission-mode plan

# Check current mode
/permissions

# Toggle between modes
# Shift+Tab during session`}</code>
          </pre>
        </GlassCard>

        {/* Best Practices */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Best Practices</h2>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-4 text-primary">Effective Prompting</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start">
                <span className="mr-2">💡</span>
                <span><strong>Be specific:</strong> "Add user authentication with JWT tokens" vs "Add auth"</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">💡</span>
                <span><strong>Include context:</strong> Mention existing patterns, frameworks, or constraints</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">💡</span>
                <span><strong>Ask for alternatives:</strong> "Show me 2-3 different approaches"</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">💡</span>
                <span><strong>Request explanations:</strong> "Explain why this approach is recommended"</span>
              </li>
            </ul>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-4 text-primary">PR Descriptions</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start">
                <span className="mr-2">📝</span>
                <span><strong>Export plans:</strong> Plan Mode generates excellent PR descriptions</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📝</span>
                <span><strong>Include rationale:</strong> Plans explain the "why" behind changes</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📝</span>
                <span><strong>List affected files:</strong> Plans map all impacted components</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">📝</span>
                <span><strong>Testing strategy:</strong> Plans include testing recommendations</span>
              </li>
            </ul>
          </GlassCard>
        </div>

        {/* Using Vibe Manager with Plan Mode */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Using Vibe Manager with Plan Mode</h2>

        <GlassCard className="p-6 mb-8">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">🎯</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Multi-Model Plans</h4>
              <p className="text-sm text-muted-foreground">
                Vibe Manager coordinates multiple AI models for comprehensive planning strategies
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">🔍</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Smart File Lists</h4>
              <p className="text-sm text-muted-foreground">
                AI-powered file discovery identifies relevant code automatically
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">⚡</span>
              </div>
              <h4 className="font-semibold text-foreground mb-2">Seamless Handoff</h4>
              <p className="text-sm text-muted-foreground">
                Plans generated in Vibe Manager integrate perfectly with Claude Code execution
              </p>
            </div>
          </div>
        </GlassCard>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 mb-8">
          <h4 className="font-semibold mb-3 text-blue-600 dark:text-blue-400">🔗 Perfect Integration</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Vibe Manager's multi-model planning works seamlessly with Claude Code's Plan Mode. Generate 
            comprehensive implementation strategies using multiple AI providers, then hand off to Claude Code 
            for precise execution.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">Voice Dictation</span>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">Screen Recording</span>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">File Discovery</span>
            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs">Context Curation</span>
          </div>
        </div>

        {/* Code Examples */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Example Workflows</h2>

        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Typical Planning Session</h3>
          <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 text-sm">
            <code className="text-slate-200">{`# 1. Enable Plan Mode
`}</code>
            <code className="text-green-400">{`Shift+Tab`}</code>
            <code className="text-slate-200">{`  # Toggle to Plan Mode

# 2. Analyze and Plan
`}</code>
            <code className="text-cyan-400">{`"Add user authentication with email/password and JWT tokens,
following the existing patterns in the user service"`}</code>
            <code className="text-slate-200">{`

# 3. Review Generated Plan
# Claude analyzes codebase and generates comprehensive plan

# 4. Switch to Execution Mode
`}</code>
            <code className="text-yellow-400">{`Shift+Tab`}</code>
            <code className="text-slate-200">{`  # Toggle to execution mode
`}</code>
            <code className="text-yellow-400">{`# Proceed with implementation`}</code>
          </pre>
        </GlassCard>

        {/* FAQ Section */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Frequently Asked Questions</h2>

        <div className="space-y-4 mb-12">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">What's the keyboard shortcut for Plan Mode?</h3>
            <p className="text-muted-foreground">
              <kbd className="bg-primary/10 text-primary px-2 py-1 rounded font-mono text-sm">Shift+Tab</kbd> toggles 
              permission modes in Claude Code, switching between Plan Mode (read-only) and execution mode.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Can I have different models for planning vs implementation?</h3>
            <p className="text-muted-foreground">
              Yes, Plan Mode is optimized for the planning phase and you can switch to your preferred execution model for implementation. This gives you 
              the best of both worlds—strategic planning and efficient execution.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Will Claude edit files in Plan Mode?</h3>
            <p className="text-muted-foreground">
              No—Plan Mode is read-only until you approve the plan and switch to execution mode. This ensures 
              complete safety while Claude analyzes your repository and drafts implementation strategies.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">How do I switch back to execution mode?</h3>
            <p className="text-muted-foreground">
              Press <kbd className="bg-primary/10 text-primary px-2 py-1 rounded font-mono text-sm">Shift+Tab</kbd> again 
              to toggle back to execution mode, or use <code className="bg-primary/10 text-primary px-2 py-1 rounded">/permissions</code> 
              to view current permission settings.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Can I use Plan Mode with existing projects?</h3>
            <p className="text-muted-foreground">
              Absolutely! Plan Mode works with any existing codebase. Claude will analyze your current architecture, 
              understand existing patterns, and generate plans that fit seamlessly with your established conventions.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Does Plan Mode work with all programming languages?</h3>
            <p className="text-muted-foreground">
              Yes, Claude Code's Plan Mode supports all major programming languages and frameworks. Plan Mode is particularly effective at understanding complex polyglot codebases and cross-language dependencies.
            </p>
          </GlassCard>
        </div>

        {/* CTA Section */}
        <GlassCard className="p-8 text-center bg-gradient-to-br from-primary/5 to-cyan/5">
          <h3 className="text-2xl font-bold text-foreground mt-8 mb-4">Ready to Plan Like a Pro?</h3>
          <p className="text-lg mb-6 text-muted-foreground leading-relaxed">
            Combine Claude Code's Plan Mode with Vibe Manager's multi-model planning for the ultimate 
            AI-assisted development workflow. Think first, then ship with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
            <PlatformDownloadSection 
              location="claude_code_plan_mode"
              redirectToDownloadPage={false}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Use <kbd className="bg-primary/10 text-primary px-2 py-1 rounded font-mono">Shift+Tab</kbd> to get started with Plan Mode today
          </p>
        </GlassCard>
      </DocsArticle>
    </>
  );
}