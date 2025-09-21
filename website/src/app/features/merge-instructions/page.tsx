import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { GitMerge, MessageSquare, CheckCircle2, Layers, Target, Brain } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Architectural Plan Synthesis - Intelligent Multi-Plan Merging | Vibe Manager',
  description: 'Advanced architectural synthesis that goes beyond simple merging. AI analyzes multiple implementation plans, resolves conflicts using SOLID principles, and creates emergent solutions with full source traceability.',
  keywords: [
    'architectural synthesis',
    'implementation plan merge',
    'source traceability',
    'conflict resolution',
    'SOLID principles',
    'emergent solutions',
    'multi-model synthesis',
    'plan consolidation',
    'intelligent merging',
  ],
  openGraph: {
    title: 'Architectural Synthesis - Beyond Simple Plan Merging',
    description: 'AI performs deep architectural analysis, resolves conflicts using SOLID principles, and synthesizes emergent solutions with complete source traceability.',
    url: 'https://www.vibemanager.app/features/merge-instructions',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/merge-instructions',
  },
};

export default function MergeInstructionsPage() {
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
                  <GitMerge className="w-4 h-4" />
                  <span>Architectural Synthesis with Source Traceability</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Beyond Simple Merging: Architectural Synthesis
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  AI performs deep architectural analysis of multiple plans, resolves conflicts using SOLID principles,
                  and synthesizes emergent solutions. Every decision includes source attribution [src:P1 step 2] for complete traceability.
                </p>
              </div>

              {/* Key Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Genuine Architectural Analysis</h3>
                    <p className="text-foreground/80 text-sm">
                      Not just concatenation. AI deeply analyzes each plan's architecture, identifying unique insights and approaches.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">SOLID Principle Resolution</h3>
                    <p className="text-foreground/80 text-sm">
                      Conflicts resolved using software engineering best practices. Creates architecturally sound solutions.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Layers className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Source Traceability [src:P1]</h3>
                    <p className="text-foreground/80 text-sm">
                      Every merged element includes inline attribution markers showing exactly which source plan it came from.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Architectural Synthesis Process</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Layers className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Multi-Model Plan Generation</h3>
                        <p className="text-foreground/80 mb-4">
                          Generate diverse implementation approaches using different models and configurations.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Each plan stored with complete metadata</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Relevant files automatically extracted</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project structure context included</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Temperature variations for diversity</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <MessageSquare className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Intelligent Instruction Processing</h3>
                        <p className="text-foreground/80 mb-4">
                          Your instructions directly control the synthesis. AI understands complex architectural guidance.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Prioritization: "Focus on security from Plan 2"</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Structure: "Organize chronologically"</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Approach: "Use Plan 1's database strategy"</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Scope: "Exclude testing, focus on core"</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Deep Architectural Analysis</h3>
                        <p className="text-foreground/80 mb-4">
                          AI performs comprehensive analysis before synthesis, not simple concatenation.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Identifies unique insights from each plan</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Resolves conflicts using SOLID principles</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Preserves valuable architectural decisions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Creates emergent solutions beyond sources</span>
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
                        <h3 className="text-xl font-bold mb-3">Synthesis with Full Traceability</h3>
                        <p className="text-foreground/80 mb-4">
                          Creates comprehensive solution with complete source attribution for every decision.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Inline markers: [src:P1 step 2, P3 step 5]</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>External example integration support</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Quality validation checkpoints</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Architectural coherence maintained</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* System Capabilities */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12 bg-black/50">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Actual System Capabilities</h2>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-black/30 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">What the AI Actually Does</h3>
                      <ul className="space-y-2 text-sm text-foreground/80">
                        <li>• Studies all source plans to identify unique insights</li>
                        <li>• Resolves architectural conflicts using SOLID principles</li>
                        <li>• Creates emergent solutions beyond simple combination</li>
                        <li>• Adds inline source markers for every decision</li>
                        <li>• Validates architectural coherence throughout</li>
                        <li>• Handles external example integration</li>
                        <li>• Maintains relevance to original task</li>
                      </ul>
                    </div>

                    <div className="bg-black/30 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">How Instructions Control Synthesis</h3>
                      <ul className="space-y-2 text-sm text-foreground/80">
                        <li>• <span className="text-yellow-400">Prioritization:</span> "Focus on Plan 2's security"</li>
                        <li>• <span className="text-yellow-400">Structure:</span> "Organize by component"</li>
                        <li>• <span className="text-yellow-400">Approach:</span> "Use Plan 1's database strategy"</li>
                        <li>• <span className="text-yellow-400">Quality:</span> "Include comprehensive testing"</li>
                        <li>• <span className="text-yellow-400">Scope:</span> "Exclude deployment steps"</li>
                        <li>• <span className="text-yellow-400">Integration:</span> "Use example from docs"</li>
                        <li>• <span className="text-yellow-400">Resolution:</span> "Prefer microservices over monolith"</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-black rounded-lg p-6 font-mono text-sm">
                    <div className="text-gray-500 mb-2"># Example merged output with source traceability:</div>
                    <div className="text-green-400">
                      Step 1: Set up database schema [src:P1 step 3]<br />
                      Step 2: Implement authentication [src:P2 step 1, P3 step 2]<br />
                      Step 3: Create API endpoints [src:P3 step 4 - cleaner approach]<br />
                      Step 4: Add error handling [src:EMERGENT - combining P1, P2 patterns]<br />
                      Step 5: Implement caching [src:P1 step 7, optimized with P2 insights]
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Technical Implementation */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical Implementation Details</h2>

                <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <MessageSquare className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Backend Processing</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          ImplementationPlanMergeProcessor orchestrates the entire synthesis.
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          <li>• Fetches raw XML from source plans</li>
                          <li>• Extracts relevant file contexts</li>
                          <li>• Generates project structure tree</li>
                          <li>• Builds comprehensive LLM prompt</li>
                          <li>• Streams response with real-time updates</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">AI System Prompt</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          Sophisticated prompt enforces quality and traceability.
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          <li>• Expert software architect persona</li>
                          <li>• SOLID principle conflict resolution</li>
                          <li>• Mandatory source attribution</li>
                          <li>• Emergent solution creation</li>
                          <li>• Quality validation gates</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Layers className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Frontend Components</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          Rich UI for plan selection and instruction input.
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          <li>• MergePlansSection with collapsible UI</li>
                          <li>• FloatingMergeInstructions (draggable)</li>
                          <li>• Real-time text enhancement support</li>
                          <li>• Debounced state management</li>
                          <li>• Session persistence for instructions</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Target className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Metadata & Storage</h3>
                        <p className="text-foreground/80 text-sm mb-3">
                          Complete audit trail and debugging capability.
                        </p>
                        <ul className="text-xs text-foreground/60 space-y-1">
                          <li>• Source job IDs preserved</li>
                          <li>• Full prompt stored for debugging</li>
                          <li>• Merge instructions tracked</li>
                          <li>• File operations extracted</li>
                          <li>• Priority 2 job scheduling</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Real Value Proposition */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Real Value: Beyond Simple Merging</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Architectural Synthesis</h3>
                    <p className="text-foreground/80">
                      Not concatenation. AI performs deep architectural analysis and creates emergent solutions that go beyond any single source plan.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Complete Traceability</h3>
                    <p className="text-foreground/80">
                      Every decision includes [src:P1 step 2] markers. Know exactly where each architectural choice originated.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">SOLID Engineering Practices</h3>
                    <p className="text-foreground/80">
                      Conflicts resolved using software engineering principles, not arbitrary choices. Architecturally sound results.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience True Architectural Synthesis</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Go beyond simple plan merging. Get AI-powered architectural synthesis with SOLID principles,
                    complete source traceability, and emergent solutions that exceed any single plan.
                  </p>

                  <PlatformDownloadSection location="features_merge_instructions" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <Link href="/features/plan-editor" className="text-primary hover:underline">
                      See the plan editor →
                    </Link>
                    <span className="hidden sm:inline">•</span>
                    <Link href="/demo" className="text-primary hover:underline">
                      Try interactive demo →
                    </Link>
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