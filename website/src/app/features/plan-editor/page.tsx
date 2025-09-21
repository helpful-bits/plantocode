import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { Code2, Edit3, Save, FileText, CheckCircle2, Terminal, Layers, Brain, Zap, Copy, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Implementation Plans - Complete AI-Powered Development Planning | Vibe Manager',
  description: 'Generate, edit, execute, and merge implementation plans. Full Monaco editor, terminal integration, multi-model support, real-time streaming, and intelligent file context. The complete implementation planning system.',
  keywords: [
    'implementation plans',
    'ai development planning',
    'monaco editor ai',
    'plan generation',
    'plan execution',
    'terminal integration',
    'multi-model planning',
    'xml plan structure',
    'real-time streaming',
    'file context loading',
  ],
  openGraph: {
    title: 'Implementation Plans - From Generation to Execution',
    description: 'Complete implementation planning system with AI generation, Monaco editing, terminal execution, and architectural synthesis. Not just an editor - a full planning platform.',
    url: 'https://www.vibemanager.app/features/plan-editor',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/plan-editor',
  },
};

export default function ImplementationPlansPage() {
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
                  <Layers className="w-4 h-4" />
                  <span>Complete Implementation Planning System</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Implementation Plans: Generate → Edit → Execute
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  AI generates structured XML plans with full file context. Edit in Monaco, execute in terminal,
                  merge multiple approaches. Real-time streaming, no truncation, complete control.
                </p>
              </div>

              {/* Core Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Intelligent Generation</h3>
                    <p className="text-foreground/80 text-sm">
                      Full file content loading (no truncation). Smart directory trees. Multi-model support with project configs.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Code2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Monaco Editor</h3>
                    <p className="text-foreground/80 text-sm">
                      VS Code's editor with XML syntax highlighting. Real-time editing with auto-save to database.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Terminal Execution</h3>
                    <p className="text-foreground/80 text-sm">
                      Execute plans directly in integrated terminal. Copy steps or full plans. Voice transcription support.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Plan Generation Deep Dive */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Intelligent Plan Generation</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Full Context Loading</h3>
                        <p className="text-foreground/80 mb-4">
                          Unlike other systems, we load complete file contents. No preemptive truncation - just smart warnings.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Complete file content, no truncation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Parallel file loading for speed</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Token warnings at &gt;100k tokens</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Smart directory tree generation</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Brain className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Multi-Model Architecture</h3>
                        <p className="text-foreground/80 mb-4">
                          Choose from multiple AI models with project-specific configurations and temperature settings.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>GPT-5, Claude Sonnet 4, Gemini 2.5 Pro</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project-specific model settings</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time token estimation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Context window validation</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Zap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Real-Time Streaming</h3>
                        <p className="text-foreground/80 mb-4">
                          Watch plans generate in real-time with live progress bars and streaming content updates.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Live streaming with progress bars</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time syntax highlighting</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Token count updates during generation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Background job status tracking</span>
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
                        <h3 className="text-xl font-bold mb-3">Structured XML Format</h3>
                        <p className="text-foreground/80 mb-4">
                          Plans use structured XML with numbered steps, enabling programmatic manipulation and extraction.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>&lt;step number="X"&gt; organization</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Title and description per step</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>File operations tracking</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Step-by-step extraction support</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Editor and Execution */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Professional Editing & Execution</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Edit3 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Monaco Editor Integration</h3>
                        <p className="text-foreground/80 mb-4">
                          Full VS Code editor experience. Not a text area - a professional code editor with all features.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>XML syntax highlighting</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Find & replace with regex</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Multi-cursor editing</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Auto-save to database</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Terminal className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Integrated Terminal Execution</h3>
                        <p className="text-foreground/80 mb-4">
                          Execute plans directly in persistent terminal sessions. Voice input, health monitoring, full control.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Persistent terminal sessions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Voice transcription input</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Copy plan/steps to terminal</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Session health monitoring</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Copy Button System */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12 bg-black/50">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Configurable Copy Button System</h2>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-black/30 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">Server-Configured Buttons</h3>
                      <p className="text-foreground/80 text-sm mb-3">
                        Dynamic copy buttons configured server-side with template placeholders.
                      </p>
                      <div className="bg-black rounded p-3 font-mono text-xs">
                        <div className="text-green-400">Button: "Parallel Claude Agents"</div>
                        <div className="text-yellow-400">Template: "{`{{IMPLEMENTATION_PLAN}}`}"</div>
                        <div className="text-cyan-400">+ Custom instructions...</div>
                      </div>
                    </div>

                    <div className="bg-black/30 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">Smart Step Extraction</h3>
                      <p className="text-foreground/80 text-sm mb-3">
                        Copy individual steps or full plans with automatic content extraction.
                      </p>
                      <div className="bg-black rounded p-3 font-mono text-xs">
                        <div className="text-green-400">Copy Step 3</div>
                        <div className="text-yellow-400">Copy All Steps</div>
                        <div className="text-cyan-400">Copy with Instructions</div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Complete Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Complete Planning Workflow</h2>

                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">AI File Discovery</h3>
                        <p className="text-foreground/80">
                          Smart file finder identifies relevant files. Select root directories for focused context. No truncation.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Multi-Model Generation</h3>
                        <p className="text-foreground/80">
                          Generate multiple plans with different models. Real-time streaming with progress tracking.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Edit in Monaco</h3>
                        <p className="text-foreground/80">
                          Professional editing with VS Code features. Add steps, modify approaches, restructure plans.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Architectural Synthesis</h3>
                        <p className="text-foreground/80">
                          Merge multiple plans with custom instructions. SOLID principle resolution, source traceability.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        5
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Execute in Terminal</h3>
                        <p className="text-foreground/80">
                          Run your plan in integrated terminal. Voice commands, persistent sessions, real results.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Technical Details */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Under the Hood</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <AlertCircle className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">No Truncation Policy</h3>
                    <p className="text-foreground/80 text-sm">
                      Full file content loaded. Warns at &gt;100k tokens but doesn't truncate. You get complete context.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <Save className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">Database Persistence</h3>
                    <p className="text-foreground/80 text-sm">
                      Plans stored with metadata, cost tracking, and full prompt history. Everything is auditable.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <Copy className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">Template System</h3>
                    <p className="text-foreground/80 text-sm">
                      Server-side prompts with project overrides. Unified prompt processor with smart placeholders.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience Complete Implementation Planning</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From AI-powered generation to professional editing to terminal execution.
                    This is how implementation planning should work - complete, integrated, powerful.
                  </p>

                  <PlatformDownloadSection location="features_implementation_plans" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <Link href="/features/merge-instructions" className="text-primary hover:underline">
                      Learn about architectural synthesis →
                    </Link>
                    <span className="hidden sm:inline">•</span>
                    <Link href="/features/integrated-terminal" className="text-primary hover:underline">
                      See terminal integration →
                    </Link>
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