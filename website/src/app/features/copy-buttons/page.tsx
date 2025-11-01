import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Copy, Settings, Terminal, Edit3, Zap, GripVertical, CheckCircle2, Code2, Layers } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Copy buttons - turn prompts into one-click workflows | PlanToCode',
  description: 'Transform any prompt into a reusable button. Server-configured templates with smart placeholders, drag-drop reordering, and terminal integration. Stop copy-pasting - automate your workflows.',
  keywords: [
    'copy buttons',
    'workflow automation',
    'template system',
    'placeholder substitution',
    'reusable prompts',
    'terminal automation',
    'drag drop reordering',
    'smart templates',
    'prompt management',
    'ai workflow buttons',
  ],
  openGraph: {
    title: 'Copy Buttons - Any Prompt Becomes a Workflow',
    description: 'Server-configured buttons with smart templates and placeholders. Drag-drop reordering, terminal integration, and one-click automation. Your best tricks, always ready.',
    url: 'https://www.plantocode.com/features/copy-buttons',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/copy-buttons',
    languages: {
      'en-US': 'https://www.plantocode.com/features/copy-buttons',
      'en': 'https://www.plantocode.com/features/copy-buttons',
    },
  },
};

export default function CopyButtonsPage() {
  return (
    <React.Fragment>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Copy className="w-4 h-4" />
                  <span>Configurable Workflow Automation System</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Workflows. One click.
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Save your best prompts as buttons. Substitute plan content and run them in the terminal.
                </p>
              </div>

              {/* Core Concept */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Settings className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Server-Configured Templates</h3>
                    <p className="text-foreground/80 text-sm">
                      Dynamic buttons with placeholder substitution. Project-specific overrides with unified prompt processing.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <GripVertical className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Drag-Drop Reordering</h3>
                    <p className="text-foreground/80 text-sm">
                      Visual workflow management with @dnd-kit integration. Reorder buttons to match your process.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Terminal Integration</h3>
                    <p className="text-foreground/80 text-sm">
                      One-click execution in persistent terminal sessions. Chunked sending for large content.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Template System Deep Dive */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Smart Template System</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Code2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Placeholder Substitution</h3>
                        <p className="text-foreground/80 mb-4">
                          Dynamic content replacement using `{'{{PLACEHOLDER}}'}` syntax. Context-aware processing with implementation plans.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><code className="text-xs bg-black/30 px-1 rounded">{`{{IMPLEMENTATION_PLAN}}`}</code> - Full plan content</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><code className="text-xs bg-black/30 px-1 rounded">{`{{STEP_CONTENT}}`}</code> - Selected step content</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><code className="text-xs bg-black/30 px-1 rounded">{`{{PROJECT_CONTEXT}}`}</code> - Project-specific context</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Custom placeholders for extensibility</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Layers className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Unified Prompt Processing</h3>
                        <p className="text-foreground/80 mb-4">
                          Advanced template engine with conditional sections, XML formatting, and intelligent cleanup.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Regex-based placeholder matching</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Escape character handling</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Multi-line content support</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Graceful undefined handling</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Configuration Management */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Configuration & Management</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Settings className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Project-Specific Settings</h3>
                        <p className="text-foreground/80 mb-4">
                          Copy buttons stored in task settings with project-level overrides and server-side defaults.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>SQLite database persistence</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Server-managed default configurations</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project directory scoping</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time configuration updates</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Edit3 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Visual Configuration UI</h3>
                        <p className="text-foreground/80 mb-4">
                          Intuitive editor with drag-drop reordering, debounced input handling, and real-time preview.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <GripVertical className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Drag handles for visual reordering</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>300ms debounced input processing</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Read-only mode for system buttons</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Customization workflow support</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Terminal Integration */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Seamless Terminal Execution</h2>

                <GlassCard className="p-8 sm:p-12" highlighted>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4">One-Click Automation</h3>
                      <p className="text-foreground/80 mb-6">
                        Copy buttons integrate directly with terminal sessions for instant execution. Smart content handling prevents terminal overflow.
                      </p>
                      <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                          <Terminal className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          <span className="text-foreground/80">Automatic paste to active terminal</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <Zap className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          <span className="text-foreground/80">Chunked sending for large content</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          <span className="text-foreground/80">Session health monitoring</span>
                        </li>
                        <li className="flex items-start gap-3">
                          <Copy className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          <span className="text-foreground/80">Clipboard fallback for safety</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-6">
                      <div className="text-green-400 mb-3 text-sm font-mono">Example Button Configuration:</div>
                      <div className="font-mono text-xs space-y-2">
                        <div className="text-cyan-400">Label: "Parallel Claude Agents"</div>
                        <div className="text-yellow-400">Template:</div>
                        <div className="text-white ml-2 text-wrap break-words">
                          {`{{IMPLEMENTATION_PLAN}}`}<br/>
                          <br/>
                          <strong>Now, think deeply!</strong> Read the files mentioned,<br/>
                          understand them and launch parallel Claude<br/>
                          coding agents that run <strong>at the same time</strong>...
                        </div>
                        <div className="text-green-400 mt-3">→ One click = Full workflow execution</div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Technical Architecture */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical Implementation</h2>

                <GlassCard className="p-8 bg-black/50">
                  <div className="font-mono text-sm">
                    <div className="text-gray-500 mb-4"># Copy Button System Architecture</div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## 1. Configuration Storage</div>
                      <div className="text-white ml-4">
                        → CopyButtonConfig[] in task settings<br />
                        → Project-specific database storage<br />
                        → Server-side default configurations<br />
                        → Real-time synchronization
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## 2. Template Processing</div>
                      <div className="text-white ml-4">
                        → Regex-based placeholder matching<br />
                        → Dynamic content substitution<br />
                        → Context-aware data extraction<br />
                        → Error handling for undefined values
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## 3. UI Integration</div>
                      <div className="text-white ml-4">
                        → Implementation plan cards<br />
                        → Content viewing modals<br />
                        → Terminal interface headers<br />
                        → Drag-drop configuration editor
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## 4. Execution Flow</div>
                      <div className="text-white ml-4">
                        → Button click triggers template processing<br />
                        → Placeholder substitution with plan content<br />
                        → Terminal session validation<br />
                        → Chunked content transmission
                      </div>
                    </div>

                    <div className="text-cyan-400 mt-4">
                      [Extensible system: Add new placeholders and templates as needed]
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Use Cases & Examples */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Real-World Use Cases</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Parallel Agent Workflows</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      Launch multiple Claude coding agents simultaneously with pre-configured instructions.
                    </p>
                    <div className="bg-black/30 rounded p-3 font-mono text-xs">
                      <span className="text-green-400">Button:</span> "Parallel Claude Agents"<br/>
                      <span className="text-cyan-400">Saves:</span> Complex multi-agent setup instructions
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Investigation & Review</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      Standardized review processes for implementation plan results.
                    </p>
                    <div className="bg-black/30 rounded p-3 font-mono text-xs">
                      <span className="text-green-400">Button:</span> "Investigate Results"<br/>
                      <span className="text-cyan-400">Saves:</span> Thorough validation workflows
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Custom Team Workflows</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      Team-specific processes with project context and coding standards.
                    </p>
                    <div className="bg-black/30 rounded p-3 font-mono text-xs">
                      <span className="text-green-400">Template:</span> {`{{PROJECT_CONTEXT}}`}<br/>
                      <span className="text-cyan-400">Dynamic:</span> Project-aware instructions
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Step-by-Step Execution</h3>
                    <p className="text-foreground/80 text-sm mb-3">
                      Extract and execute individual implementation steps with context.
                    </p>
                    <div className="bg-black/30 rounded p-3 font-mono text-xs">
                      <span className="text-green-400">Template:</span> {`{{STEP_CONTENT}}`}<br/>
                      <span className="text-cyan-400">Result:</span> Focused step execution
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Unique Value */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">What Makes This Different</h2>

                <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6 sm:p-8 border-red-500/20 bg-red-500/5">
                    <h3 className="text-xl font-bold mb-6 text-red-500 flex items-center gap-2">
                      <span className="text-2xl">✗</span>
                      Traditional Copy-Paste
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Manual copy-paste workflows</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Static, unchanging templates</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">No context awareness</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Error-prone manual edits</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Lost workflows over time</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6 sm:p-8 border-green-500/20 bg-green-500/5" highlighted>
                    <h3 className="text-xl font-bold mb-6 text-green-500 flex items-center gap-2">
                      <span className="text-2xl">✓</span>
                      PlanToCode Copy Buttons
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">One-click automation</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Dynamic content substitution</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Smart placeholder system</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Context-aware processing</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Persistent, reusable workflows</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Prompts Into Workflows</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Any prompt becomes a button. Smart templates with placeholders.
                    Complex workflows, instant launch. Your best tricks, always ready.
                  </p>
                  <PlatformDownloadSection location="features_copy_buttons" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      See implementation plans
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/integrated-terminal">
                      Explore terminal integration
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}