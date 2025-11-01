import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legacy Code Refactoring Tools - AI-Powered Planning for Safe Modernization',
  description: 'Refactor legacy code safely with AI planning. Map dependencies, generate migration strategies, and modernize 100K+ line codebases without breaking production.',
  keywords: [
    'legacy code refactoring tools',
    'legacy code refactoring',
    'refactor legacy code',
    'modernize legacy code',
    'ai refactoring',
    'code modernization',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
      'en': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
      'x-default': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    },
  },
  openGraph: {
    title: 'Legacy Code Refactoring Tools - AI-Powered Planning for Safe Modernization',
    description: 'Refactor legacy code safely with AI planning. Map dependencies, generate migration strategies without breaking production.',
    url: 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - Legacy Code Refactoring',
    }],
  },
};

export default function LegacyCodeRefactoringPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            Legacy Code Refactoring Tools: How AI Planning Prevents Disasters
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            Legacy code is where AI-assisted refactoring becomes dangerous. One wrong move breaks production.
            Here's how to modernize 100K+ line codebases safely with AI planning.
          </p>

          <GlassCard className="my-8 bg-red-500/10 border-red-500/20">
            <h2 className="text-2xl font-bold mb-4">The Legacy Code Challenge</h2>
            <p className="mb-0">
              You're tasked with modernizing a 5-year-old codebase: outdated frameworks, no tests, undocumented
              patterns, and critical business logic you don't fully understand. Direct AI refactoring would be chaos.
              Planning gives you a roadmap.
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Why Legacy Code Breaks Easily</h2>

          <p>Legacy codebases have characteristics that make refactoring risky:</p>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">🔗 Hidden Dependencies</h3>
              <p className="text-sm">
                Functions called from 20+ places, global state modified unexpectedly, circular imports you
                didn't know existed.
              </p>
            </GlassCard>

            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">📄 Poor Documentation</h3>
              <p className="text-sm">
                No comments, cryptic variable names, business logic buried in implementation details.
                You learn by breaking things.
              </p>
            </GlassCard>

            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">🧪 Insufficient Tests</h3>
              <p className="text-sm">
                30% code coverage, tests that pass but don't actually verify behavior, integration tests
                that take 45 minutes to run.
              </p>
            </GlassCard>

            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">⚙️ Outdated Patterns</h3>
              <p className="text-sm">
                Code written before modern best practices. Callback hell, tightly-coupled modules, no
                separation of concerns.
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Common Legacy Refactoring Scenarios</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">1. Framework Migration (jQuery → React)</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> 200 pages of spaghetti jQuery manipulating DOM directly. No component
              structure. Mixed concerns everywhere.
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">Planning Approach:</p>
              <ul className="text-sm space-y-1 mb-0">
                <li>• Map all jQuery selectors to identify UI components</li>
                <li>• Group related DOM manipulations into logical components</li>
                <li>• Plan gradual migration: one page at a time, both frameworks coexisting</li>
                <li>• Create adapter layer for shared state during transition</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">2. Monolith to Microservices</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> 500K-line monolith, all features tightly coupled. Need to extract user
              management to separate service.
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">Planning Approach:</p>
              <ul className="text-sm space-y-1 mb-0">
                <li>• Identify service boundary: what stays, what moves</li>
                <li>• Map all cross-boundary data flows and API calls</li>
                <li>• Plan database extraction strategy (dual-write phase)</li>
                <li>• Create rollback plan for each migration step</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">3. Database Schema Migration</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> Denormalized schema from 2018. Need to split user_data table into 5
              normalized tables.
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">Planning Approach:</p>
              <ul className="text-sm space-y-1 mb-0">
                <li>• Find all queries reading from user_data (grep + static analysis)</li>
                <li>• Map which queries need which new tables</li>
                <li>• Plan zero-downtime migration with dual-write phase</li>
                <li>• Create verification queries to ensure data consistency</li>
              </ul>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Planning-First Refactoring Workflow</h2>

          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h3 className="text-xl font-semibold mb-4">The Safe Legacy Refactoring Process</h3>
            <ol className="space-y-4 mb-0">
              <li>
                <strong className="text-primary">1. Map the existing system</strong>
                <p className="text-sm text-foreground/80">Run file discovery, identify all files touching the area you're refactoring.
                Understand dependencies before changing anything.</p>
              </li>
              <li>
                <strong className="text-primary">2. Generate multiple migration strategies</strong>
                <p className="text-sm text-foreground/80">Ask AI for 3 different approaches: big-bang migration, gradual rollout,
                strangler fig pattern. Compare trade-offs.</p>
              </li>
              <li>
                <strong className="text-primary">3. Create incremental plan</strong>
                <p className="text-sm text-foreground/80">Break into weekly milestones. Each step must be independently deployable
                and testable. No "half-migrated" states in production.</p>
              </li>
              <li>
                <strong className="text-primary">4. Review with team (required for legacy)</strong>
                <p className="text-sm text-foreground/80">Someone on the team knows the hidden gotchas. Plan review surfaces that
                tribal knowledge before you break things.</p>
              </li>
              <li>
                <strong className="text-primary">5. Execute with rollback plan</strong>
                <p className="text-sm text-foreground/80">Implement step 1, verify it works, then step 2. Always have a way to revert.
                Feature flags are your friend.</p>
              </li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Real Example: React Class to Hooks Migration</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">Scenario</h3>
            <p className="mb-4">
              <strong>Codebase:</strong> 150 React class components written in 2018. Need to modernize to
              hooks for maintainability and performance.
            </p>

            <div className="mb-4">
              <h4 className="font-semibold mb-2">Without Planning:</h4>
              <div className="bg-red-500/10 rounded-lg p-3">
                <ul className="text-sm space-y-1 mb-0">
                  <li>• AI converts 10 components</li>
                  <li>• Breaks lifecycle dependencies other components rely on</li>
                  <li>• Context providers stop working (class-based APIs)</li>
                  <li>• 3 days of debugging to find all breakages</li>
                </ul>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">With Planning:</h4>
              <div className="bg-primary/10 rounded-lg p-3">
                <ul className="text-sm space-y-1 mb-0">
                  <li>• Week 1: Migrate leaf components (no dependencies on them)</li>
                  <li>• Week 2: Migrate context providers (affects all consumers)</li>
                  <li>• Week 3: Migrate container components (orchestrate children)</li>
                  <li>• Week 4: Remove old HOCs, fully hooks-based</li>
                  <li>• <strong>Result:</strong> Clean migration, no production breaks, 4-week timeline</li>
                </ul>
              </div>
            </div>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Tools for Legacy Code Planning</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🗺️ Dependency Mapping</h3>
              <p className="text-sm mb-2">
                Find all import chains, function call graphs, type dependencies. Know what breaks if you change X.
              </p>
              <p className="text-xs text-foreground/60">
                Tools: PlanToCode file discovery, madge, dependency-cruiser
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">📊 Code Complexity Analysis</h3>
              <p className="text-sm mb-2">
                Identify which files are most complex (cyclomatic complexity). Start refactoring the simple ones.
              </p>
              <p className="text-xs text-foreground/60">
                Tools: SonarQube, ESLint complexity rules
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🧪 Test Coverage Reports</h3>
              <p className="text-sm mb-2">
                Know which code has tests before refactoring. Write tests for critical paths first if needed.
              </p>
              <p className="text-xs text-foreground/60">
                Tools: Jest coverage, Istanbul, Codecov
              </p>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🎯 Static Analysis</h3>
              <p className="text-sm mb-2">
                Find unused code, dead imports, type mismatches. Clean these up before major refactoring.
              </p>
              <p className="text-xs text-foreground/60">
                Tools: TypeScript strict mode, ESLint no-unused-vars
              </p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Migration Strategy Patterns</h2>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">1. Strangler Fig Pattern</h3>
            <p className="text-sm mb-3">
              <strong>How it works:</strong> Build new code alongside old. Gradually route traffic from old to new.
              Delete old code only when 100% migrated.
            </p>
            <p className="text-sm">
              <strong>Best for:</strong> Monolith → microservices, old framework → new framework
            </p>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">2. Feature Flag Rollout</h3>
            <p className="text-sm mb-3">
              <strong>How it works:</strong> Refactor code, put behind feature flag. Roll out to 1%, 10%, 50%, 100%
              of users over weeks. Instant rollback if issues.
            </p>
            <p className="text-sm">
              <strong>Best for:</strong> High-risk changes to critical paths (auth, payments, core features)
            </p>
          </GlassCard>

          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">3. Parallel Run + Validation</h3>
            <p className="text-sm mb-3">
              <strong>How it works:</strong> Run old and new code in parallel. Compare outputs. Switch to new only
              when 99.9% match rate achieved.
            </p>
            <p className="text-sm">
              <strong>Best for:</strong> Data processing pipelines, critical algorithms, reporting systems
            </p>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">Avoiding Common Legacy Refactoring Mistakes</h2>

          <div className="space-y-4 my-8">
            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ Big Bang Rewrites</h3>
              <p className="text-sm">
                Spending 6 months rewriting everything from scratch. 80% done, realize old code had edge cases
                you didn't know about. Project fails.
              </p>
              <p className="text-sm mt-2 font-semibold">✓ Instead: Incremental refactoring with continuous deployment</p>
            </GlassCard>

            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ Refactoring Without Tests</h3>
              <p className="text-sm">
                Change code, hope it works, deploy, find bugs in production. Repeat until trust is lost.
              </p>
              <p className="text-sm mt-2 font-semibold">✓ Instead: Write characterization tests first, then refactor</p>
            </GlassCard>

            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ No Rollback Plan</h3>
              <p className="text-sm">
                Refactor 50 files, deploy, breaks production. Can't easily revert because changes are entangled.
              </p>
              <p className="text-sm mt-2 font-semibold">✓ Instead: Feature flags, database migrations with down() functions</p>
            </GlassCard>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Getting Started with Legacy Refactoring</h2>

          <ol className="space-y-4 my-8">
            <li>
              <strong>1. Pick the smallest valuable unit to refactor</strong>
              <p className="text-foreground/80 text-sm">
                Don't start with the 10,000-line God class. Find a self-contained 200-line module that delivers value.
              </p>
            </li>
            <li>
              <strong>2. Map all its dependencies</strong>
              <p className="text-foreground/80 text-sm">
                Use file discovery to find imports, exports, function calls. Know the blast radius.
              </p>
            </li>
            <li>
              <strong>3. Write characterization tests</strong>
              <p className="text-foreground/80 text-sm">
                Tests that capture current behavior, even if it's wrong. Ensures refactoring preserves functionality.
              </p>
            </li>
            <li>
              <strong>4. Generate refactoring plan</strong>
              <p className="text-foreground/80 text-sm">
                Use AI to create file-by-file migration strategy. Review for missing steps or risks.
              </p>
            </li>
            <li>
              <strong>5. Execute incrementally</strong>
              <p className="text-foreground/80 text-sm">
                One small change per deploy. Run tests. Monitor production. Repeat.
              </p>
            </li>
          </ol>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Modernize Legacy Code Safely</h3>
            <p className="text-foreground/80 mb-6">
              PlanToCode helps you map dependencies, generate migration plans, and refactor without breaking production.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Download PlanToCode
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs/file-discovery"
                className="inline-flex items-center"
              >
                Learn About Dependency Mapping
              </LinkWithArrow>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Further Reading</h2>

          <ul className="space-y-2">
            <li>
              <LinkWithArrow href="/solutions/safe-refactoring">
                Safe Refactoring Tools for Production Code
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/blog/what-is-ai-code-planning">
                What is AI Code Planning?
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/blog/ai-code-planning-best-practices">
                AI Code Planning Best Practices
              </LinkWithArrow>
            </li>
          </ul>

          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Published:</strong> November 2025 | <strong>Last Updated:</strong> November 2025
          </p>
        </article>
      </main>
    </div>
  );
}
