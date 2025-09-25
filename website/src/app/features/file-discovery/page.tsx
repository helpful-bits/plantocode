import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Search, Workflow, Target, DollarSign, GitBranch, CheckCircle2, Brain, Layers, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI File Discovery - Intelligent Repository Navigation | Vibe Manager',
  description:
    'AI-powered multi-stage workflow that intelligently discovers and selects relevant files from your codebase. Cost-effective operation at ~$0.10-0.15 per workflow with real-time progress tracking.',
  keywords: [
    'ai file discovery',
    'intelligent file selection',
    'repository navigation',
    'multi-stage workflow',
    'code analysis',
    'file filtering',
    'git optimization',
    'project context',
    'implementation plans',
    'cost effective ai',
  ],
  openGraph: {
    title: 'AI File Discovery - From Repository to Relevant Context',
    description:
      'Multi-stage AI workflow that discovers relevant files, filters intelligently, and optimizes for implementation planning. Real-time progress tracking with cost-effective operation.',
    url: 'https://www.vibemanager.app/features/file-discovery',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/file-discovery',
  },
};

export default function FileDiscoveryFeaturePage() {
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
                  <Search className="w-4 h-4" />
                  <span>AI-powered repository navigation</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Find what matters in your codebase automatically
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  AI-powered 5-stage workflow that discovers relevant files, filters intelligently, and optimizes your
                  codebase for implementation planning. From thousands of files to focused context.
                </p>
              </div>

              {/* Core Benefits Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Multi-Stage Intelligence</h3>
                    <p className="text-foreground/80 text-sm">
                      5-stage AI workflow with regex filtering, relevance assessment, and path discovery to identify the most relevant files.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <DollarSign className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Cost-Effective Operation</h3>
                    <p className="text-foreground/80 text-sm">
                      Token-optimized workflow with intelligent batching. Cost tracking built into every stage.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Real-Time Progress</h3>
                    <p className="text-foreground/80 text-sm">
                      Live progress tracking with stage-by-stage updates. See exactly what the AI is discovering.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* 5-Stage Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The 5-Stage Discovery Process</h2>

                <div className="space-y-6 max-w-4xl mx-auto">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Root Folder Selection</h3>
                        <p className="text-foreground/80 mb-4">
                          AI analyzes your directory structure (up to 2 levels deep) to identify relevant project areas.
                          Uses hierarchical intelligence to select parent folders vs. subdirectories.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Hierarchical directory analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Smart parent/subdirectory selection</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Avoids redundant nested selections</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Regex Pattern Generation & Filtering</h3>
                        <p className="text-foreground/80 mb-4">
                          Generates intelligent regex patterns and performs initial file filtering. Integrates with git to
                          respect .gitignore rules and filter binary files.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Dynamic regex pattern creation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Git ls-files integration</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Binary file detection and exclusion</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">AI File Relevance Assessment</h3>
                        <p className="text-foreground/80 mb-4">
                          Deep content analysis using LLM to assess file relevance to your task. Uses intelligent batching
                          with content-aware token estimation for optimal processing.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Content-based relevance scoring</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Intelligent token-aware batching</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>2000-token overhead management</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Extended Path Discovery</h3>
                        <p className="text-foreground/80 mb-4">
                          Discovers additional contextually relevant files through relationship analysis. Analyzes imports,
                          configurations, and project structure to find related files.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Import statement analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Dependency graph traversal</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Configuration file discovery</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        5
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Path Validation & Correction</h3>
                        <p className="text-foreground/80 mb-4">
                          Validates file paths and corrects inconsistencies. Ensures all discovered files exist, are accessible,
                          and have normalized paths for cross-platform compatibility.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>File existence validation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Path normalization</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Symbolic link resolution</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Technical Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Advanced Discovery Capabilities</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Target className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Smart Token Management</h3>
                        <p className="text-foreground/80 mb-4">
                          Content-aware token estimation optimizes batching. Different ratios for JSON/XML (5 chars/token),
                          code (3 chars/token), and text (4 chars/token) ensure efficient processing.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>Dynamic chunk sizing per file type</li>
                          <li>2000-token prompt overhead reservation</li>
                          <li>Batch processing (100 files default)</li>
                          <li>30-second file caching TTL</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Workflow className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Distributed Workflow Orchestration</h3>
                        <p className="text-foreground/80 mb-4">
                          WorkflowOrchestrator manages lifecycle with lazy initialization, dependency scheduling, and
                          orphaned job recovery. Each stage runs as an independent background job.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>Stage dependency management</li>
                          <li>Event-driven progress updates via Tauri</li>
                          <li>WorkflowIntermediateData persistence</li>
                          <li>Exponential backoff retry logic</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <GitBranch className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Git Repository Integration</h3>
                        <p className="text-foreground/80 mb-4">
                          Executes `git ls-files --cached --others --exclude-standard` to respect .gitignore rules.
                          Falls back to git2 library if command fails.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>Git ls-files with .gitignore respect</li>
                          <li>Binary file detection and filtering</li>
                          <li>Extension-based exclusion (97 types)</li>
                          <li>Content analysis for binary detection</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Layers className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Implementation Plan Integration</h3>
                        <p className="text-foreground/80 mb-4">
                          Discovered files feed directly into the implementation planning system. Context is preserved
                          and optimized for plan generation, ensuring comprehensive and accurate results.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>Seamless plan generation integration</li>
                          <li>Context preservation across sessions</li>
                          <li>Multi-model plan generation support</li>
                          <li>Architectural synthesis preparation</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Cost and Performance */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Cost-Effective and Fast</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-green-500/5 dark:bg-green-900/30 border-green-500/20 dark:border-green-400/30">
                    <DollarSign className="w-8 h-8 text-green-600 dark:text-green-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-green-700 dark:text-green-200">Typical Cost</h3>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-300 mb-2">$0.10-0.15</div>
                    <p className="text-green-700/70 dark:text-green-200/90 text-sm">
                      Per workflow run. Smart token optimization keeps costs minimal while maximizing discovery quality.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6 bg-blue-500/5 dark:bg-blue-900/30 border-blue-500/20 dark:border-blue-400/30">
                    <Zap className="w-8 h-8 text-blue-600 dark:text-blue-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-blue-700 dark:text-blue-200">Processing Time</h3>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-300 mb-2">Variable</div>
                    <p className="text-blue-700/70 dark:text-blue-200/90 text-sm">
                      Depends on repository size and complexity. Real-time progress tracking with stage-by-stage updates.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6 bg-purple-500/5 dark:bg-purple-900/30 border-purple-500/20 dark:border-purple-400/30">
                    <Target className="w-8 h-8 text-purple-600 dark:text-purple-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-purple-700 dark:text-purple-200">Accuracy Rate</h3>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-300 mb-2">High</div>
                    <p className="text-purple-700/70 dark:text-purple-200/90 text-sm">
                      Multi-stage refinement with AI-powered relevance assessment and relationship analysis.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Call to Action */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience Intelligent File Discovery</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Let AI navigate your codebase intelligently. From repository analysis to implementation-ready context,
                    this is how file discovery should work - smart, efficient, cost-effective.
                  </p>

                  <PlatformDownloadSection location="file_discovery_feature" redirectToDownloadPage />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      See implementation planning
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs/file-discovery">
                      Read technical documentation
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