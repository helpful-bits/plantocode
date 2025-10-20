import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { Building, Globe, Mail, Brain, Terminal, Layers, FileText, Zap, Copy } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About PlanToCode - development planning tool',
  description: 'PlanToCode is a comprehensive development planning environment with multi-model AI integration, persistent terminal sessions, voice transcription, and architectural synthesis capabilities.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/about',
  },
};

export default function AboutPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  About PlanToCode
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  PlanToCode helps developers plan and ship code changes by finding impacted files, generating and merging plans, and running them in a terminal.
                </p>
              </div>

              {/* What We Are */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">What We Built</h2>
                  <p className="text-lg text-foreground/80 mb-8 leading-relaxed">
                    PlanToCode is a comprehensive development planning environment designed for serious development work where context, traceability, and professional tooling matter more than quick AI interactions. We've built a system for complex, multi-step implementations where traditional AI tools fall short.
                  </p>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-primary" />
                        Multi-Model Intelligence
                      </h3>
                      <p className="text-foreground/80 leading-relaxed">
                        Integration with GPT-5, Claude Sonnet 4, and Gemini 2.5 Pro. Not just API calls - intelligent orchestration with project-specific configurations, real-time streaming, and complete traceability.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-primary" />
                        Professional Development Environment
                      </h3>
                      <p className="text-foreground/80 leading-relaxed">
                        Monaco editor integration, persistent terminal sessions with health monitoring, voice transcription, and 5MB SQLite ring buffers. Built for real development workflows.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Core Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Core Capabilities</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Implementation Planning</h3>
                    <p className="text-foreground/80 text-sm">
                      Full context loading with no truncation policy. Structured XML plans with numbered steps. Multi-model generation and architectural synthesis.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Layers className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Intelligent File Discovery</h3>
                    <p className="text-foreground/80 text-sm">
                      Multi-stage workflow: root folder selection, regex pattern filtering, AI relevance assessment. Focused file selection with path validation.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Copy className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Workflow Automation</h3>
                    <p className="text-foreground/80 text-sm">
                      Configurable copy buttons with smart templates. Transform any prompt into a reusable workflow with placeholder substitution and terminal integration.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Job-Centric Terminal</h3>
                    <p className="text-foreground/80 text-sm">
                      PTY sessions with 5-second health monitoring, auto-recovery actions, and agent attention detection. Sessions persist across app restarts.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Architectural Synthesis</h3>
                    <p className="text-foreground/80 text-sm">
                      Beyond simple merging - deep architectural analysis using SOLID principles. Source traceability with [src:P1 step 2] attribution for every decision.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Voice & Text Integration</h3>
                    <p className="text-foreground/80 text-sm">
                      OpenAI Whisper integration for terminal commands. Selection-based text improvement with context-aware processing and real-time job tracking.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Our Philosophy */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Our Philosophy</h2>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-3">No Truncation Policy</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        We load complete file contents. No preemptive truncation - just smart warnings. You get the full context needed for serious development work.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">Complete Traceability</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        Every AI decision includes source attribution. Full audit trails, cost tracking, and session persistence. You know exactly what happened and why.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">Professional Tooling</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        Monaco editor, xterm.js, proper development environment integration. Not just another chat interface - a complete development planning platform.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3">Transparency & Control</h3>
                      <p className="text-foreground/80 leading-relaxed">
                        Local storage, transparent AI provider communication, and full control over what gets sent. You always see the context before confirming API calls.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Technical Architecture */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical Foundation</h2>

                <GlassCard className="p-8 bg-black/50">
                  <div className="font-mono text-sm">
                    <div className="text-gray-500 mb-4"># PlanToCode Architecture</div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Frontend</div>
                      <div className="text-white ml-4">
                        → React + TypeScript<br />
                        → Monaco Editor (VS Code's editor)<br />
                        → xterm.js for terminal rendering<br />
                        → Tauri for cross-platform desktop
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Backend Services</div>
                      <div className="text-white ml-4">
                        → Rust/Tauri for system integration<br />
                        → SQLite for local persistence<br />
                        → PTY sessions with health monitoring<br />
                        → Multi-provider AI orchestration
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="text-green-400 mb-2">## Key Patterns</div>
                      <div className="text-white ml-4">
                        → Job-centric design with background processing<br />
                        → Real-time streaming with progress tracking<br />
                        → Context-aware template processing<br />
                        → Session persistence across restarts
                      </div>
                    </div>

                    <div className="text-cyan-400 mt-4">
                      [Built for complex development workflows, not simple AI chat]
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Company Information */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Company Information</h2>

                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="flex items-center gap-4">
                      <Building className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Company</p>
                        <p className="text-foreground font-medium text-lg">helpful bits GmbH</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Globe className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Jurisdiction</p>
                        <p className="text-foreground font-medium text-lg">Germany</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <Mail className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">Contact</p>
                        <a href="mailto:support@plantocode.com" className="text-primary hover:underline font-medium text-lg">
                          support@plantocode.com
                        </a>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}