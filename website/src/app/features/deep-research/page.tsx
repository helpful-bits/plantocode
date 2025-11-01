import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Search, Globe, Database, Brain, Zap, Shield, CheckCircle2, Network, TrendingUp, FileText, Filter, Clock } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Deep research - web search for developers | PlanToCode',
  description: 'AI-powered research assistant that generates sophisticated research queries and executes parallel research tasks. Context-aware analysis with project integration for comprehensive, development-focused insights.',
  keywords: [
    'ai web search',
    'intelligent research',
    'information synthesis',
    'source verification',
    'credibility analysis',
    'multi-source research',
    'development research',
    'smart query generation',
    'real-time search',
    'research workflow',
    'web intelligence',
    'ai research assistant',
  ],
  openGraph: {
    title: 'Deep Research - Intelligent Web Search for Development',
    description: 'AI-powered research assistant with intelligent query generation and parallel research execution. Transform your development workflow with context-aware research insights.',
    url: 'https://www.plantocode.com/features/deep-research',
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
    canonical: 'https://www.plantocode.com/features/deep-research',
    languages: {
      'en-US': 'https://www.plantocode.com/features/deep-research',
      'en': 'https://www.plantocode.com/features/deep-research',
    },
  },
};

export default function DeepResearchPage() {
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
                  <Search className="w-4 h-4" />
                  <span>AI-Powered Research Intelligence</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Deep research - from query to insight
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Generate smart queries, run searches, and pull relevant findings into your task - no fluff.
                </p>
              </div>

              {/* Core Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Intelligent Query Generation</h3>
                    <p className="text-foreground/80 text-sm">
                      AI expands your research queries with context-aware variations. Multi-angle exploration for comprehensive coverage.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Network className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Parallel Research Execution</h3>
                    <p className="text-foreground/80 text-sm">
                      Execute multiple sophisticated research tasks concurrently. AI synthesizes findings into actionable development insights.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Shield className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Project Context Integration</h3>
                    <p className="text-foreground/80 text-sm">
                      Research is tailored to your specific project structure, technology stack, and development context for maximum relevance.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Research Intelligence System */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Research Intelligence Engine</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Search className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Smart Query Expansion</h3>
                        <p className="text-foreground/80 mb-4">
                          AI analyzes your initial query and generates strategic variations for comprehensive research coverage.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Context-aware query variations</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Semantic synonym expansion</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Domain-specific terminology</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Multi-perspective research angles</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Globe className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">AI Research Execution</h3>
                        <p className="text-foreground/80 mb-4">
                          Sophisticated AI models execute research tasks in parallel, providing comprehensive analysis and insights.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Parallel research task execution</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Streaming results with progress tracking</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Context-aware analysis and synthesis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Development-focused insights</span>
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
                        <h3 className="text-xl font-bold mb-3">AI Research Synthesis</h3>
                        <p className="text-foreground/80 mb-4">
                          Advanced AI models analyze your project context and generate targeted research insights tailored to your development needs.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project-aware research generation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Context-sensitive analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Development-focused insights</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Implementation-ready recommendations</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Context Integration</h3>
                        <p className="text-foreground/80 mb-4">
                          Research results are automatically integrated with your task description, enriching it with relevant findings and recommendations.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Automatic task enhancement</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Structured result formatting</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Implementation plan integration</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Development workflow alignment</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Research Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Two-Stage AI Research Process</h2>

                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Research Query Generation</h3>
                        <p className="text-foreground/80">
                          AI analyzes your task description and project context to generate sophisticated research queries. Creates multiple strategic research angles for comprehensive coverage.
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
                        <h3 className="font-semibold mb-2">Parallel Research Execution</h3>
                        <p className="text-foreground/80">
                          Multiple AI models execute research tasks concurrently, each focusing on different aspects of your requirements. Results are synthesized into actionable development insights.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Development Integration */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Development-Focused Research</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Implementation-Ready Insights</h3>
                        <p className="text-foreground/80 mb-4">
                          Research results optimized for development workflows. Code examples, API documentation, and best practices.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Code snippet extraction</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>API reference compilation</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Architecture pattern analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Performance consideration notes</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Filter className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Context-Aware Filtering</h3>
                        <p className="text-foreground/80 mb-4">
                          Research scope automatically adjusted based on your project context and development stack.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Technology stack awareness</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Version compatibility checking</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Project requirements filtering</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Scalability consideration priority</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* AI Research Features */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">AI Research Capabilities</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Multi-Model Research</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Leverages multiple AI models to execute research tasks with different perspectives and expertise areas.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">OpenAI GPT Models</div>
                      <div className="text-yellow-400">Anthropic Claude</div>
                      <div className="text-cyan-400">Google Gemini</div>
                      <div className="text-purple-400">Specialized Research Models</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Project Context Analysis</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      AI analyzes your project structure, technology stack, and codebase to generate highly relevant research.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">File Structure Analysis</div>
                      <div className="text-yellow-400">Technology Stack Detection</div>
                      <div className="text-red-400">Dependency Mapping</div>
                      <div className="text-cyan-400">Context-Aware Insights</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">Parallel Processing</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Execute multiple research tasks simultaneously with intelligent result aggregation and synthesis.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Concurrent Execution</div>
                      <div className="text-yellow-400">Progress Tracking</div>
                      <div className="text-orange-400">Error Recovery</div>
                      <div className="text-cyan-400">Result Synthesis</div>
                    </div>
                  </GlassCard>
                </div>
              </div>


              {/* Advanced Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Advanced Research Capabilities</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Intelligent Query Design</h3>
                    <p className="text-foreground/80 text-sm">
                      AI crafts sophisticated research queries that explore multiple angles and perspectives for comprehensive coverage.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Context-Aware Analysis</h3>
                    <p className="text-foreground/80 text-sm">
                      Research is tailored to your specific project context, technology stack, and development requirements.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Background Processing</h3>
                    <p className="text-foreground/80 text-sm">
                      Long-running research tasks execute in the background with real-time progress updates and notifications.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Result Integration</h3>
                    <p className="text-foreground/80 text-sm">
                      Research findings are automatically formatted and integrated into your task descriptions for immediate use.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Cost Optimization</h3>
                    <p className="text-foreground/80 text-sm">
                      Intelligent model selection and query optimization to balance research quality with cost efficiency.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Progress Monitoring</h3>
                    <p className="text-foreground/80 text-sm">
                      Real-time tracking of research progress with detailed status updates and completion notifications.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Your Research Workflow</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From intelligent queries to synthesized insights, integrated with your development workflow.
                    This is how research should work - comprehensive, intelligent, actionable.
                  </p>

                  <PlatformDownloadSection location="features_deep_research" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      See implementation planning
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/text-improvement">
                      Explore text enhancement
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