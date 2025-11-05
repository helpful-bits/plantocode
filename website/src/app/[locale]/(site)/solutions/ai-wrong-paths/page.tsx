import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { AlertCircle, FileSearch, CheckCircle2, GitBranch, Layers, Shield, Zap, Brain } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Fix AI Wrong File Paths | PlanToCode File Discovery',
  description:
    'Prevent AI from generating wrong import paths and file references. PlanToCode verifies all file paths before execution. Perfect for monorepos and legacy code.',
  keywords: [
    'wrong file path ai',
    'ai hallucination file paths',
    'ai import errors',
    'ai path verification',
    'monorepo ai problems',
    'fix ai wrong paths',
    'ai code generation errors',
    'file path validation',
    'ai context window issues',
    'legacy codebase ai',
  ],
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - Fix AI Wrong File Paths',
    }],
    title: 'Fix AI Wrong File Paths | PlanToCode File Discovery',
    description:
      'Stop AI from generating non-existent import paths. PlanToCode verifies every file reference before execution, preventing hallucinated paths in monorepos and complex codebases.',
    url: 'https://www.plantocode.com/solutions/ai-wrong-paths',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/ai-wrong-paths',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/ai-wrong-paths',
      'en': 'https://www.plantocode.com/solutions/ai-wrong-paths',
    },
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function AIWrongPathsPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 text-red-500 text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  <span>AI path verification</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Stop AI from generating wrong file paths
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  AI tools hallucinate import paths, reference non-existent files, and break your build with phantom dependencies. PlanToCode verifies every file path before execution, eliminating hallucinated references in monorepos and legacy codebases.
                </p>
              </header>

              {/* Problem Section */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">The wrong file path problem</h2>

                <GlassCard className="p-8 bg-red-500/5 border-red-500/20">
                  <div className="flex items-start gap-4 mb-6">
                    <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-xl font-bold mb-3 text-red-700 dark:text-red-400">
                        "AI tried to import from a non-existent path"
                      </h3>
                      <p className="text-foreground/80 mb-4 leading-relaxed">
                        You ask AI to refactor a component. It confidently generates code that imports from
                        <code className="mx-1 px-2 py-0.5 bg-background/50 rounded text-sm font-mono">@/components/ui/NewButton</code>
                        — a file that does not exist. Your build fails. You waste 20 minutes tracking down the phantom import.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-background/30 p-4 rounded-lg border border-red-500/20">
                      <div className="text-xs text-foreground/60 mb-2 font-mono">AI-generated code (broken)</div>
                      <pre className="text-sm font-mono text-red-600 dark:text-red-400 overflow-x-auto">
{`// AI suggests this import
import { Button } from '@/components/ui/NewButton';
import { Dialog } from '@/shared/dialogs/ConfirmDialog';
import { useAuth } from '@/hooks/useAuthentication';

// But these files don't exist in your codebase!
// ❌ @/components/ui/NewButton
// ❌ @/shared/dialogs/ConfirmDialog
// ❌ @/hooks/useAuthentication`}
                      </pre>
                    </div>

                    <div className="bg-background/30 p-4 rounded-lg border border-green-500/20">
                      <div className="text-xs text-foreground/60 mb-2 font-mono">After PlanToCode verification (correct)</div>
                      <pre className="text-sm font-mono text-green-600 dark:text-green-400 overflow-x-auto">
{`// PlanToCode verifies and corrects paths
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/dialogs/confirm-dialog';
import { useAuth } from '@/lib/hooks/auth';

// ✓ All paths verified against actual filesystem
// ✓ Proper monorepo path resolution
// ✓ No hallucinated imports`}
                      </pre>
                    </div>
                  </div>
                </GlassCard>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-foreground/90">Monorepo nightmares</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      AI confuses <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/core</code> with
                      <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/shared</code>,
                      generating imports that look plausible but reference the wrong package.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-foreground/90">Legacy code confusion</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Your codebase has <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">src/components</code> and
                      <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">lib/components</code>.
                      AI picks the wrong one, or hallucinates a third directory that never existed.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 text-foreground/90">Context window limits</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Large projects exceed AI context windows. The model guesses at file locations based on incomplete information,
                      producing confident but incorrect path references.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Technical Explanation */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Why AI generates wrong file paths</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Brain className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Model hallucination</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Large language models are trained on millions of codebases with different structures. When generating code,
                      they pattern-match against training data, not your actual filesystem.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Models predict <em>probable</em> paths, not <em>actual</em> paths</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Training data contains inconsistent naming conventions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>No filesystem verification in the generation loop</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Layers className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Context window overflow</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Even 200K token context windows cannot hold entire enterprise codebases. The model sees a
                      fraction of your files and infers the rest, leading to path mismatches.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Incomplete directory tree visibility</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Missing import alias configurations</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Outdated snapshots of evolving codebases</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <GitBranch className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Monorepo complexity</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Monorepos amplify path confusion with workspace protocols, internal packages, and multiple
                      <code className="mx-1 px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">node_modules</code> directories.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Conflicting package names across workspaces</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Complex tsconfig path mappings</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>Hoisted dependencies with unclear resolution</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertCircle className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">No verification layer</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Standard AI code generation has no post-processing step to validate file existence.
                      Generated code goes directly to you without filesystem checks.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>No file existence validation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>No import path resolution testing</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>No cross-reference with actual directory structure</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* Solution Section */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How PlanToCode prevents wrong file paths</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FileSearch className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Pre-execution file discovery</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Before AI generates any code, PlanToCode runs a 5-stage file discovery workflow that maps
                      your actual filesystem. Every file path is verified to exist before being included in context.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Scans repository with git ls-files integration</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Validates file existence against actual filesystem</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Resolves symbolic links and path aliases</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Normalizes paths for cross-platform compatibility</span>
                      </li>
                    </ul>
                    <LinkWithArrow href="/features/file-discovery" className="text-sm mt-4">
                      Learn about file discovery
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Shield className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Path validation pipeline</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Stage 5 of the discovery workflow specifically validates and corrects file paths. This happens
                      automatically before any AI model sees your codebase.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Checks file accessibility and permissions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Resolves path inconsistencies automatically</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Handles monorepo workspace protocols</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Validates import alias mappings from tsconfig</span>
                      </li>
                    </ul>
                    <LinkWithArrow href="/docs/file-discovery" className="text-sm mt-4">
                      Technical documentation
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <GitBranch className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Monorepo-aware resolution</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      PlanToCode understands monorepo structures and correctly resolves workspace references,
                      internal package paths, and hoisted dependencies.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Parses workspace configurations (pnpm, yarn, npm)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Resolves internal package cross-references</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Handles multiple node_modules hierarchies</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Detects and respects workspace protocol imports</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Zap className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Real-time verification feedback</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Watch file discovery progress in real-time with stage-by-stage updates. See exactly which
                      paths are being validated and corrected before AI generates code.
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Live progress tracking for each discovery stage</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Detailed error messages for path issues</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>File count and token usage estimates</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                        <span>Cost tracking: typically $0.10-0.15 per workflow</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* Demo Section */}
              <GlassCard className="p-8">
                <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center">File discovery in action</h2>

                <div className="space-y-6">
                  <div className="bg-background/30 p-6 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        1
                      </div>
                      <div className="font-semibold">Repository scan starts</div>
                    </div>
                    <pre className="text-xs font-mono text-foreground/70 overflow-x-auto">
{`Scanning repository: /Users/dev/myapp
Root directory structure (2 levels):
  ├── packages/
  │   ├── core/
  │   ├── shared/
  │   └── ui/
  ├── apps/
  │   ├── web/
  │   └── mobile/
  └── libs/
      └── utils/

Selected roots: packages/core, packages/shared, apps/web`}
                    </pre>
                  </div>

                  <div className="bg-background/30 p-6 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        2
                      </div>
                      <div className="font-semibold">Regex filtering with git integration</div>
                    </div>
                    <pre className="text-xs font-mono text-foreground/70 overflow-x-auto">
{`Running: git ls-files --cached --others --exclude-standard
Generated pattern: \\.(tsx?|jsx?|json)$
Files matched: 847
After binary filtering: 612
Respecting .gitignore: 589 final candidates`}
                    </pre>
                  </div>

                  <div className="bg-background/30 p-6 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                        5
                      </div>
                      <div className="font-semibold">Path validation and correction</div>
                    </div>
                    <pre className="text-xs font-mono text-foreground/70 overflow-x-auto">
{`Validating discovered paths...
✓ packages/core/src/auth.ts → exists, accessible
✓ packages/shared/utils/format.ts → exists, accessible
✓ apps/web/components/Button.tsx → exists, accessible
✗ packages/ui/components/Modal.tsx → does not exist
  → corrected to: packages/shared/components/modal.tsx
✓ All paths validated and normalized
✓ Monorepo workspace references resolved`}
                    </pre>
                  </div>

                  <div className="bg-green-500/10 p-6 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                      <div className="font-semibold text-green-700 dark:text-green-400">Discovery complete</div>
                    </div>
                    <p className="text-sm text-foreground/70 mb-3">
                      All 589 files verified against filesystem. AI will only reference validated paths
                      in generated code. No hallucinated imports possible.
                    </p>
                    <div className="text-xs text-foreground/60 font-mono">
                      Cost: $0.12 | Duration: 23s | Tokens: 47,384
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Real-World Scenarios */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Real-world scenarios</h2>

                <div className="space-y-6">
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center text-sm font-bold">
                        ✗
                      </div>
                      Without path verification
                    </h3>
                    <div className="space-y-4 text-foreground/70 text-sm leading-relaxed">
                      <p>
                        You are refactoring authentication logic in a Next.js monorepo. You ask AI to update the login component.
                        AI confidently generates imports from <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@/lib/auth/session</code>,
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@/components/forms/LoginForm</code>, and
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@/hooks/useAuthState</code>.
                      </p>
                      <p>
                        You copy the code into your editor. TypeScript immediately shows red squiggles. None of these paths exist.
                        The actual paths are <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/auth/session</code>,
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/ui/forms/login</code>, and
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/hooks/auth-state</code>.
                      </p>
                      <p>
                        You spend 30 minutes manually correcting import paths, checking each one against your file tree,
                        and discovering that some files have been renamed or moved. The AI-generated logic is correct, but the
                        path hallucinations make it unusable. Your velocity drops as you become a path-correction specialist
                        instead of a developer.
                      </p>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8 bg-green-500/5 border-green-500/20">
                    <h3 className="text-xl font-semibold mb-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-sm font-bold">
                        ✓
                      </div>
                      With PlanToCode verification
                    </h3>
                    <div className="space-y-4 text-foreground/70 text-sm leading-relaxed">
                      <p>
                        You open PlanToCode and run file discovery on your authentication workspace. The 5-stage workflow scans
                        589 files in 23 seconds, validating every path against your actual filesystem. It detects your monorepo
                        structure, parses workspace configurations, and resolves all internal package references.
                      </p>
                      <p>
                        Now you ask AI to refactor the login component. PlanToCode feeds the AI only verified paths. The generated
                        code imports from <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/auth/session</code>,
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/ui/forms/login</code>, and
                        <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@workspace/hooks/auth-state</code>
                        — all correct on first generation.
                      </p>
                      <p>
                        You copy the code and paste it into your editor. Zero TypeScript errors. The refactor works immediately.
                        You ship the feature in minutes instead of hours. File discovery cost $0.12. Time saved debugging phantom
                        imports: priceless. This is how AI-assisted development should work.
                      </p>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Comparison with Other Tools */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How PlanToCode compares</h2>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-primary/20">
                        <th className="text-left p-4 font-semibold">Feature</th>
                        <th className="text-center p-4 font-semibold">Standard AI Tools</th>
                        <th className="text-center p-4 font-semibold text-primary">PlanToCode</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Pre-execution path validation</td>
                        <td className="p-4 text-center text-red-500">✗</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Monorepo workspace resolution</td>
                        <td className="p-4 text-center text-red-500">✗</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Git integration with .gitignore respect</td>
                        <td className="p-4 text-center text-amber-500">Partial</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">TypeScript path alias resolution</td>
                        <td className="p-4 text-center text-red-500">✗</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Real-time verification progress</td>
                        <td className="p-4 text-center text-red-500">✗</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Symbolic link resolution</td>
                        <td className="p-4 text-center text-red-500">✗</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Cost-optimized token batching</td>
                        <td className="p-4 text-center text-amber-500">Basic</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓ Advanced</td>
                      </tr>
                      <tr className="border-b border-primary/10">
                        <td className="p-4">Binary file filtering</td>
                        <td className="p-4 text-center text-amber-500">Basic</td>
                        <td className="p-4 text-center text-green-500 font-semibold">✓ 97 types</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="text-center text-sm text-foreground/60">
                  <p>Comparison based on Claude Code, Cursor AI, GitHub Copilot, and other leading AI code assistants as of January 2025.</p>
                </div>
              </div>

              {/* Getting Started */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Start preventing wrong file paths</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="text-3xl font-bold text-primary mb-3">1</div>
                    <h3 className="text-lg font-semibold mb-2">Download PlanToCode</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Install for macOS, Windows, or Linux. Connect to your preferred AI model
                      (Claude, GPT-4, Gemini, or local models). No API keys required to start.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-3xl font-bold text-primary mb-3">2</div>
                    <h3 className="text-lg font-semibold mb-2">Run file discovery</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Open your project and start the file discovery workflow. PlanToCode automatically
                      scans and validates your entire codebase structure. Watch real-time progress for each stage.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-3xl font-bold text-primary mb-3">3</div>
                    <h3 className="text-lg font-semibold mb-2">Generate verified code</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      AI generates code using only verified file paths. No hallucinated imports,
                      no phantom dependencies, no broken builds. Copy with confidence.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Impact and Benefits */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">The impact of verified file paths</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6 bg-primary/5 border-primary/20">
                    <h3 className="text-lg font-semibold mb-4">For individual developers</h3>
                    <ul className="space-y-3 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Stop debugging phantom imports.</strong> No more hunting through
                          directory trees to find the correct path AI should have generated in the first place.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Ship faster.</strong> When AI-generated code works on first paste,
                          your velocity increases dramatically. Focus on logic, not path corrections.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Trust AI output.</strong> Path verification builds confidence.
                          You know imports are correct before you copy code to your editor.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Work with legacy code.</strong> Complex, undocumented codebases
                          become navigable when every path is verified against reality.
                        </span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6 bg-primary/5 border-primary/20">
                    <h3 className="text-lg font-semibold mb-4">For engineering teams</h3>
                    <ul className="space-y-3 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Onboard faster.</strong> New team members understand codebase
                          structure through verified file discovery. No guessing at import conventions.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Reduce PR noise.</strong> Eliminate commits that solely fix
                          incorrect import paths. Code reviews focus on logic, not path corrections.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Scale monorepos confidently.</strong> As your workspace grows,
                          path verification prevents the exponential increase in import confusion.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
                        <span>
                          <strong className="text-foreground">Standardize AI usage.</strong> When everyone uses verified paths,
                          AI-generated code maintains consistency across the team.
                        </span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>

                <GlassCard className="p-8 text-center bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
                  <div className="max-w-2xl mx-auto">
                    <h3 className="text-xl font-bold mb-4">Measured impact</h3>
                    <div className="grid grid-cols-3 gap-6 mb-6">
                      <div>
                        <div className="text-3xl font-bold text-primary mb-1">85%</div>
                        <div className="text-sm text-foreground/70">Reduction in path-related debugging time</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-primary mb-1">$0.12</div>
                        <div className="text-sm text-foreground/70">Average cost per verification workflow</div>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-primary mb-1">23s</div>
                        <div className="text-sm text-foreground/70">Average scan time for 589 files</div>
                      </div>
                    </div>
                    <p className="text-foreground/70 text-sm">
                      Based on internal testing with monorepo codebases ranging from 200 to 5,000 files.
                      Your results may vary depending on repository structure and complexity.
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* FAQ Section */}
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Frequently asked questions</h2>

                <div className="space-y-4">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Does file discovery work with monorepos?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Yes. PlanToCode explicitly supports monorepo structures including pnpm workspaces, Yarn workspaces,
                      npm workspaces, and Nx. The file discovery workflow parses workspace configurations and correctly
                      resolves internal package references, hoisted dependencies, and workspace protocol imports.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">How much does file discovery cost per run?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Typically $0.10-0.15 per complete workflow, depending on repository size and complexity.
                      The 5-stage discovery process uses intelligent token batching and content-aware estimation
                      to minimize API costs while maximizing accuracy. Cost tracking is built into every stage.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Can I see which paths were verified?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Absolutely. PlanToCode provides real-time progress tracking with stage-by-stage updates.
                      You can see exactly which directories were scanned, how many files passed validation,
                      which paths were corrected, and the final list of verified files available to AI.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Does this work with TypeScript path aliases?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Yes. The path validation stage understands tsconfig.json path mappings and resolves
                      TypeScript aliases like <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">@/*</code> or
                      <code className="px-1.5 py-0.5 bg-background/50 rounded text-xs font-mono">~/*</code> against
                      your actual filesystem. This ensures AI-generated imports use correct alias syntax.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">What happens if AI still suggests a wrong path?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      While file discovery dramatically reduces path hallucination, AI models can still generate
                      new file names for code you are creating. PlanToCode focuses on verifying existing files.
                      For newly created files, the implementation plan shows clear file paths and you can validate
                      them before copying to your AI tool.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">Can I exclude certain directories from discovery?</h3>
                    <p className="text-foreground/70 text-sm leading-relaxed">
                      Yes. The file discovery workflow respects .gitignore rules automatically. Additionally,
                      binary files and 97 common non-code extensions are filtered by default. You can also
                      configure custom exclusion patterns in your project settings.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* CTA Section */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Stop fighting hallucinated file paths
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  AI should reference files that actually exist. PlanToCode verifies every path before
                  code generation, eliminating phantom imports and broken builds. Perfect for monorepos,
                  legacy codebases, and complex project structures.
                </p>
                <PlatformDownloadSection location="solutions_ai_wrong_paths" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/file-discovery">
                    Deep dive: File discovery system
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/file-discovery">
                    Read technical documentation
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
