import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { ChevronRight, TrendingDown, Clock, DollarSign, Users, Shield, Target } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Hard Bugs Cost Business - Vibe Manager AI Architect Studio',
  description: 'Improve debugging efficiency and system reliability with AI-powered bug resolution. Faster bug identification and comprehensive debugging workflows.',
  keywords: [
    'debugging costs',
    'reduce MTTR',
    'bug resolution time',
    'downtime prevention',
    'developer productivity',
    'debugging efficiency',
    'business continuity',
  ],
  openGraph: {
    title: 'Hard Bugs Cost Business - Vibe Manager',
    description: 'AI-powered bug resolution that reduces debugging costs and eliminates downtime.',
    url: 'https://www.vibemanager.app/solutions/hard-bugs',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/solutions/hard-bugs',
  },
};

export default function HardBugsPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-4xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 text-red-500 mb-6 text-sm font-medium">
                  <TrendingDown className="w-4 h-4" />
                  <span>Business Impact</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight pb-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 dark:from-red-400 dark:via-orange-400 dark:to-yellow-400 bg-clip-text text-transparent">
                  Hard Bugs Cost Business
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Every hour spent debugging impacts your team's productivity. Improve bug identification, streamline debugging workflows, and keep your team focused with AI-powered bug resolution.
                </p>
              </div>

              {/* Business Impact */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Real Cost of Debugging</h2>
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <DollarSign className="w-6 h-6 text-red-500" />
                      <h3 className="text-lg font-semibold text-red-500">Revenue Loss</h3>
                    </div>
                    <p className="text-2xl font-bold mb-2">High Impact</p>
                    <p className="text-foreground/80">
                      Critical bugs can cause system downtime, affecting customer experience and business operations.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-6 h-6 text-orange-500" />
                      <h3 className="text-lg font-semibold text-orange-500">Developer Time</h3>
                    </div>
                    <p className="text-2xl font-bold mb-2">Extended Time</p>
                    <p className="text-foreground/80">
                      Complex bugs can take significant time to identify and resolve, pulling developers away from feature development.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-6 h-6 text-yellow-500" />
                      <h3 className="text-lg font-semibold text-yellow-500">Team Morale</h3>
                    </div>
                    <p className="text-2xl font-bold mb-2">Frustration</p>
                    <p className="text-foreground/80">
                      Repetitive debugging tasks and unclear error sources can lead to developer frustration and reduced job satisfaction.
                    </p>
                  </GlassCard>
                </div>

                <GlassCard className="p-8 bg-gradient-to-r from-red-500/5 to-orange-500/5 border-red-500/20">
                  <div className="text-center">
                    <h3 className="text-xl font-bold mb-4">Hidden Debugging Costs</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                      <div>
                        <p className="font-semibold text-red-500">Context Switching</p>
                        <p className="text-foreground/70">Lost momentum when debugging sessions restart</p>
                      </div>
                      <div>
                        <p className="font-semibold text-orange-500">Knowledge Loss</p>
                        <p className="text-foreground/70">What was tried before gets forgotten</p>
                      </div>
                      <div>
                        <p className="font-semibold text-yellow-500">Opportunity Cost</p>
                        <p className="text-foreground/70">Features delayed while fixing bugs</p>
                      </div>
                      <div>
                        <p className="font-semibold text-green-500">Customer Trust</p>
                        <p className="text-foreground/70">Recurring issues damage reliability reputation</p>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* Business Solutions */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How We Reduce Your Debugging Costs</h2>

                <div className="space-y-8">
                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/10 flex-shrink-0">
                        <Target className="w-6 h-6 text-green-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Faster Bug Identification and Resolution</h3>
                        <p className="text-foreground/80 mb-4">
                          AI-powered visual analysis captures what traditional debugging misses. No more "it works on my machine" - see exactly what happened and when. Comprehensive debugging workflows help identify issues more efficiently.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div className="bg-green-500/5 rounded-lg p-3">
                            <p className="font-semibold text-green-600">System Reliability</p>
                            <p className="text-foreground/70">Improved bug resolution processes</p>
                          </div>
                          <div className="bg-blue-500/5 rounded-lg p-3">
                            <p className="font-semibold text-blue-600">Team Impact</p>
                            <p className="text-foreground/70">More time for feature development</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex-shrink-0">
                        <Shield className="w-6 h-6 text-blue-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Never Lose Debugging Progress</h3>
                        <p className="text-foreground/80 mb-4">
                          Terminal crashes and lost context cost hours of repeated work. Our system preserves every debugging attempt, ensuring continuity and building institutional knowledge.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div className="bg-purple-500/5 rounded-lg p-3">
                            <p className="font-semibold text-purple-600">Efficiency Gains</p>
                            <p className="text-foreground/70">Reduce context switching overhead</p>
                          </div>
                          <div className="bg-orange-500/5 rounded-lg p-3">
                            <p className="font-semibold text-orange-600">Knowledge Retention</p>
                            <p className="text-foreground/70">Build debugging history for future issues</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/10 flex-shrink-0">
                        <Clock className="w-6 h-6 text-purple-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Faster Issue Resolution</h3>
                        <p className="text-foreground/80 mb-4">
                          Voice-powered debugging and intelligent workflow automation reduce time spent on repetitive tasks. Focus on solving problems, not fighting tools.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div className="bg-teal-500/5 rounded-lg p-3">
                            <p className="font-semibold text-teal-600">Productivity Gain</p>
                            <p className="text-foreground/70">Faster command execution</p>
                          </div>
                          <div className="bg-pink-500/5 rounded-lg p-3">
                            <p className="font-semibold text-pink-600">Workflow Efficiency</p>
                            <p className="text-foreground/70">Automated debugging patterns</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 flex-shrink-0">
                        <Users className="w-6 h-6 text-yellow-500" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Improve Team Morale & Retention</h3>
                        <p className="text-foreground/80 mb-4">
                          Reduce frustrating debugging experiences that lead to burnout. When developers can solve problems efficiently, job satisfaction increases and turnover decreases.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div className="bg-green-500/5 rounded-lg p-3">
                            <p className="font-semibold text-green-600">Team Retention</p>
                            <p className="text-foreground/70">Reduced developer frustration</p>
                          </div>
                          <div className="bg-blue-500/5 rounded-lg p-3">
                            <p className="font-semibold text-blue-600">Satisfaction</p>
                            <p className="text-foreground/70">More time building, less time debugging</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Key Benefits */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12 bg-gradient-to-r from-green-500/5 to-blue-500/5 border-green-500/20">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Key Benefits</h2>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-lg font-bold mb-4 text-blue-500">Improved Debugging Experience</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Faster bug identification and resolution</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Comprehensive debugging workflows</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Better incident response processes</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold mb-4 text-green-500">Team & System Benefits</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Reduced developer frustration</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Improved system reliability</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span>Enhanced development productivity</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Improve Your Debugging Experience</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Streamline your debugging workflows and reduce developer frustration. AI-powered bug resolution that improves system reliability and keeps your team productive.
                  </p>

                  <PlatformDownloadSection location="solutions_hard_bugs" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <span>Faster bug identification</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Improved system reliability</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Better team retention</span>
                    <span className="hidden sm:inline">•</span>
                    <Link href="/schedule" className="text-primary hover:underline">Learn more →</Link>
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