import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Code2, Edit3, Save, FileText, CheckCircle2, Terminal, Layers, Brain, Zap, Copy, AlertCircle, Target } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'AI Implementation Plans - Human-in-Loop',
  description: 'Generate file-by-file AI plans. Review every change before execution. Prevent regressions in legacy code. Safe AI development.',
  keywords: [
    'implementation plan',
    'ai code planning',
    'human-in-the-loop ai',
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
    'human in the loop',
    'hitl ai',
    'ai governance',
    'code review',
    'legacy code safety',
    'file by file plans',
    'corporate ai governance',
    'safe ai coding',
    'plan approval workflow',
  ],
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Human-in-the-Loop Implementation Plans: Safe AI Development',
    description: 'Generate implementation plans with AI, but review and approve every change before execution. Human-in-the-loop governance with file-by-file granularity prevents regressions in legacy codebases.',
    url: 'https://www.plantocode.com/features/plan-mode',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/plan-mode',
    languages: {
      'en-US': 'https://www.plantocode.com/features/plan-mode',
      'en': 'https://www.plantocode.com/features/plan-mode',
    },
  },
};

export default function ImplementationPlansPage() {
  const planModeGuides = [
    {
      name: 'Codex CLI planning workflow',
      description: 'Pre-plan Codex runs with file discovery, multi-model merges, and approval modes.',
      href: '/plan-mode/codex',
      icon: <Terminal className="w-5 h-5 text-primary" />,
    },
    {
      name: 'Claude Code planning workflow',
      description: 'Enhance Claude Code\'s native Plan Mode with multi-model synthesis and file discovery.',
      href: '/plan-mode/claude-code',
      icon: <Layers className="w-5 h-5 text-primary" />,
    },
    {
      name: 'Cursor plan workflow',
      description: 'Give Cursor Composer full architectural awareness, including WSL-safe execution.',
      href: '/plan-mode/cursor',
      icon: <Code2 className="w-5 h-5 text-primary" />,
    },
  ];

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
                  Implementation plans: generate - edit - execute
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Human-in-the-loop governance with file-by-file granularity for safe AI-assisted development
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

              {/* Human-in-the-Loop Governance */}
              <div className="mb-16">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Human-in-the-Loop Governance</h2>
                  <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                    Team leads and stakeholders retain full control to review, edit, and approve every aspect
                    of implementation plans before any code changes begin. This ensures all development efforts
                    align with corporate product requirements, team workflows, and business objectives.
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Edit3 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Review Before Execution</h3>
                    <p className="text-foreground/80 text-sm">
                      Every AI-generated plan opens in Monaco editor for thorough review. No autonomous execution—you see and approve every proposed change.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Edit & Modify Plans</h3>
                    <p className="text-foreground/80 text-sm">
                      Full editing capabilities with VS Code features. Adjust approaches, add constraints, remove risky steps. The plan is yours to perfect.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Approve & Transmit</h3>
                    <p className="text-foreground/80 text-sm">
                      When satisfied, securely transmit the approved plan to your chosen coding agent or assigned developer. Full audit trail maintained.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* File-by-File Granularity for Maximum Safety */}
              <div className="mb-16">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">File-by-File Granularity for Maximum Safety</h2>
                  <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                    Plans break down development tasks with exact file paths corresponding to your project's repository structure.
                    This granularity makes the impact of changes crystal clear and prevents regressions, bugs, and unintended modifications
                    that can occur with autonomous coding agents.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-primary" />
                      Exact File Paths
                    </h3>
                    <p className="text-foreground/80 mb-4">
                      Every step specifies exact file paths from your repository. No ambiguity about which files will be modified, created, or deleted.
                    </p>
                    <div className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">src/components/auth/LoginForm.tsx</div>
                      <div className="text-yellow-400">src/api/handlers/user_handlers.rs</div>
                      <div className="text-cyan-400">server/migrations/add_mfa_columns.sql</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-primary" />
                      Prevent Regressions
                    </h3>
                    <p className="text-foreground/80 mb-4">
                      See exactly which legacy code will be touched. Identify potential breaking changes before they happen. Confident adoption of AI coding agents.
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Clear impact assessment</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Breaking change detection</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Legacy code protection</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* Plan Generation Deep Dive */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">AI-Powered Plan Generation with Full Context</h2>

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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Configurable Copy Button System</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Server-Configured Buttons</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Dynamic copy buttons configured server-side with template placeholders.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Button: "Parallel Claude Agents"</div>
                      <div className="text-yellow-400">Template: "{`{{IMPLEMENTATION_PLAN}}`}"</div>
                      <div className="text-cyan-400">+ Custom instructions...</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Smart Step Extraction</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Copy individual steps or full plans with automatic content extraction.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Copy Step 3</div>
                      <div className="text-yellow-400">Copy All Steps</div>
                      <div className="text-cyan-400">Copy with Instructions</div>
                    </div>
                  </GlassCard>
                </div>
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
                          Run models multiple times (3x GPT-5, 2x Gemini). Each run surfaces complementary implementation details. Real-time streaming with progress tracking.
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

              {/* Plan Mode Guides */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Guides for your IDE plan mode</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {planModeGuides.map((guide, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="mt-1">{guide.icon}</div>
                        <h3 className="text-lg font-semibold">{guide.name}</h3>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed mb-4">{guide.description}</p>
                      <LinkWithArrow href={guide.href} className="text-sm">
                        Open the {guide.name} guide
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
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
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience Safe, Human-Controlled AI Development</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From AI-powered generation to human review to controlled execution. This is how corporate teams adopt AI coding agents confidently—with human-in-the-loop governance, file-by-file granularity, and full control at every step.
                  </p>

                  <PlatformDownloadSection location="features_implementation_plans" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/merge-instructions">
                      Learn about architectural synthesis
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/integrated-terminal">
                      See terminal integration
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
