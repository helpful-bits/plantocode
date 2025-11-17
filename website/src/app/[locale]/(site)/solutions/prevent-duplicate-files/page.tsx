import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Copy, FileSearch, AlertTriangle, CheckCircle2, FolderOpen, GitBranch } from 'lucide-react';
import { locales } from '@/i18n/config';
import { loadMessages, type Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/solutions/prevent-duplicate-files',
    title: t['solutions.preventDuplicateFiles.meta.title'],
    description: t['solutions.preventDuplicateFiles.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function PreventDuplicateFilesPage() {
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
                  <AlertTriangle className="w-4 h-4" />
                  <span>Duplicate file prevention</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Stop AI from creating duplicate files
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  AI coding tools frequently create duplicate files because they lack context about existing code structure. PlanToCode solves this with intelligent file discovery that maps your entire codebase before generating any code.
                </p>
              </header>

              {/* Problem Description */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6">The Duplicate File Problem: Real Examples</h2>
                  <p className="text-foreground/80 leading-relaxed mb-6">
                    Duplicate files are one of the most common and frustrating issues developers face when using AI coding assistants. When AI tools like Cursor, GitHub Copilot, or other code generation systems lack proper context about your existing codebase, they create new files instead of modifying existing ones. This leads to code fragmentation, merge conflicts, and hours of manual cleanup work.
                  </p>
                </div>

                <GlassCard className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <Copy className="w-5 h-5 text-red-500 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Case Study: Cursor Issue #47028</h3>
                      <p className="text-foreground/70 leading-relaxed mb-4">
                        A developer reported on the Cursor forum that when asking the AI to &ldquo;update the authentication service,&rdquo; Cursor created a new file <code className="text-sm bg-muted/50 px-2 py-1 rounded">src/services/auth-service-new.ts</code> instead of modifying the existing <code className="text-sm bg-muted/50 px-2 py-1 rounded">src/services/authService.ts</code>. This happened because the AI didn&rsquo;t properly scan for existing implementations with similar naming patterns.
                      </p>
                      <p className="text-foreground/70 leading-relaxed">
                        <strong>Impact:</strong> The developer spent 3 hours manually merging the duplicate code, resolving import conflicts across 15 files, and removing the duplicate. The project ended up with broken references in production because some imports still pointed to the old file path.
                      </p>
                      <LinkWithArrow
                        external
                        className="text-sm mt-4"
                        href="https://forum.cursor.com/t/cursor-creates-duplicate-files-instead-of-updating-existing-ones/47028"
                      >
                        View Cursor forum discussion
                      </LinkWithArrow>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <Copy className="w-5 h-5 text-red-500 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-xl font-semibold mb-2">Case Study: Cursor Issue #31402</h3>
                      <p className="text-foreground/70 leading-relaxed mb-4">
                        Another documented case involved a React project where a developer asked to &ldquo;add dark mode support.&rdquo; Instead of modifying the existing <code className="text-sm bg-muted/50 px-2 py-1 rounded">components/ThemeProvider.tsx</code>, Cursor created <code className="text-sm bg-muted/50 px-2 py-1 rounded">components/DarkModeProvider.tsx</code> with overlapping functionality. The codebase ended up with two competing theme systems running simultaneously.
                      </p>
                      <p className="text-foreground/70 leading-relaxed">
                        <strong>Impact:</strong> The duplicate theme providers caused state management conflicts, increased bundle size by 45KB, and created user experience bugs where theme preferences weren&rsquo;t persisting correctly. The cleanup required a full refactoring sprint.
                      </p>
                      <LinkWithArrow
                        external
                        className="text-sm mt-4"
                        href="https://forum.cursor.com/t/composer-keeps-creating-duplicate-files/31402"
                      >
                        View Cursor forum discussion
                      </LinkWithArrow>
                    </div>
                  </div>
                </GlassCard>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6">
                  <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Common Duplicate File Scenarios
                  </h4>
                  <ul className="space-y-2 text-foreground/70">
                    <li>• Creating <code className="text-xs bg-muted/50 px-2 py-1 rounded">utils-new.ts</code> when <code className="text-xs bg-muted/50 px-2 py-1 rounded">helpers.ts</code> exists with similar functions</li>
                    <li>• Generating <code className="text-xs bg-muted/50 px-2 py-1 rounded">apiClient2.ts</code> instead of updating <code className="text-xs bg-muted/50 px-2 py-1 rounded">api/client.ts</code></li>
                    <li>• Making <code className="text-xs bg-muted/50 px-2 py-1 rounded">ButtonComponent.tsx</code> when <code className="text-xs bg-muted/50 px-2 py-1 rounded">Button.tsx</code> already exists</li>
                    <li>• Creating <code className="text-xs bg-muted/50 px-2 py-1 rounded">test-helper-updated.js</code> instead of modifying <code className="text-xs bg-muted/50 px-2 py-1 rounded">testHelpers.js</code></li>
                    <li>• Duplicating configuration files like <code className="text-xs bg-muted/50 px-2 py-1 rounded">config-new.json</code> or <code className="text-xs bg-muted/50 px-2 py-1 rounded">settings-v2.yaml</code></li>
                  </ul>
                </div>
              </div>

              {/* Why AI Creates Duplicates */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6">Why AI Tools Create Duplicate Files</h2>
                  <p className="text-foreground/80 leading-relaxed mb-6">
                    Understanding the technical reasons behind duplicate file creation helps explain why this problem is so persistent across AI coding tools. It's not a simple bug—it's a fundamental architectural limitation of how most AI assistants interact with codebases.
                  </p>
                </div>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">1. Limited Context Window</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">Most AI coding assistants operate with a limited context window that can only &ldquo;see&rdquo; a small portion of your codebase at any given time. When you ask to create or modify a feature, the AI might only have access to the currently open files or a narrow slice of your project structure.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70 mb-2">
                      <strong>Technical Details:</strong> Even with large context windows (128K+ tokens), AI models still struggle with full-project awareness. A typical medium-sized project with 500 files could require 2-5 million tokens to fully index, far exceeding practical limits. This forces AI tools to make educated guesses about file locations rather than having complete knowledge.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">2. Incomplete File Discovery</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    When AI tools do attempt file discovery, they often use shallow methods like searching currently open files, recently accessed files, or basic pattern matching. These approaches miss files that aren&rsquo;t actively open or have non-standard naming conventions.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70 mb-2">
                      <strong>Example:</strong> If your authentication service is named <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">authService.ts</code> but the AI searches for files matching "auth*", it might miss it if the search is case-sensitive or limited to specific directories. The AI then concludes the file doesn&rsquo;t exist and creates a duplicate.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">3. Naming Convention Mismatches</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Different projects use different naming conventions: camelCase, PascalCase, kebab-case, snake_case, or custom patterns. AI tools often struggle to recognize that <code className="text-sm bg-muted/50 px-2 py-1 rounded">user-service.ts</code>, <code className="text-sm bg-muted/50 px-2 py-1 rounded">UserService.ts</code>, and <code className="text-sm bg-muted/50 px-2 py-1 rounded">user_service.ts</code> are all potential matches for a "user service" file.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70">
                      <strong>Real Impact:</strong> In polyglot projects mixing multiple languages (TypeScript, Python, Go), naming conventions vary by language ecosystem. An AI trained primarily on JavaScript patterns might fail to recognize equivalent Python modules, leading to cross-language duplicates.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">4. No Pre-execution Validation</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Most AI coding tools execute changes immediately without a review step. They generate code and apply it directly to your filesystem. By the time you realize a duplicate was created, the damage is already done. There's no opportunity to catch the mistake before execution.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70">
                      <strong>Workflow Problem:</strong> Traditional AI assistants follow a "generate → apply" pattern. Without a "generate → review → apply" workflow, developers have no chance to verify file paths, check for duplicates, or validate the AI&rsquo;s understanding of the codebase structure before changes are written to disk.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">5. Conflict Avoidance Bias</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    AI models are often trained with a safety-first approach: when uncertain whether a file exists or what its exact path is, they default to creating a new file rather than risking overwriting existing code. This "better safe than sorry" bias leads to duplicate file proliferation.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70">
                      <strong>Training Incentives:</strong> AI models are penalized more heavily for destructive actions (overwriting important code) than for conservative actions (creating unnecessary duplicates). This asymmetric penalty structure in training data encourages duplicate creation as the "safer" option.
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* How PlanToCode Prevents Duplicates */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6">How PlanToCode Prevents Duplicate Files</h2>
                  <p className="text-foreground/80 leading-relaxed mb-6">
                    PlanToCode fundamentally changes the workflow with a planning-first approach. Instead of immediately generating and executing code, PlanToCode uses a comprehensive file discovery system that maps your entire codebase structure before proposing any changes. This architectural difference eliminates the root causes of duplicate file creation.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FileSearch className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Comprehensive File Discovery</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      PlanToCode runs a 4-stage file discovery workflow before generating any implementation plan. This workflow uses git integration, regex filtering, AI-powered relevance assessment, and relationship analysis to build a complete map of your codebase.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold mb-2">Discovery Process:</h4>
                      <ol className="text-sm text-foreground/70 space-y-1 list-decimal list-inside">
                        <li>Stage 1: Validate git repository and root folder</li>
                        <li>Stage 2: Generate task-specific regex patterns</li>
                        <li>Stage 3: AI relevance assessment of file contents</li>
                        <li>Stage 4: Extended path discovery via relationships</li>
                      </ol>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      This deep discovery means PlanToCode knows about <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">authService.ts</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">auth-helpers.ts</code>, and <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">authentication/</code> directories before suggesting any changes. It won&rsquo;t create duplicates because it has complete context.
                    </p>
                    <LinkWithArrow className="text-sm mt-4" href="/docs/file-discovery">
                      Technical documentation
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Review Before Execution</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      Unlike tools that immediately apply changes, PlanToCode generates a detailed implementation plan that you review in the Monaco editor before any code touches your filesystem. You see exactly which files will be created, modified, or deleted.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold mb-2">Plan Contents Include:</h4>
                      <ul className="text-sm text-foreground/70 space-y-1">
                        <li>• Complete list of files to be modified</li>
                        <li>• New files to be created with full paths</li>
                        <li>• Specific changes with before/after context</li>
                        <li>• Token count estimates per operation</li>
                        <li>• Dependencies and import updates needed</li>
                      </ul>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      This review step lets you catch duplicates before execution. If you see the plan wants to create <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">auth-new.ts</code>, you can reject it and refine the discovery scope.
                    </p>
                    <LinkWithArrow className="text-sm mt-4" href="/docs/implementation-plans">
                      Implementation plans guide
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <FolderOpen className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Intelligent Pattern Matching</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      PlanToCode's regex generation stage creates intelligent patterns that account for multiple naming conventions, case variations, and common file organization patterns. It understands that a request to &ldquo;update the user service" should match <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">userService.ts</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">user-service.ts</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">UserService.ts</code>, or <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">services/user/</code>.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm text-foreground/70">
                        <strong>Advanced Matching:</strong> The system uses AI to generate context-aware regex patterns rather than simple string matching. For a task like "add JWT validation," it generates patterns covering <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">auth*</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">jwt*</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">token*</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">middleware/auth*</code> and related patterns.
                      </p>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <GitBranch className="w-5 h-5 text-primary" />
                      <h3 className="text-xl font-semibold">Git-Aware File Tracking</h3>
                    </div>
                    <p className="text-foreground/70 leading-relaxed mb-4">
                      The file discovery workflow integrates directly with git to respect <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">.gitignore</code> rules and track both committed and uncommitted changes. This git integration ensures PlanToCode sees your actual working tree, including recently created files that might not be committed yet.
                    </p>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm text-foreground/70">
                        <strong>Command Used:</strong> <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">git ls-files --cached --others --exclude-standard</code> captures all tracked files plus untracked files that aren&rsquo;t ignored, giving PlanToCode a complete view of your codebase state including work-in-progress files.
                      </p>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Before/After Comparison */}
              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold">Before & After: AI Without Planning vs. With PlanToCode</h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6 border-2 border-red-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Without PlanToCode</h3>
                    </div>
                    <div className="space-y-3 text-sm text-foreground/70">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold mt-0.5">1.</span>
                        <div>
                          <p className="font-medium text-foreground">User: "Add JWT validation to authentication"</p>
                          <p className="text-xs mt-1">AI has limited context, only sees currently open files</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold mt-0.5">2.</span>
                        <div>
                          <p className="font-medium text-foreground">AI searches, doesn&rsquo;t find existing auth files</p>
                          <p className="text-xs mt-1">Misses <code className="bg-muted/50 px-1 py-0.5 rounded">src/services/authService.ts</code> due to naming/path mismatch</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold mt-0.5">3.</span>
                        <div>
                          <p className="font-medium text-foreground">Immediately creates <code className="bg-muted/50 px-1 py-0.5 rounded">jwtValidation.ts</code></p>
                          <p className="text-xs mt-1">No review step, changes applied directly to filesystem</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold mt-0.5">4.</span>
                        <div>
                          <p className="font-medium text-foreground text-red-600 dark:text-red-400">Result: Duplicate file created</p>
                          <p className="text-xs mt-1">Now have both <code className="bg-muted/50 px-1 py-0.5 rounded">authService.ts</code> and <code className="bg-muted/50 px-1 py-0.5 rounded">jwtValidation.ts</code> with overlapping functionality</p>
                        </div>
                      </div>
                      <div className="bg-red-500/10 rounded p-3 mt-4">
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400">Manual cleanup required:</p>
                        <ul className="text-xs mt-2 space-y-1">
                          <li>• Merge duplicate code manually</li>
                          <li>• Update all import references</li>
                          <li>• Fix broken tests and dependencies</li>
                          <li>• Time wasted: 2-4 hours</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 border-2 border-green-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">With PlanToCode</h3>
                    </div>
                    <div className="space-y-3 text-sm text-foreground/70">
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">1.</span>
                        <div>
                          <p className="font-medium text-foreground">User: "Add JWT validation to authentication"</p>
                          <p className="text-xs mt-1">File discovery workflow starts automatically</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">2.</span>
                        <div>
                          <p className="font-medium text-foreground">4-stage discovery maps entire codebase</p>
                          <p className="text-xs mt-1">Finds <code className="bg-muted/50 px-1 py-0.5 rounded">authService.ts</code>, <code className="bg-muted/50 px-1 py-0.5 rounded">auth-helpers.ts</code>, related config files</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">3.</span>
                        <div>
                          <p className="font-medium text-foreground">Generates implementation plan for review</p>
                          <p className="text-xs mt-1">Shows it will modify existing <code className="bg-muted/50 px-1 py-0.5 rounded">authService.ts</code>, no duplicates</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">4.</span>
                        <div>
                          <p className="font-medium text-foreground">You review and approve plan</p>
                          <p className="text-xs mt-1">See exact changes before any code touches filesystem</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 font-bold mt-0.5">5.</span>
                        <div>
                          <p className="font-medium text-foreground text-green-600 dark:text-green-400">Result: Clean, targeted modifications</p>
                          <p className="text-xs mt-1">JWT validation added to existing <code className="bg-muted/50 px-1 py-0.5 rounded">authService.ts</code>, no duplicates created</p>
                        </div>
                      </div>
                      <div className="bg-green-500/10 rounded p-3 mt-4">
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">Benefits achieved:</p>
                        <ul className="text-xs mt-2 space-y-1">
                          <li>• Zero duplicate files created</li>
                          <li>• Clean modification to existing code</li>
                          <li>• All imports remain valid</li>
                          <li>• Time saved: 2-4 hours</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Getting Started */}
              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold">Getting Started: Stop Creating Duplicates Today</h2>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 1: Install PlanToCode Desktop</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Download the PlanToCode desktop application for your platform. The file discovery workflow and implementation planning features are built directly into the desktop client.
                  </p>
                  <PlatformDownloadSection location="solutions_prevent_duplicates_step1" />
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 2: Configure Your Project Root</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Open PlanToCode and select your project's root directory. PlanToCode will validate git repository status and establish the base directory for all file operations. Configure any custom exclusion patterns for directories you want to skip (node_modules, dist, build, etc.).
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70">
                      <strong>Tip:</strong> The default exclusion patterns already cover common directories like <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">node_modules</code>, <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">.git</code>, and build artifacts. You only need to customize if your project has unusual directory structures.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 3: Describe Your Task</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Enter a natural language description of what you want to accomplish. For example: "Add JWT validation to the authentication service" or "Implement dark mode support in the theme provider." Be as specific as possible about the functionality you want.
                  </p>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-foreground/70 mb-2">
                      <strong>Good Task Descriptions:</strong>
                    </p>
                    <ul className="text-xs text-foreground/70 space-y-1">
                      <li>• "Add Redis caching to the user profile API endpoint"</li>
                      <li>• "Implement WebSocket connection management in the chat service"</li>
                      <li>• "Add input validation to all form components"</li>
                      <li>• "Update database migration to add user roles table"</li>
                    </ul>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 4: Review the File Discovery</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    PlanToCode will run the 4-stage file discovery workflow in the background. You'll see real-time progress updates as it discovers relevant files. The workflow typically completes in 30-90 seconds depending on codebase size.
                  </p>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Once complete, review the list of discovered files. You'll see which files PlanToCode identified as relevant to your task. This is your first checkpoint to ensure the system has proper context about existing files.
                  </p>
                  <LinkWithArrow className="text-sm" href="/features/file-discovery">
                    Learn more about the discovery process
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 5: Review the Implementation Plan</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    PlanToCode generates a detailed implementation plan based on the discovered files. Open the plan in the Monaco editor and carefully review:
                  </p>
                  <ul className="text-foreground/70 space-y-2 mb-4 ml-4">
                    <li>• Which files will be <strong>modified</strong> (look for existing file paths)</li>
                    <li>• Which files will be <strong>created</strong> (verify these are genuinely new files needed)</li>
                    <li>• The specific code changes proposed for each file</li>
                    <li>• Import statements and dependency updates</li>
                  </ul>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3">
                    <p className="text-sm text-foreground/70">
                      <strong>Checkpoint:</strong> If you see any file creation that looks like a duplicate (e.g., <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">auth-new.ts</code> or <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">UserService2.tsx</code>), stop here. Refine your task description or manually adjust the file list before proceeding.
                    </p>
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">Step 6: Execute with Confidence</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    Once you've reviewed and approved the plan, copy the implementation instructions to your preferred AI coding tool (Cursor, Copilot, Claude, etc.) or execute directly via the integrated terminal. Because PlanToCode has already done the heavy lifting of file discovery and planning, execution becomes a straightforward process of applying well-defined changes.
                  </p>
                  <LinkWithArrow className="text-sm" href="/features/integrated-terminal">
                    Terminal integration guide
                  </LinkWithArrow>
                </GlassCard>
              </div>

              {/* FAQ Section */}
              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold">Frequently Asked Questions</h2>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">Does PlanToCode work with Cursor and GitHub Copilot?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    Yes. PlanToCode is designed as a planning layer that works alongside your existing AI coding tools. You use PlanToCode to discover files and generate implementation plans, then execute those plans using Cursor, GitHub Copilot, Claude Code, or any other AI assistant. The file discovery and planning prevent duplicates regardless of which tool executes the code.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">How long does the file discovery workflow take?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    File discovery typically completes in 30-90 seconds for medium-sized projects (500-2000 files). Very large monorepos with 10,000+ files may take 2-3 minutes. The workflow runs in the background, so you can continue working while it executes. Progress updates appear in real-time.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">What if I have a huge codebase? Will discovery time out?</h3>
                  <p className="text-foreground/70 leading-relaxed mb-4">
                    PlanToCode includes intelligent timeout management and caching mechanisms. For extremely large codebases, you can configure custom timeout values and use exclusion patterns to skip irrelevant directories (vendor code, generated files, etc.). The system also caches discovery results per session, so subsequent plans in the same session reuse the cached file context.
                  </p>
                  <LinkWithArrow className="text-sm" href="/docs/file-discovery#configuration-options">
                    Configuration options
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">Can I still create genuinely new files when needed?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    Absolutely. PlanToCode's file discovery doesn&rsquo;t prevent creating new files—it prevents creating <em>duplicate</em> files. When your task genuinely requires a new file (like adding a completely new feature module), PlanToCode will propose creating it in the implementation plan. The difference is you'll see the proposal and can verify it's truly new functionality rather than an accidental duplicate.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">Does this work for non-JavaScript projects?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    Yes. PlanToCode's file discovery is language-agnostic. It works with Python, Go, Rust, Java, TypeScript, JavaScript, Ruby, PHP, C++, and any other text-based codebase. The regex generation and AI relevance assessment adapt to the specific languages and frameworks in your project based on the task description and discovered file extensions.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">What happens if the AI still proposes a duplicate in the plan?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    This is rare because the file discovery provides comprehensive context, but if it happens, you'll catch it during the review step. Simply reject the plan, refine your task description (be more specific about which existing files to modify), or manually adjust the file selection. The key advantage is catching duplicates <em>before</em> execution rather than <em>after</em> the damage is done.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">Is there a cost for running file discovery?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    File discovery does use AI for the relevance assessment stage (Stage 3), which incurs small API costs. However, the cost is minimal (typically $0.01-0.05 per discovery run) and the system provides cost estimates before execution. The investment is worthwhile compared to the 2-4 hours of manual cleanup time saved by preventing duplicates.
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-3">Can I use PlanToCode for refactoring existing duplicates?</h3>
                  <p className="text-foreground/70 leading-relaxed">
                    Yes. If you already have duplicate files in your codebase, you can use PlanToCode to plan their consolidation. Describe the task as "Merge duplicate authentication services into authService.ts" or similar. The file discovery will find all related files, and the implementation plan will show you exactly how to consolidate them cleanly.
                  </p>
                </GlassCard>
              </div>

              {/* Final CTA */}
              <GlassCard highlighted className="p-8 sm:p-12 max-w-3xl mx-auto text-center">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">Stop Creating Duplicate Files Today</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  File discovery before execution. Review before application. Zero duplicates.
                  This is how AI-assisted development should work: intelligent, preventive, clean.
                </p>
                <PlatformDownloadSection location="solutions_prevent_duplicates_final_cta" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/docs/file-discovery">
                    Read the technical guide
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs/implementation-plans">
                    Learn about plan review
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/how-it-works">
                    See how it works
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
