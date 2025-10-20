import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Terminal, Mic, Save, History, Zap, Heart, AlertCircle, Shield, Database, Activity, Cpu } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terminal for plans - persistent PTY sessions | PlanToCode',
  description: 'Professional terminal with automatic health monitoring, session recovery, attention detection, and voice transcription. PTY-based sessions persist across restarts with 5MB ring buffer. Built for AI development workflows.',
  keywords: [
    'pty terminal',
    'persistent terminal sessions',
    'terminal health monitoring',
    'voice transcription terminal',
    'attention detection',
    'session recovery',
    'xterm.js integration',
    'job-centric terminal',
    'ring buffer logging',
    'cli auto-launch',
  ],
  openGraph: {
    title: 'Job-Centric Terminal with Automatic Health Monitoring',
    description: 'PTY-based terminal with health monitoring, auto-recovery, attention detection, and voice transcription. Sessions persist with 5MB ring buffer. Built for AI workflows.',
    url: 'https://www.plantocode.com/features/integrated-terminal',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/integrated-terminal',
  },
};

export default function IntegratedTerminalPage() {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Activity className="w-4 h-4" />
                  <span>PTY Terminal with Health Monitoring & Auto-Recovery</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Job-centric terminal that keeps context
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Run your plan in a persistent terminal. Health checks, recovery, and logging built in.
                </p>
              </div>

              {/* Core Architecture */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Native PTY Sessions</h3>
                    <p className="text-foreground/80 text-sm">
                      Cross-platform PTY via portable_pty. Real shells (zsh, bash, PowerShell). 64KB buffer streaming.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Heart className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Health Monitoring</h3>
                    <p className="text-foreground/80 text-sm">
                      Health checks every 5 seconds. Detects inactive/dead processes. Auto-recovery with intelligent actions.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Database className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">5MB Ring Buffer</h3>
                    <p className="text-foreground/80 text-sm">
                      SQLite persistence with automatic truncation. Sessions survive app restarts. Full audit trail.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Health Monitoring System */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Automatic Health Monitoring System</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Activity className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Health State Detection</h3>
                        <p className="text-foreground/80 mb-4">
                          Continuous monitoring every 5 seconds with intelligent state detection and recovery actions.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <span className="text-green-400">•</span>
                            <span><strong>Healthy:</strong> Normal operation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-yellow-400">•</span>
                            <span><strong>NoOutput:</strong> Silent for &gt;30s</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-orange-400">•</span>
                            <span><strong>Agent Requires Attention:</strong> 2+ minutes inactive</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-red-400">•</span>
                            <span><strong>ProcessDead:</strong> Shell terminated</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-400">•</span>
                            <span><strong>PersistenceLag:</strong> DB sync pending</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Shield className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Auto-Recovery Actions</h3>
                        <p className="text-foreground/80 mb-4">
                          Intelligent recovery based on health state. No manual intervention required.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><strong>SendPrompt:</strong> Echo 'alive' probe</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><strong>Interrupt:</strong> Ctrl+C with restart</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><strong>Restart:</strong> Kill and recreate PTY</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><strong>Reattach:</strong> Recreate channels</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span><strong>FlushPersistence:</strong> Force DB sync</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Agent Attention System */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Two-Level Agent Attention System</h2>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <GlassCard className="p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">Inactivity Detection</h3>
                      <p className="text-foreground/80 text-sm mb-3">
                        Simple time-based detection when agents stop producing output.
                      </p>
                      <div className="bg-slate-900 dark:bg-black rounded p-3 font-mono text-xs">
                        <div className="text-green-400">Attention levels:</div>
                        <div className="text-yellow-400">• 30 seconds: "Agent idle - may have completed task"</div>
                        <div className="text-red-400">• 2 minutes: "Agent requires attention - check terminal"</div>
                      </div>
                    </GlassCard>

                    <GlassCard className="p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">User Notifications</h3>
                      <p className="text-foreground/80 text-sm mb-3">
                        Progressive alerting when agents need human guidance.
                      </p>
                      <div className="bg-slate-900 dark:bg-black rounded p-3 font-mono text-xs">
                        <div className="text-cyan-400">Alert mechanisms:</div>
                        <div className="text-gray-200">• Yellow indicators for idle agents</div>
                        <div className="text-gray-200">• Red alerts + desktop notifications</div>
                        <div className="text-gray-200">• Visual terminal borders</div>
                        <div className="text-gray-200">• Auto-clear on new output</div>
                      </div>
                    </GlassCard>
                  </div>
                </GlassCard>
              </div>

              {/* Core Features */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Professional Terminal Features</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Voice Transcription</h3>
                        <p className="text-foreground/80 mb-4">
                          OpenAI Whisper integration for voice commands. Direct PTY input with staging area.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time audio processing</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Editable staging before execution</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Microphone device selection</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>JWT authenticated API calls</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Database className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Session Persistence</h3>
                        <p className="text-foreground/80 mb-4">
                          SQLite-backed sessions with 5MB ring buffer. Survives app restarts and crashes.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <Save className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Async persistence worker</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Save className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Prompt marker detection ($, #, &gt;)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Save className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Auto-truncation at 5MB</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Save className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Session recovery on startup</span>
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
                        <h3 className="text-xl font-bold mb-3">CLI Auto-Launch</h3>
                        <p className="text-foreground/80 mb-4">
                          Detects implementation plans and auto-launches configured CLI tools after shell init.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <Terminal className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>2-second shell initialization delay</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Terminal className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>PATH augmentation for tools</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Terminal className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Custom command templates</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Terminal className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project-specific configurations</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Cpu className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">xterm.js Frontend</h3>
                        <p className="text-foreground/80 mb-4">
                          VS Code's terminal renderer with WebGL acceleration and full Unicode support.
                        </p>
                        <ul className="space-y-2 text-foreground/70 dark:text-foreground/60">
                          <li className="flex items-start gap-2">
                            <History className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>10K line scrollback buffer</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <History className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Unicode 11 & CJK support</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <History className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>GPU rendering option</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <History className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Image paste to project folder</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Technical Architecture */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical Architecture</h2>

                <GlassCard className="p-8 bg-slate-50 text-slate-900 dark:bg-black/50 dark:text-white">
                  <div className="font-mono text-sm">
                    <div className="text-foreground/70 dark:text-foreground/60 mb-4"># Terminal Session Lifecycle</div>

                    <div className="mb-6 flex gap-4">
                      <div className="text-green-400 font-bold text-xl">1.</div>
                      <div className="flex-1">
                        <div className="text-green-400 mb-2 font-semibold">Session Creation</div>
                        <div className="text-white">
                        → JWT authentication check<br />
                        → PTY pair creation (portable_pty)<br />
                        → Shell detection (zsh/bash/PowerShell)<br />
                        → Environment setup + PATH augmentation<br />
                        → Process spawn with login flags (-l -i)
                        </div>
                      </div>
                    </div>

                    <div className="mb-6 flex gap-4">
                      <div className="text-green-400 font-bold text-xl">2.</div>
                      <div className="flex-1">
                        <div className="text-green-400 mb-2 font-semibold">I/O Streaming</div>
                        <div className="text-white">
                        → 64KB read buffers<br />
                        → Broadcast channels for output<br />
                        → Sync MPSC for persistence queue<br />
                        → 16ms batch processing in frontend<br />
                        → Direct Uint8Array handling
                        </div>
                      </div>
                    </div>

                    <div className="mb-6 flex gap-4">
                      <div className="text-green-400 font-bold text-xl">3.</div>
                      <div className="flex-1">
                        <div className="text-green-400 mb-2 font-semibold">Health Monitoring</div>
                        <div className="text-white">
                        → Health checks every 5 seconds<br />
                        → Process alive verification<br />
                        → Output timestamp tracking<br />
                        → Agent attention detection<br />
                        → Automatic recovery triggers
                        </div>
                      </div>
                    </div>

                    <div className="mb-6 flex gap-4">
                      <div className="text-green-400 font-bold text-xl">4.</div>
                      <div className="flex-1">
                        <div className="text-green-400 mb-2 font-semibold">Persistence</div>
                        <div className="text-white">
                        → SQLite terminal_sessions table<br />
                        → 5MB ring buffer (SUBSTR truncation)<br />
                        → Prompt marker priority flush<br />
                        → Session recovery on restart<br />
                        → Full audit trail capability
                        </div>
                      </div>
                    </div>

                    <div className="text-cyan-400 mt-4">
                      [Job-centric design: Each terminal tied to a background job]
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Advanced Features Grid */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Platform & Performance</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Cross-Platform Shells</h3>
                    <p className="text-foreground/80 text-sm">
                      Auto-detects system shell. Login shell with proper rc files. Environment variable inheritance.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Connection Recovery</h3>
                    <p className="text-foreground/80 text-sm">
                      Exponential backoff retry. Auto-reattach on disconnect. Historical output preservation.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Plan Integration</h3>
                    <p className="text-foreground/80 text-sm">
                      Copy implementation plans directly. 4KB chunk sending. Template placeholder support.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Performance</h3>
                    <p className="text-foreground/80 text-sm">
                      RequestIdleCallback batching. WebGL GPU acceleration. Lazy text decoding.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Multi-Session</h3>
                    <p className="text-foreground/80 text-sm">
                      DashMap concurrent access. Isolated output channels. Per-session health tracking.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Error Recovery</h3>
                    <p className="text-foreground/80 text-sm">
                      Network retry logic. Process restart capability. Graceful degradation.
                    </p>
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
                      Standard Terminals
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">No health monitoring</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">No agent attention tracking</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Lost on app restart</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">No attention alerts</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-red-400 mt-0.5 text-lg">✗</span>
                        <span className="text-foreground/70">Separate from workflow</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6 sm:p-8 border-green-500/20 bg-green-500/5" highlighted>
                    <h3 className="text-xl font-bold mb-6 text-green-500 flex items-center gap-2">
                      <span className="text-2xl">✓</span>
                      PlanToCode Terminal
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Health checks every 5 seconds</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Auto-recovery actions</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">5MB persistent buffer</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Agent attention detection</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="text-green-400 mt-0.5 text-lg">✓</span>
                        <span className="text-foreground/90 font-medium">Job-centric integration</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience the Terminal That Never Loses Context</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Health monitoring, session persistence, agent attention detection.
                    This is how terminals should work - resilient, intelligent, job-centric.
                  </p>
                  <PlatformDownloadSection location="features_integrated_terminal" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/voice-transcription">
                      Explore voice commands
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs/terminal">
                      Read technical docs
                    </LinkWithArrow>
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