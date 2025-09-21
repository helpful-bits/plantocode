import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { ChevronRight, Wrench, TrendingUp, Clock, DollarSign, Users, Target } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'System Maintenance & Enhancements - Vibe Manager',
  description: 'Transform technical debt into competitive advantage. Reduce maintenance costs, accelerate delivery, and improve developer satisfaction with AI-guided maintenance planning.',
  keywords: [
    'technical debt reduction',
    'development efficiency',
    'maintenance roi',
    'legacy modernization',
    'developer productivity',
    'software quality',
    'maintenance cost reduction',
    'sustainable development',
    'codebase health',
  ],
  openGraph: {
    title: 'System Maintenance & Enhancements - Vibe Manager',
    description: 'Transform technical debt into competitive advantage with AI-guided maintenance planning.',
    url: 'https://www.vibemanager.app/solutions/maintenance-enhancements',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/solutions/maintenance-enhancements',
  },
};

export default function MaintenanceEnhancementsPage() {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 text-orange-500 mb-6 text-sm font-medium">
                  <TrendingUp className="w-4 h-4" />
                  <span>Transform Technical Debt into ROI</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight pb-2 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Maintenance & Enhancements
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Stop letting technical debt slow your team down. AI-guided maintenance planning that delivers measurable business value and sustainable codebase health.
                </p>
              </div>

              {/* Business Impact */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Hidden Cost of Technical Debt</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-5 h-5 text-orange-500" />
                      <h3 className="text-lg font-semibold text-orange-500">Slower Development</h3>
                    </div>
                    <p className="text-foreground/80">
                      Teams spend more time navigating legacy code than building features. Feature delivery slows to a crawl as complexity compounds.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <DollarSign className="w-5 h-5 text-orange-500" />
                      <h3 className="text-lg font-semibold text-orange-500">Higher Maintenance Costs</h3>
                    </div>
                    <p className="text-foreground/80">
                      Bug fixes take longer. Infrastructure becomes fragile. Every change requires extensive testing across brittle dependencies.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Users className="w-5 h-5 text-orange-500" />
                      <h3 className="text-lg font-semibold text-orange-500">Developer Burnout</h3>
                    </div>
                    <p className="text-foreground/80">
                      Talented developers leave when forced to work with unmaintainable code. Hiring becomes harder. Knowledge walks out the door.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Business Value Propositions */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Transform Your Maintenance Approach</h2>

                <div className="space-y-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Strategic Maintenance Planning</h3>
                        <p className="text-foreground/80 mb-4">
                          Stop reactive firefighting. AI analyzes your codebase to create strategic maintenance roadmaps that maximize business impact while minimizing risk.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>ROI-focused prioritization of maintenance tasks</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Risk assessment prevents costly production issues</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Clear business justification for every refactoring</span>
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
                        <h3 className="text-xl font-bold mb-3">Accelerated Development Velocity</h3>
                        <p className="text-foreground/80 mb-4">
                          Well-maintained codebases enable faster feature development. Teams report significantly improved delivery times after systematic debt reduction.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Reduced onboarding time for new developers</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Fewer bugs means less time in QA cycles</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Predictable delivery timelines and estimates</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Wrench className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Sustainable Codebase Health</h3>
                        <p className="text-foreground/80 mb-4">
                          Build maintenance into your development culture. Create systems that prevent technical debt accumulation and maintain long-term code quality.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Standardized patterns reduce cognitive overhead</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Improved developer experience and satisfaction</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Future-proof architecture enables innovation</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* ROI Metrics */}
              <div className="mb-16">
                <GlassCard className="p-8 sm:p-12" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">Quantifiable Business Impact</h2>
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                    <div className="text-center">
                      <div className="text-lg sm:text-xl font-bold text-primary mb-1 sm:mb-2">Faster Feature Delivery</div>
                      <div className="text-sm sm:text-base text-foreground/80">Streamlined development cycles</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg sm:text-xl font-bold text-primary mb-1 sm:mb-2">Reduced Technical Debt</div>
                      <div className="text-sm sm:text-base text-foreground/80">Cleaner, maintainable code</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg sm:text-xl font-bold text-primary mb-1 sm:mb-2">Improved Code Quality</div>
                      <div className="text-sm sm:text-base text-foreground/80">Better reliability and performance</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg sm:text-xl font-bold text-primary mb-1 sm:mb-2">Better Developer Experience</div>
                      <div className="text-sm sm:text-base text-foreground/80">Accelerated team onboarding</div>
                    </div>
                  </div>
                  <div className="text-center text-foreground/70">
                    <p className="mb-4">Teams using systematic maintenance approaches experience meaningful productivity improvements and sustainable development practices.</p>
                    <p className="text-sm">
                      <strong>Long-term benefits:</strong> Reduced infrastructure costs, improved system reliability, and higher developer retention rates.
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Invest in Your Team's Future</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Stop letting technical debt drain your team's productivity. Start building sustainable development practices that deliver measurable ROI.
                  </p>

                  <PlatformDownloadSection location="solutions_maintenance" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <span>Strategic maintenance planning</span>
                    <span className="hidden sm:inline">•</span>
                    <span>Measurable productivity gains</span>
                    <span className="hidden sm:inline">•</span>
                    <Link href="/docs/plan-mode" className="text-primary hover:underline">Learn implementation approach →</Link>
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