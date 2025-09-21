import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import type { HowTo, FAQPage } from 'schema-dts';
import { cdnUrl } from '@/lib/cdn';
import TechnicalAccuracy from '@/components/docs/TechnicalAccuracy';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Codex CLI Read-Only Mode - Plan Safely Before Edits',
  description: 'Switch Codex CLI to Read-Only with /approvals to plan before making changes. Learn the workflow and combine with Vibe Manager plans.',
  keywords: [
    'codex cli plan mode',
    'codex cli read only',
    'codex approvals command',
    '/approvals codex',
    'codex cli approval modes',
    'codex planning mode',
    'codex read only mode',
    'vibe manager codex',
    'codex cli safety',
    'codex plan before edit',
    'codex audit mode',
    'codex onboarding'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/codex-cli-plan-mode',
  },
  openGraph: {
    title: 'Codex CLI Read-Only Mode - Plan Safely Before Edits',
    description: 'Switch Codex CLI to Read-Only with /approvals to plan before making changes. Learn the workflow and combine with Vibe Manager plans.',
    url: 'https://www.vibemanager.app/docs/codex-cli-plan-mode',
    type: 'article',
    images: [{
      url: cdnUrl('/images/og-codex-plan-mode.png'),
      width: 1200,
      height: 630,
      alt: 'Codex CLI Read-Only Mode Guide',
    }],
  },
};

const howToJsonLd: HowTo = {
  '@type': 'HowTo',
  name: 'How to Use Codex CLI Read-Only Mode for Safe Planning',
  description: 'Complete guide to enabling Read-Only approval mode in Codex CLI using /approvals command for planning before making changes.',
  totalTime: 'PT5M',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Switch to Read-Only Mode',
      text: 'Type /approvals in Codex CLI and select Read-Only mode to prevent automatic changes',
    },
    {
      '@type': 'HowToStep',
      name: 'Request Analysis or Planning',
      text: 'Ask Codex to analyze code, suggest improvements, or create implementation plans without making edits',
    },
    {
      '@type': 'HowToStep',
      name: 'Review Plans in Vibe Manager',
      text: 'Copy Codex output to Vibe Manager for multi-model planning and enhanced context',
    },
    {
      '@type': 'HowToStep',
      name: 'Switch to Full Access When Ready',
      text: 'Use /approvals to switch back to Full Access mode when ready to implement changes',
    }
  ]
};

const faqJsonLd: FAQPage = {
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Codex CLI Read-Only mode?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Read-Only mode in Codex CLI prevents the AI from making any changes to your files. It can only analyze code, suggest improvements, and create plans without executing them. This mode is perfect for planning, auditing, and onboarding scenarios.'
      }
    },
    {
      '@type': 'Question',
      name: 'How do I enable Read-Only mode in Codex CLI?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Type /approvals in your Codex CLI session and select "Read-Only" from the approval modes. This will switch Codex to Read-Only mode where it cannot make file changes or execute commands.'
      }
    },
    {
      '@type': 'Question',
      name: 'What are the three approval modes in Codex CLI?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Codex CLI has three approval modes: Auto (automatic execution), Read-Only (analysis only, no changes), and Full Access (manual approval for each change). Use /approvals command to switch between modes.'
      }
    },
    {
      '@type': 'Question',
      name: 'How does Vibe Manager enhance Codex CLI planning?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Vibe Manager provides multi-model planning that complements Codex CLI\'s Read-Only mode. You can copy plans from Codex into Vibe Manager for enhanced analysis across multiple AI models, then use the refined plans back in Codex for implementation.'
      }
    }
  ]
};

export default function CodexCLIPlanModePage() {
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
        title="Codex CLI: Read-Only for Planning"
        description="Learn how to use Codex CLI's Read-Only approval mode for safe planning and auditing before making changes"
        date="2025-09-12"
        readTime="8 min"
        category="Planning Guide"
      >
        {/* Quick Start Section */}
        <GlassCard className="p-6 mb-12">
          <h2 className="text-2xl font-bold mb-6 text-foreground">🎯 Quick Start: Read-Only Planning</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">1. Switch to Read-Only</h3>
              <p className="text-sm mb-4 text-muted-foreground">
                Enable safe planning mode in Codex CLI:
              </p>
              <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200">
                <code className="text-emerald-400 font-mono text-sm"># In Codex CLI session{'\n'}/approvals{'\n\n'}# Select: Read-Only{'\n'}# Now Codex can only analyze, not edit</code>
              </pre>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">2. Enhance with Vibe Manager</h3>
              <p className="text-base mb-4 text-muted-foreground leading-relaxed">
                Combine Read-Only mode with multi-model planning:
              </p>
              <PlatformDownloadSection 
                location="docs_codex_plan_mode"
                redirectToDownloadPage={true}
              />
            </div>
          </div>
        </GlassCard>

        {/* Main Content */}
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          Codex CLI's approval modes provide different levels of control over code changes. This guide shows you how to use the Suggest, Auto-Edit, and Full-Auto modes effectively, emphasizing the "/approvals" usage for safe planning and analysis 
          without the risk of unwanted changes. Enhance it with Vibe Manager's multi-model planning capabilities.
        </p>

        <h2 className="text-2xl font-bold mb-6">Understanding Codex CLI Approval Modes</h2>
        
        <p className="mb-6">
          Codex CLI offers three distinct approval modes: suggest, auto-edit, and full-auto. These modes control how the AI interacts with your codebase. 
          Use "/approvals" to switch between modes, including a safe Read-Only mode for planning and analysis before making changes.
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Full-Auto Mode</h4>
            <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 text-sm mb-3">
              <code className="text-emerald-400">/approvals → full-auto</code>
            </pre>
            <p className="text-sm text-muted-foreground mb-4">
              Codex executes changes automatically without asking for permission. Fast but requires high trust.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>✅ Fastest workflow</li>
              <li>✅ Best for trusted environments</li>
              <li>⚠️ No safety net</li>
            </ul>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Suggest Mode</h4>
            <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 text-sm mb-3">
              <code className="text-emerald-400">/approvals → suggest</code>
            </pre>
            <p className="text-sm text-muted-foreground mb-4">
              AI reviews code and suggests changes without making edits. Perfect for learning and planning.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>✅ Complete safety</li>
              <li>✅ Great for planning</li>
              <li>✅ Ideal for audits</li>
            </ul>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Auto-Edit Mode</h4>
            <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 text-sm mb-3">
              <code className="text-emerald-400">/approvals → auto-edit</code>
            </pre>
            <p className="text-sm text-muted-foreground mb-4">
              Makes edits with your approval. Shows diffs before applying changes. Recommended for most users.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>✅ User control</li>
              <li>✅ Review each change</li>
              <li>⏱️ Slower workflow</li>
            </ul>
          </GlassCard>
        </div>

        <h2 className="text-2xl font-bold mb-6">When to Use Read-Only Mode</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Perfect Scenarios for Read-Only</h3>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-semibold mb-4 text-primary">Planning & Architecture</h4>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2">🎯</span>
                  <div>
                    <strong>Initial project planning:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Get comprehensive implementation strategies without changes</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🏗️</span>
                  <div>
                    <strong>Architecture analysis:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Understand code structure and identify improvement opportunities</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">📋</span>
                  <div>
                    <strong>Refactoring plans:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Create detailed refactoring strategies before implementation</p>
                  </div>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4 text-primary">Auditing & Learning</h4>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2">🔍</span>
                  <div>
                    <strong>Code audits:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Analyze codebases safely without modification risk</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🎓</span>
                  <div>
                    <strong>Team onboarding:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Help new developers understand code without change anxiety</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🔒</span>
                  <div>
                    <strong>Production analysis:</strong>
                    <p className="text-sm text-muted-foreground mt-1">Safely analyze production code during incidents</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Command Quickstart</h2>

        <p className="mb-6">
          The <code className="text-slate-200">/approvals</code> command is your gateway to controlling Codex CLI's behavior. Here's how to use it effectively:
        </p>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Basic Commands</h3>
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-2">Switch to Read-Only Mode</h4>
              <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 mb-2">
                <code className="text-emerald-400 font-mono text-sm"># Switch to Read-Only{'\n'}/approvals{'\n\n'}# Select option: Read-Only{'\n'}# Codex will confirm the mode change</code>
              </pre>
              <p className="text-sm text-muted-foreground">
                Now Codex can analyze, suggest, and plan but cannot make any changes to your files.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Typical Read-Only Workflow</h4>
              <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 mb-2">
                <code className="text-emerald-400 font-mono text-sm"># 1. Analyze the current codebase{'\n'}"Analyze this React component for performance issues"{'\n\n'}# 2. Get implementation suggestions{'\n'}"Create a plan to add dark mode to this app"{'\n\n'}# 3. Review architecture{'\n'}"Explain the data flow in this application"</code>
              </pre>
              <p className="text-sm text-muted-foreground">
                Use natural language to request analysis, planning, or explanations.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Switch Back for Implementation</h4>
              <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-3 overflow-x-auto text-slate-200 mb-2">
                <code className="text-emerald-400 font-mono text-sm"># When ready to implement{'\n'}/approvals{'\n\n'}# Select: Full Access or Auto{'\n'}# Then proceed with implementation</code>
              </pre>
              <p className="text-sm text-muted-foreground">
                Seamlessly transition from planning to execution when you're ready.
              </p>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Vibe Manager + Codex Integration</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">The Ultimate Planning Workflow</h3>
          <ol className="space-y-4">
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">1.</span>
              <div>
                <strong>Start with Read-Only Codex:</strong>
                <p className="text-sm text-muted-foreground mt-1">Use /approvals to switch to Read-Only mode and get initial analysis from o3/GPT-5</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">2.</span>
              <div>
                <strong>Capture Context in Vibe Manager:</strong>
                <p className="text-sm text-muted-foreground mt-1">Copy Codex output to Vibe Manager and add voice descriptions or screen recordings</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">3.</span>
              <div>
                <strong>Generate Multi-Model Plans:</strong>
                <p className="text-sm text-muted-foreground mt-1">Get plans from Claude 4, Gemini 2.5, GPT-5, and merge the best approaches</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">4.</span>
              <div>
                <strong>Execute with Full Access:</strong>
                <p className="text-sm text-muted-foreground mt-1">Return to Codex with /approvals Full Access mode and implement the refined plan</p>
              </div>
            </li>
          </ol>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">FAQ: Approval Modes & Planning</h2>

        <div className="space-y-6 mb-12">
          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3">What happens when I switch to Read-Only mode?</h4>
            <p className="text-muted-foreground">
              Codex CLI disables all file modification and command execution capabilities. The AI can still read files, 
              analyze code, generate suggestions, and create implementation plans, but cannot make any changes to your 
              system. This mode is completely safe for exploring unfamiliar codebases or getting analysis in production 
              environments.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3">Can I switch approval modes mid-conversation?</h4>
            <p className="text-muted-foreground">
              Yes! You can use the <code className="text-slate-200">/approvals</code> command at any time during a Codex CLI session to change modes. 
              This flexibility allows you to start with Read-Only for planning, then switch to Full Access or Auto mode 
              when you're ready to implement changes. The conversation context is preserved across mode switches.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibent mb-3">How does Read-Only mode work with MCP servers?</h4>
            <p className="text-muted-foreground">
              Read-Only mode affects Codex CLI's core behavior but may interact differently with Model Context Protocol 
              servers. Some MCP servers might have their own permission systems. Always test Read-Only mode with your 
              specific MCP setup to understand the interaction boundaries.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3">What's the difference between Read-Only and just asking for suggestions?</h4>
            <p className="text-muted-foreground">
              Read-Only mode is a system-level restriction that prevents any changes regardless of the request. Even if you 
              accidentally ask Codex to "implement this fix," it cannot do so in Read-Only mode. Regular suggestion mode 
              still allows implementation if you explicitly request it. Read-Only provides an additional safety layer.
            </p>
          </GlassCard>
        </div>

        <h2 className="text-2xl font-bold mb-6">Best Practices for Read-Only Planning</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Maximizing Planning Effectiveness</h3>
          <ul className="space-y-4">
            <li>
              <strong>🎯 Be specific with planning requests:</strong>
              <p className="text-sm text-muted-foreground mt-1">Instead of "improve this code," ask "create a plan to optimize performance and add error handling"</p>
            </li>
            <li>
              <strong>📋 Request step-by-step breakdowns:</strong>
              <p className="text-sm text-muted-foreground mt-1">Ask for implementation plans with specific steps, file changes, and testing strategies</p>
            </li>
            <li>
              <strong>🔍 Use for architectural analysis:</strong>
              <p className="text-sm text-muted-foreground mt-1">Get insights into design patterns, dependencies, and potential improvement areas</p>
            </li>
            <li>
              <strong>⚡ Combine with Vibe Manager:</strong>
              <p className="text-sm text-muted-foreground mt-1">Copy Read-Only output to Vibe Manager for multi-model enhancement and voice annotation</p>
            </li>
            <li>
              <strong>📝 Document decisions:</strong>
              <p className="text-sm text-muted-foreground mt-1">Use Read-Only mode to generate documentation and architectural decision records</p>
            </li>
          </ul>
        </GlassCard>

        <TechnicalAccuracy />

        <h2 className="text-2xl font-bold mb-6">Next Steps</h2>

        <p className="mb-6">
          Now that you understand Codex CLI's Read-Only mode and how to enhance it with Vibe Manager, you're ready to 
          plan with confidence. Whether you're auditing legacy code, onboarding new team members, or architecting complex 
          features, this safe planning approach ensures you make informed decisions before implementation.
        </p>

        <div className="text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/docs/openai-codex-cli">
              Learn More About Codex CLI
            </Link>
          </Button>
        </div>
      </DocsArticle>
    </>
  );
}