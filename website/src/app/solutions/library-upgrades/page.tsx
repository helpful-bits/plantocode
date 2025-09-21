import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { ChevronRight, Package, TrendingUp, Clock, Shield, DollarSign } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Accelerate Library Upgrades - Vibe Manager AI Architect Studio',
  description: 'Accelerate upgrade planning while minimizing risk. AI-powered planning delivers faster, safer technology updates for development teams.',
  keywords: [
    'library upgrade acceleration',
    'development team productivity',
    'upgrade risk reduction',
    'technology migration',
    'development cost savings',
    'upgrade planning efficiency',
    'team performance optimization',
  ],
  openGraph: {
    title: 'Accelerate Library Upgrades - Vibe Manager',
    description: 'Transform your upgrade process. Accelerate upgrade planning, minimize risks, and free developers to focus on innovation.',
    url: 'https://www.vibemanager.app/solutions/library-upgrades',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/solutions/library-upgrades',
  },
};

export default function LibraryUpgradesPage() {
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
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 text-purple-500 mb-6 text-sm font-medium">
                  <Package className="w-4 h-4" />
                  <span>For Complex Upgrades</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight pb-2 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Accelerate Library Upgrades
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Accelerate upgrade planning while minimizing risk. AI-powered planning delivers faster, safer technology updates for your development teams.
                </p>
              </div>

              {/* Business Challenges */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Hidden Cost of Upgrades</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-purple-500">Extended Development Cycles</h3>
                    <p className="text-foreground/80">
                      Teams spend weeks planning upgrades that should take days. This delays feature development and impacts delivery timelines.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-purple-500">Production Risks</h3>
                    <p className="text-foreground/80">
                      Incomplete planning leads to unexpected failures, hotfixes, and potential downtime - all costly for business operations.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-purple-500">Resource Drain</h3>
                    <p className="text-foreground/80">
                      Senior developers get stuck on upgrade research instead of building features, reducing team productivity and innovation.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Value Propositions */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Transform Your Upgrade Process</h2>

                <div className="space-y-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Clock className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Accelerated Planning Phase</h3>
                        <p className="text-foreground/80 mb-4">
                          Streamline upgrade planning from weeks to hours. AI comprehensively analyzes your codebase to identify all affected areas and provide clear migration strategies.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Accelerated upgrade planning cycles</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Comprehensive impact assessments</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Clear prioritization of upgrade tasks</span>
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
                        <h3 className="text-xl font-bold mb-3">Risk Mitigation Strategy</h3>
                        <p className="text-foreground/80 mb-4">
                          Minimize upgrade failures with comprehensive risk analysis. Multiple AI perspectives identify potential issues before they impact production systems.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Reduced upgrade risks</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Proactive identification of breaking changes</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Validated rollback procedures included</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Team Productivity Gains</h3>
                        <p className="text-foreground/80 mb-4">
                          Free senior developers from upgrade research to focus on feature development. Standardize upgrade processes across teams for consistent results.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Improved team productivity</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Consistent upgrade quality across projects</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Knowledge sharing and best practices</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Business Benefits */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Key Business Benefits</h2>

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                  <GlassCard className="p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <DollarSign className="w-6 h-6 text-green-500" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold">Cost Benefits</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="border-l-4 border-primary pl-4">
                        <div className="text-xl sm:text-2xl font-bold text-primary">Significant</div>
                        <div className="text-xs sm:text-sm text-foreground/70">Annual savings per development team</div>
                      </div>
                      <div className="border-l-4 border-primary pl-4">
                        <div className="text-xl sm:text-2xl font-bold text-primary">Reduced</div>
                        <div className="text-xs sm:text-sm text-foreground/70">Upgrade-related overtime and stress</div>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <TrendingUp className="w-6 h-6 text-blue-500" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold">Process Improvements</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="border-l-4 border-primary pl-4">
                        <div className="text-xl sm:text-2xl font-bold text-primary">Streamlined</div>
                        <div className="text-xs sm:text-sm text-foreground/70">Upgrade processes</div>
                      </div>
                      <div className="border-l-4 border-primary pl-4">
                        <div className="text-xl sm:text-2xl font-bold text-primary">Better</div>
                        <div className="text-xs sm:text-sm text-foreground/70">Upgrade success rates</div>
                      </div>
                    </div>
                  </GlassCard>
                </div>

                <GlassCard className="p-8" highlighted>
                  <h3 className="text-xl font-bold mb-6 text-center">Real-World Success Stories</h3>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="text-center p-4">
                      <div className="text-base sm:text-lg font-semibold text-primary mb-2">E-commerce Platform</div>
                      <div className="text-xs sm:text-sm text-foreground/70">React 16 → 18 upgrade completed in 3 days instead of planned 3 weeks</div>
                    </div>
                    <div className="text-center p-4">
                      <div className="text-base sm:text-lg font-semibold text-primary mb-2">Financial Services</div>
                      <div className="text-xs sm:text-sm text-foreground/70">Angular upgrade with zero production incidents across 15 applications</div>
                    </div>
                    <div className="text-center p-4 sm:col-span-2 md:col-span-1">
                      <div className="text-base sm:text-lg font-semibold text-primary mb-2">Healthcare Tech</div>
                      <div className="text-xs sm:text-sm text-foreground/70">Node.js upgrade saved 200+ developer hours of manual analysis</div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-6 sm:p-8 md:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Start Upgrading Faster Today</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Transform your team's upgrade process. Accelerate planning, minimize risks, and free your developers to focus on innovation instead of upgrade research.
                  </p>

                  <PlatformDownloadSection location="solutions_library_upgrades" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm text-foreground/60">
                    <span className="text-center">Accelerated planning</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="text-center">Reduced incidents</span>
                    <span className="hidden sm:inline">•</span>
                    <Link href="/docs" className="text-primary hover:underline text-center">Implementation guide →</Link>
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