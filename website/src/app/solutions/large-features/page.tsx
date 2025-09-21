import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { ChevronRight, Target, TrendingUp, Users, CheckCircle, Clock, Shield } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Large Feature Delivery Success - Vibe Manager',
  description: 'Ensure predictable delivery of complex features with coordinated team execution, project continuity assurance, and stakeholder confidence. Reduce project overruns and improve estimation accuracy.',
  keywords: [
    'feature delivery success',
    'project management',
    'delivery predictability',
    'team coordination',
    'project continuity',
    'estimation accuracy',
    'stakeholder communication',
  ],
  openGraph: {
    title: 'Large Feature Delivery Success - Vibe Manager',
    description: 'Transform complex feature delivery with predictable timelines and coordinated team execution.',
    url: 'https://www.vibemanager.app/solutions/large-features',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/solutions/large-features',
  },
};

export default function LargeFeaturesPage() {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Target className="w-4 h-4" />
                  <span>Feature Delivery Success</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight pb-2 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Predictable Large Feature Delivery
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Transform complex feature delivery with coordinated team execution, project continuity assurance, and predictable delivery timelines that stakeholders can trust.
                </p>
              </div>

              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Large Features Fail to Deliver</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-red-500">Project Overruns</h3>
                    <p className="text-foreground/80">
                      Complex features consistently exceed time and budget estimates. Poor planning visibility leads to scope creep and missed deadlines that impact business objectives.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-red-500">Team Coordination Failures</h3>
                    <p className="text-foreground/80">
                      Team members work in isolation without shared understanding. Communication gaps and conflicting approaches create rework, delays, and frustrated stakeholders.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-red-500">Lost Momentum</h3>
                    <p className="text-foreground/80">
                      Project interruptions destroy weeks of progress. Team knowledge gets scattered, decisions are forgotten, and projects stall waiting for context to be rebuilt.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Business Benefits */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How Vibe Manager Ensures Delivery Success</h2>

                <div className="space-y-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Clock className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Predictable Delivery Timelines</h3>
                        <p className="text-foreground/80 mb-4">
                          Structured planning creates realistic timelines that stakeholders can trust. Comprehensive analysis eliminates hidden complexity that derails schedules.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>More accurate project planning</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Dependency mapping prevents surprise blockers</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Milestone visibility for stakeholder confidence</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Coordinated Team Execution</h3>
                        <p className="text-foreground/80 mb-4">
                          Shared understanding ensures everyone works toward the same vision. Clear responsibility mapping eliminates duplicate work and coordination overhead.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Unified project vision across all team members</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Clear ownership and responsibility mapping</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Seamless handoffs between team members</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Shield className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Project Continuity Assurance</h3>
                        <p className="text-foreground/80 mb-4">
                          Projects survive team changes, interruptions, and organizational shifts. Complete project knowledge is preserved and instantly accessible.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Zero knowledge loss during team transitions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Instant project resumption after interruptions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Complete audit trail for compliance and review</span>
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
                        <h3 className="text-xl font-bold mb-3">Reduced Project Risk</h3>
                        <p className="text-foreground/80 mb-4">
                          Early identification of technical challenges and integration points prevents late-stage surprises that blow budgets and timelines.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Better risk management</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Proactive identification of integration challenges</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Risk mitigation strategies built into timeline</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <CheckCircle className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Enhanced Stakeholder Communication</h3>
                        <p className="text-foreground/80 mb-4">
                          Clear progress visibility and regular milestone updates keep stakeholders informed and confident throughout the delivery process.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time progress tracking and reporting</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Clear milestone definitions and completion criteria</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Transparent risk assessment and mitigation plans</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Success Benefits */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Key Project Delivery Improvements</h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 sm:gap-8">
                    <div className="text-center">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 mb-3 mx-auto w-fit">
                        <Clock className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-base sm:text-lg font-semibold mb-2">More Accurate Planning</div>
                      <div className="text-sm text-foreground/70">Realistic timeline estimates based on comprehensive analysis</div>
                    </div>

                    <div className="text-center">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 mb-3 mx-auto w-fit">
                        <Shield className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-base sm:text-lg font-semibold mb-2">Better Risk Management</div>
                      <div className="text-sm text-foreground/70">Early identification and mitigation of project risks</div>
                    </div>

                    <div className="text-center">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 mb-3 mx-auto w-fit">
                        <Users className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-base sm:text-lg font-semibold mb-2">Improved Team Coordination</div>
                      <div className="text-sm text-foreground/70">Unified understanding and seamless collaboration</div>
                    </div>

                    <div className="text-center">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 mb-3 mx-auto w-fit">
                        <TrendingUp className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-base sm:text-lg font-semibold mb-2">Enhanced Project Visibility</div>
                      <div className="text-sm text-foreground/70">Clear progress tracking and milestone transparency</div>
                    </div>

                    <div className="text-center">
                      <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 mb-3 mx-auto w-fit">
                        <CheckCircle className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-base sm:text-lg font-semibold mb-2">Stronger Stakeholder Communication</div>
                      <div className="text-sm text-foreground/70">Regular updates and transparent project status</div>
                    </div>
                  </div>

                  <div className="mt-12 space-y-6">
                    <h3 className="text-xl font-bold text-center mb-6">What Project Managers Are Saying</h3>

                    <div className="space-y-4">
                      <blockquote className="p-6 bg-primary/5 rounded-lg border-l-4 border-primary">
                        <p className="text-foreground/80 mb-3">"For the first time in years, our large feature estimates actually match reality. Stakeholders trust our timelines because we deliver on them."</p>
                        <cite className="text-sm text-foreground/60">— Senior Engineering Manager, FinTech</cite>
                      </blockquote>

                      <blockquote className="p-6 bg-primary/5 rounded-lg border-l-4 border-primary">
                        <p className="text-foreground/80 mb-3">"We went from 'project archaeology' after team changes to instant knowledge transfer. Projects survive personnel transitions seamlessly."</p>
                        <cite className="text-sm text-foreground/60">— VP Engineering, SaaS Platform</cite>
                      </blockquote>

                      <blockquote className="p-6 bg-primary/5 rounded-lg border-l-4 border-primary">
                        <p className="text-foreground/80 mb-3">"The reduction in late-stage surprises transformed our relationship with business stakeholders. They see us as predictable delivery partners now."</p>
                        <cite className="text-sm text-foreground/60">— Director of Engineering, E-commerce</cite>
                      </blockquote>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Your Feature Delivery Success</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Join engineering teams who deliver complex features on time, on budget, with predictable outcomes that build stakeholder confidence.
                  </p>

                  <PlatformDownloadSection location="solutions_large_features" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-sm text-foreground/60">
                    <span>$10 free credits</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Start delivering predictably today</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Professional success programs available</span>
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