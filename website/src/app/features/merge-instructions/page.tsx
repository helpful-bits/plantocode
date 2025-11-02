import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { GitMerge, MessageSquare, CheckCircle2, Layers, Target, Brain } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Plan Synthesis - Multi-Model Merging',
  description: 'Architectural synthesis beyond simple merging. AI analyzes plans, resolves conflicts with SOLID principles, and creates emergent solutions with traceability.',
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
    url: 'https://www.plantocode.com/features/merge-instructions',
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
    canonical: 'https://www.plantocode.com/features/merge-instructions',
    languages: {
      'en-US': 'https://www.plantocode.com/features/merge-instructions',
      'en': 'https://www.plantocode.com/features/merge-instructions',
    },
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
                          Run GPT-5 and Gemini multiple times. Each run tackles large context differently, surfacing complementary implementation details.
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Actual System Capabilities</h2>

                <div className="grid md:grid-cols-2 gap-6 mb-6 max-w-5xl mx-auto">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-primary">What the AI Actually Does</h3>
                    <ul className="space-y-3 text-sm text-foreground/80">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Studies all source plans to identify unique insights</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Resolves architectural conflicts using SOLID principles</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Creates emergent solutions beyond simple combination</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Adds inline source markers for every decision</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Validates architectural coherence throughout</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Handles external example integration</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Maintains relevance to original task</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-4 text-primary">How Instructions Control Synthesis</h3>
                    <ul className="space-y-3 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Prioritization:</span>
                        <span className="text-foreground/80">"Focus on Plan 2's security"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Structure:</span>
                        <span className="text-foreground/80">"Organize by component"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Approach:</span>
                        <span className="text-foreground/80">"Use Plan 1's database strategy"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Quality:</span>
                        <span className="text-foreground/80">"Include comprehensive testing"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Scope:</span>
                        <span className="text-foreground/80">"Exclude deployment steps"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Integration:</span>
                        <span className="text-foreground/80">"Use example from docs"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-500 dark:text-yellow-400 font-semibold">Resolution:</span>
                        <span className="text-foreground/80">"Prefer microservices over monolith"</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>

                <GlassCard className="p-6 max-w-5xl mx-auto" highlighted>
                  <div className="bg-slate-900 dark:bg-black rounded-lg p-6 font-mono text-sm">
                    <div className="text-gray-400 mb-3"># Example merged output with source traceability:</div>
                    <div className="space-y-1">
                      <div className="text-green-400">Step 1: Set up database schema [src:P1 step 3]</div>
                      <div className="text-green-400">Step 2: Implement authentication [src:P2 step 1, P3 step 2]</div>
                      <div className="text-green-400">Step 3: Create API endpoints [src:P3 step 4 - cleaner approach]</div>
                      <div className="text-green-400">Step 4: Add error handling [src:EMERGENT - combining P1, P2 patterns]</div>
                      <div className="text-green-400">Step 5: Implement caching [src:P1 step 7, optimized with P2 insights]</div>
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
                    Beyond merging - intelligent architectural analysis with SOLID principles.
                    This is how plan synthesis should work - intelligent, traceable, emergent.
                  </p>
                  <PlatformDownloadSection location="features_merge_instructions" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      Explore plan generation
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/demo">
                      Watch it in action
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