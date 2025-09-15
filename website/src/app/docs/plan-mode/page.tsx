import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import TechnicalAccuracy from '@/components/docs/TechnicalAccuracy';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Plan Mode: Claude Code vs Cursor vs Cline vs Codex CLI - Complete Comparison 2025',
  description: 'Side-by-side comparison of plan modes and safe planning flows across leading AI coding tools—with setup steps and best practices.',
  keywords: [
    'plan mode comparison',
    'claude code plan mode',
    'cursor plan mode',
    'cline plan mode',
    'codex cli plan mode',
    'ai coding planning',
    'safe code planning',
    'implementation planning',
    'ai code review',
    'multi-step coding',
    'vibe manager planning',
    'ai coding workflow'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/plan-mode',
  },
  openGraph: {
    title: 'Plan Modes Compared: Claude Code • Cursor • Cline • Codex CLI',
    description: 'Complete comparison of plan modes across all major AI coding tools. Learn which approach works best for your workflow.',
    url: 'https://www.vibemanager.app/docs/plan-mode',
    type: 'article',
    images: [{
      url: cdnUrl('/images/og-plan-mode-comparison.png'),
      width: 1200,
      height: 630,
      alt: 'Plan Mode Comparison: AI Coding Tools',
    }],
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      headline: 'Plan Modes Compared: Claude Code • Cursor • Cline • Codex CLI',
      author: {
        '@type': 'Organization',
        name: 'Vibe Manager Team',
      },
      datePublished: '2025-09-12T00:00:00Z',
      dateModified: '2025-09-12T00:00:00Z',
      description: 'Comprehensive comparison of plan modes and safe planning flows across leading AI coding tools—with setup steps and best practices.'
    },
    {
      '@type': 'Table',
      about: 'Plan Mode Features Comparison Across AI Coding Tools',
      name: 'AI Coding Tools Plan Mode Comparison',
      description: 'Feature comparison table showing plan mode capabilities, editing behavior, and setup instructions for Claude Code, Cursor, Cline, and Codex CLI'
    }
  ]
};

export default function PlanModeComparisonPage() {
  return (
    <>
      <StructuredData data={structuredData} />
      
      <DocsArticle
        title="Plan Modes Compared: Claude Code • Cursor • Cline • Codex CLI"
        description="Complete comparison of plan modes and safe planning flows across all major AI coding tools—with setup steps and best practices."
        date="2025-09-12"
        readTime="8 min"
        category="Comparison Guide"
      >
        {/* Quick Comparison Overview */}
        <GlassCard className="p-6 mb-12">
          <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">🎯 Plan Mode Quick Reference</h2>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Plan modes let you review and approve AI-generated implementation steps before code execution. 
            This comprehensive guide compares how each major AI coding tool handles planning workflows.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <h3 className="font-semibold mb-2 text-primary">Claude Code</h3>
              <p className="text-sm text-muted-foreground">Built-in plan mode</p>
              <p className="text-xs text-muted-foreground">--permission-mode plan</p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-2 text-primary">Cursor</h3>
              <p className="text-sm text-muted-foreground">Ask/Agent modes; no official Plan Mode</p>
              <p className="text-xs text-muted-foreground">Community convention</p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-2 text-primary">Cline</h3>
              <p className="text-sm text-muted-foreground">Step-by-step approval</p>
              <p className="text-xs text-muted-foreground">Interactive prompts</p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-2 text-primary">Codex CLI</h3>
              <p className="text-sm text-muted-foreground">Multiple approval modes</p>
              <p className="text-xs text-muted-foreground">/approvals command</p>
            </div>
          </div>
        </GlassCard>

        
        <p className="text-base text-muted-foreground leading-relaxed mb-4">
          Planning before coding is essential for complex AI-assisted development. Each major AI coding tool 
          offers different approaches to safe, reviewable code generation. This guide compares their plan 
          modes, helping you choose the right tool and approach for your workflow.
        </p>

        {/* Comprehensive Comparison Table */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Complete Feature Comparison</h2>
        
        <div className="overflow-x-auto mb-12">
          <GlassCard className="p-0">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-bold text-foreground">Tool</th>
                  <th className="text-left p-4 font-bold text-foreground">Plan Mode Name</th>
                  <th className="text-left p-4 font-bold text-foreground">Edits in Plan?</th>
                  <th className="text-left p-4 font-bold text-foreground">How to Enable</th>
                  <th className="text-left p-4 font-bold text-foreground">Notable Extras</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 even:bg-muted/30">
                  <td className="p-4">
                    <div className="font-semibold text-primary">Claude Code</div>
                    <div className="text-xs text-muted-foreground">Terminal</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">Plan Mode</div>
                    <div className="text-xs text-muted-foreground">Built-in planning</div>
                  </td>
                  <td className="p-4">
                    <span className="text-red-500 font-bold">No</span>
                    <div className="text-xs text-muted-foreground">Shows plans only</div>
                  </td>
                  <td className="p-4">
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">claude --permission-mode plan</code>
                    <div className="text-xs text-muted-foreground mt-1">Shift+Tab to toggle</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">• MCP integration</div>
                    <div className="text-sm">• Permission modes</div>
                    <div className="text-sm">• Shift+Tab toggle</div>
                  </td>
                </tr>
                <tr className="border-b border-border/50 even:bg-muted/30">
                  <td className="p-4">
                    <div className="font-semibold text-primary">Cursor</div>
                    <div className="text-xs text-muted-foreground">IDE</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">Ask/Agent modes</div>
                    <div className="text-xs text-muted-foreground">No official Plan Mode</div>
                  </td>
                  <td className="p-4">
                    <span className="text-green-500 font-bold">Ask: No</span>
                    <div className="text-xs text-muted-foreground">Agent: Yes with approval</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">Switch Ask/Agent in UI</div>
                    <div className="text-xs text-muted-foreground">Community conventions</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">• Ask/Agent modes</div>
                    <div className="text-sm">• Visual diffs</div>
                    <div className="text-sm">• Community plan patterns</div>
                  </td>
                </tr>
                <tr className="border-b border-border/50 even:bg-muted/30">
                  <td className="p-4">
                    <div className="font-semibold text-primary">Cline</div>
                    <div className="text-xs text-muted-foreground">VS Code</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">Step Approval</div>
                    <div className="text-xs text-muted-foreground">Interactive mode</div>
                  </td>
                  <td className="p-4">
                    <span className="text-orange-500 font-bold">Partial</span>
                    <div className="text-xs text-muted-foreground">Step-by-step</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">Default on</div>
                    <div className="text-xs text-muted-foreground">Extension setting</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">• Tool use approval</div>
                    <div className="text-sm">• Command execution</div>
                    <div className="text-sm">• File operation control</div>
                  </td>
                </tr>
                <tr className="border-b border-border/50 even:bg-muted/30">
                  <td className="p-4">
                    <div className="font-semibold text-primary">Codex CLI</div>
                    <div className="text-xs text-muted-foreground">Terminal</div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">Approval Modes</div>
                    <div className="text-xs text-muted-foreground">suggest/auto-edit/full-auto</div>
                  </td>
                  <td className="p-4">
                    <span className="text-orange-500 font-bold">Varies</span>
                    <div className="text-xs text-muted-foreground">Depends on mode</div>
                  </td>
                  <td className="p-4">
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/approvals</code>
                    <div className="text-xs text-muted-foreground mt-1">REPL command</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">• Three approval modes</div>
                    <div className="text-sm">• Multimodal input</div>
                    <div className="text-sm">• Open source (Apache-2.0)</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </GlassCard>
        </div>

        {/* Individual Tool Sections */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Individual Tool Deep Dives</h2>

        {/* Claude Code Section */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Claude Code Plan Mode</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Claude Code's built-in plan mode provides comprehensive task breakdown without making any edits. 
            Perfect for understanding complex implementation strategies before committing to code changes.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="font-semibold mb-2">Key Features:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Complete task breakdown</li>
                <li>• Multi-file context analysis</li>
                <li>• MCP tool integration</li>
                <li>• No accidental edits</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Best For:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Complex refactoring projects</li>
                <li>• Architecture planning</li>
                <li>• Learning implementation approaches</li>
                <li>• High-stakes production code</li>
              </ul>
            </div>
          </div>
          
          <Button asChild variant="outline" size="sm">
            <Link href="/docs/claude-code-install">Claude Code Setup Guide →</Link>
          </Button>
        </GlassCard>

        {/* Cursor Section */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Cursor Ask/Agent Approach</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Cursor provides Ask (read-only) and Agent (execution) modes. Teams commonly create Custom 'Plan' modes to show proposed changes as inline diffs before application. 
            The visual approach makes it easy to understand and approve specific code modifications.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="font-semibold mb-2">Key Features:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Visual diff previews</li>
                <li>• Inline code suggestions</li>
                <li>• Tab-to-apply workflow</li>
                <li>• Multiple model options</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Best For:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Feature development</li>
                <li>• Code completion</li>
                <li>• Visual learners</li>
                <li>• Incremental changes</li>
              </ul>
            </div>
          </div>
          
          <Button asChild variant="outline" size="sm">
            <Link href="/docs/claude-code-vs-cursor">Cursor Comparison Guide →</Link>
          </Button>
        </GlassCard>

        {/* Cline Section */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Cline Step-by-Step Approval</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Cline (formerly Claude Dev) offers granular control with step-by-step approval for every action. 
            Each tool use, file operation, and command execution requires explicit user consent.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="font-semibold mb-2">Key Features:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Interactive approval prompts</li>
                <li>• Tool use transparency</li>
                <li>• Command execution control</li>
                <li>• VS Code integration</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Best For:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Security-conscious development</li>
                <li>• Learning AI workflows</li>
                <li>• Controlled automation</li>
                <li>• Team environments</li>
              </ul>
            </div>
          </div>
          
          <Button asChild variant="outline" size="sm">
            <a href="https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev" 
               target="_blank" rel="noopener noreferrer">
              Install Cline Extension →
            </a>
          </Button>
        </GlassCard>

        {/* Codex CLI Section */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Codex CLI Suggest Mode</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            OpenAI Codex CLI's suggest mode provides detailed recommendations without making changes. 
            Powered by o3 and GPT-5, it offers sophisticated analysis and multimodal understanding.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="font-semibold mb-2">Key Features:</h4>
              <ul className="space-y-1 text-sm">
                <li>• o3/GPT-5 powered analysis</li>
                <li>• Multimodal input support</li>
                <li>• MCP server integration</li>
                <li>• Detailed recommendations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Best For:</h4>
              <ul className="space-y-1 text-sm">
                <li>• Complex problem solving</li>
                <li>• Code review assistance</li>
                <li>• Architecture analysis</li>
                <li>• Performance optimization</li>
              </ul>
            </div>
          </div>
          
          <Button asChild variant="outline" size="sm">
            <Link href="/docs/openai-codex-cli">Codex CLI Setup Guide →</Link>
          </Button>
        </GlassCard>

        {/* Terminology Section */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Terminology & Vendor Labels</h2>
        
        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Planning (Read-Only) Modes Across Tools</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Different AI coding tools use different terminology for their planning and read-only modes. 
            Here's how they map across vendors:
          </p>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-3 text-foreground">Claude Code</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Plan Mode:</strong> Read-only planning</li>
                <li>• Uses --permission-mode plan</li>
                <li>• Shift+Tab to toggle</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-foreground">Cursor</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Ask:</strong> Read-only mode</li>
                <li>• <strong>Agent:</strong> Execution mode</li>
                <li>• No official Plan Mode (community convention)</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 text-foreground">Codex CLI</h4>
              <ul className="space-y-2 text-sm">
                <li>• <strong>Three modes:</strong> suggest/auto-edit/full-auto</li>
                <li>• Use /approvals command</li>
                <li>• Set via --approval-mode flag</li>
              </ul>
            </div>
          </div>
        </GlassCard>

        {/* Why Plan Mode Matters */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Why Plan Mode Matters</h2>
        
        <GlassCard className="p-6 mb-8">
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Plan modes are essential for professional AI-assisted development. They provide safety, 
            understanding, and control over complex code generation tasks.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">🛡️ Safety & Control</h3>
              <ul className="space-y-2 text-sm">
                <li>• Review before execution</li>
                <li>• Prevent unintended changes</li>
                <li>• Understand AI decisions</li>
                <li>• Maintain code quality</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">📚 Learning & Growth</h3>
              <ul className="space-y-2 text-sm">
                <li>• Study AI implementation strategies</li>
                <li>• Learn new patterns and approaches</li>
                <li>• Understand complex refactoring</li>
                <li>• Build architectural knowledge</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">🎯 Strategic Planning</h3>
              <ul className="space-y-2 text-sm">
                <li>• Break down complex tasks</li>
                <li>• Identify potential issues early</li>
                <li>• Plan multi-step implementations</li>
                <li>• Coordinate team efforts</li>
              </ul>
            </div>
          </div>
        </GlassCard>

        {/* Vibe Manager Integration */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Using Vibe Manager with Plan Modes</h2>
        
        <GlassCard className="p-6 mb-8">
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            Vibe Manager enhances every plan mode by providing superior context preparation and 
            multi-model planning capabilities. Generate comprehensive plans before executing in your preferred tool.
          </p>
          
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Enhanced Planning Workflow</h3>
          
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">1</div>
              <div>
                <h4 className="font-semibold mb-1">Capture Requirements in Vibe Manager</h4>
                <p className="text-sm text-muted-foreground">Use voice dictation or screen recording to describe complex tasks quickly and accurately.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">2</div>
              <div>
                <h4 className="font-semibold mb-1">Generate Multi-Model Plans</h4>
                <p className="text-sm text-muted-foreground">Create implementation strategies using multiple AI models and merge the best approaches.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">3</div>
              <div>
                <h4 className="font-semibold mb-1">Discover Relevant Context</h4>
                <p className="text-sm text-muted-foreground">AI-powered file discovery finds all relevant code, dependencies, and related files automatically.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">4</div>
              <div>
                <h4 className="font-semibold mb-1">Execute in Your Preferred Tool</h4>
                <p className="text-sm text-muted-foreground">Copy the comprehensive plan to Claude Code, Cursor, Cline, or Codex CLI for precise execution.</p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Ready to enhance your planning workflow across all AI coding tools?
            </p>
            <PlatformDownloadSection 
              location="plan_mode_comparison"
              redirectToDownloadPage={true}
            />
          </div>
        </GlassCard>

        {/* Recommendations */}
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">Choosing the Right Plan Mode</h2>
        
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">For Complex Refactoring</h3>
            <div className="space-y-3">
              <div>
                <strong>Best Choice:</strong> Claude Code Plan Mode
              </div>
              <div className="text-sm text-muted-foreground">
                Comprehensive task breakdown without edits. Perfect for understanding complex changes before implementation.
              </div>
              <div className="mt-3">
                <strong>Alternative:</strong> Codex CLI Suggest Mode
              </div>
              <div className="text-sm text-muted-foreground">
                Powered by o3 for sophisticated architectural analysis.
              </div>
            </div>
          </GlassCard>
          
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">For Visual Development</h3>
            <div className="space-y-3">
              <div>
                <strong>Best Choice:</strong> Cursor Plan-First
              </div>
              <div className="text-sm text-muted-foreground">
                Visual diffs and inline previews make it easy to understand proposed changes.
              </div>
              <div className="mt-3">
                <strong>Alternative:</strong> Cline Step Approval
              </div>
              <div className="text-sm text-muted-foreground">
                VS Code integration with granular control over each operation.
              </div>
            </div>
          </GlassCard>
        </div>

        <TechnicalAccuracy />

        {/* Call to Action */}
        <GlassCard className="p-6 mt-12 text-center">
          <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">Enhance Any Plan Mode with Vibe Manager</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            No matter which AI coding tool you prefer, Vibe Manager supercharges your planning workflow 
            with multi-model strategy generation, intelligent context discovery, and comprehensive requirement capture.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <PlatformDownloadSection 
              location="plan_mode_comparison_bottom"
              redirectToDownloadPage={true}
            />
            <Button asChild variant="outline" size="lg">
              <Link href="/docs">View All Integration Guides</Link>
            </Button>
          </div>
        </GlassCard>
      </DocsArticle>
    </>
  );
}