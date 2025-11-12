import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import {
  Shield,
  Zap,
  CheckCircle2,
  AlertTriangle,
  FileText,
  GitMerge,
  Target,
  Eye,
  Play,
  Workflow
} from 'lucide-react';
import type { Article, FAQPage, BreadcrumbList } from 'schema-dts';

import { loadMessages, type Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    locale,
    slug: '/cursor-alternative',
    title: 'Cursor Safety Companion - Not Alternative',
    description: 'Not looking for a Cursor replacement? PlanToCode works WITH Cursor to prevent duplicate files, wrong paths, and production bugs. Use both together.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - Cursor Safety Companion',
    }],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function CursorAlternativePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const articleJsonLd: Article = {
    '@type': 'Article',
    headline: 'Cursor Alternative? No—Your Cursor Safety Companion',
    description: 'PlanToCode works WITH Cursor to prevent duplicate files, wrong paths, and production bugs through implementation planning.',
    author: {
      '@type': 'Organization',
      name: 'PlanToCode',
    },
    publisher: {
      '@type': 'Organization',
      name: 'PlanToCode',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.plantocode.com/images/icon.png',
      },
    },
    datePublished: '2025-01-01',
    dateModified: '2025-01-01',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': 'https://www.plantocode.com/cursor-alternative',
    },
  };

  const breadcrumbJsonLd: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.plantocode.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Cursor Alternative',
        item: 'https://www.plantocode.com/cursor-alternative',
      },
    ],
  };

  const faqJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is PlanToCode a Cursor alternative or replacement?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No, PlanToCode is not a Cursor replacement. It\'s a complementary tool that works alongside Cursor. While Cursor excels at code generation and autocomplete, PlanToCode adds a safety layer through implementation planning. Use Cursor for speed, PlanToCode for safety.',
        },
      },
      {
        '@type': 'Question',
        name: 'What problems does using Cursor and PlanToCode together solve?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Using both tools together prevents common Cursor issues: duplicate file creation, wrong file paths (especially in multi-workspace projects), unexpected file modifications, and production bugs from unreviewed changes. PlanToCode\'s planning phase catches these issues before execution.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I use PlanToCode with Cursor?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The workflow is: 1) Generate a file-by-file implementation plan in PlanToCode, 2) Review and approve the plan (catching any path errors or duplicates), 3) Paste the approved plan into Cursor Agent or Composer, 4) Let Cursor execute the code generation with clear architectural context.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does the combined pricing look like?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Cursor costs $20/month for a subscription. PlanToCode uses pay-as-you-go pricing with no subscription. Total cost: $20/month for Cursor + your actual API usage in PlanToCode (often $5-15/month for typical use).',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use Cursor without PlanToCode?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Absolutely. Cursor works great standalone for small projects, greenfield development, and quick prototypes. Add PlanToCode when working on large codebases (50k+ LOC), complex refactoring, team environments requiring approvals, or if you\'ve experienced duplicate file issues.',
        },
      },
    ],
  };

  return (
    <>
      <StructuredData data={articleJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />
      <StructuredData data={faqJsonLd} />

      <Header />

      <main className="container mx-auto px-4 py-16 max-w-5xl">
        <article className="prose prose-invert prose-lg max-w-none">

          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm mb-6">
              <Shield className="w-4 h-4" />
              <span>{t['cursorAlternative.hero.badge']}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold mb-6">
              {t['cursorAlternative.hero.title']}<br />{t['cursorAlternative.hero.titleHighlight']}
            </h1>

            <p className="text-xl text-foreground/80 max-w-3xl mx-auto mb-8">
              {t['cursorAlternative.hero.subtitle']}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <LinkWithArrow href="/downloads" className="inline-flex items-center">
                {t['cursorAlternative.hero.download']}
              </LinkWithArrow>
              <Link
                href="/plan-mode/cursor"
                className="text-primary hover:underline inline-flex items-center gap-2"
              >
                {t['cursorAlternative.hero.guide']}
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* The Problem: Why Developers Search for Alternatives */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">{t['cursorAlternative.problem.title']}</h2>

            <p className="text-lg mb-6">
              {t['cursorAlternative.problem.intro']}
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <GlassCard className="p-6 bg-red-500/5 border-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
                <h3 className="text-xl font-semibold mb-2">{t['cursorAlternative.problem.duplicates.title']}</h3>
                <p className="text-foreground/80 text-sm">
                  {t['cursorAlternative.problem.duplicates.description']}
                  <span className="block text-xs text-foreground/60 mt-2">{t['cursorAlternative.problem.duplicates.source']}</span>
                </p>
              </GlassCard>

              <GlassCard className="p-6 bg-red-500/5 border-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
                <h3 className="text-xl font-semibold mb-2">{t['cursorAlternative.problem.paths.title']}</h3>
                <p className="text-foreground/80 text-sm">
                  {t['cursorAlternative.problem.paths.description']}
                  <span className="block text-xs text-foreground/60 mt-2">{t['cursorAlternative.problem.paths.source']}</span>
                </p>
              </GlassCard>

              <GlassCard className="p-6 bg-red-500/5 border-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
                <h3 className="text-xl font-semibold mb-2">{t['cursorAlternative.problem.unexpected.title']}</h3>
                <p className="text-foreground/80 text-sm">
                  {t['cursorAlternative.problem.unexpected.description']}
                  <span className="block text-xs text-foreground/60 mt-2">{t['cursorAlternative.problem.unexpected.source']}</span>
                </p>
              </GlassCard>

              <GlassCard className="p-6 bg-red-500/5 border-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
                <h3 className="text-xl font-semibold mb-2">{t['cursorAlternative.problem.bugs.title']}</h3>
                <p className="text-foreground/80 text-sm">
                  {t['cursorAlternative.problem.bugs.description']}
                  <span className="block text-xs text-foreground/60 mt-2">{t['cursorAlternative.problem.bugs.source']}</span>
                </p>
              </GlassCard>
            </div>

            <p className="text-lg">
              {t['cursorAlternative.problem.insight']}
            </p>
          </section>

          {/* The Twist: Not a Replacement */}
          <section className="mb-16">
            <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-8 mb-8">
              <h2 className="text-3xl font-bold mb-4">{t['cursorAlternative.twist.title']}</h2>

              <p className="text-lg mb-4">
                {t['cursorAlternative.twist.strength']}
              </p>

              <p className="text-lg mb-4">
                {t['cursorAlternative.twist.complement']}
              </p>

              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-semibold">{t['cursorAlternative.twist.cursorFor.title']}</h3>
                  </div>
                  <ul className="space-y-2 text-foreground/80">
                    <li>• {t['cursorAlternative.twist.cursorFor.speed']}</li>
                    <li>• {t['cursorAlternative.twist.cursorFor.autocomplete']}</li>
                    <li>• {t['cursorAlternative.twist.cursorFor.prototypes']}</li>
                    <li>• {t['cursorAlternative.twist.cursorFor.commands']}</li>
                    <li>• {t['cursorAlternative.twist.cursorFor.ide']}</li>
                  </ul>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-semibold">{t['cursorAlternative.twist.planFor.title']}</h3>
                  </div>
                  <ul className="space-y-2 text-foreground/80">
                    <li>• {t['cursorAlternative.twist.planFor.planning']}</li>
                    <li>• {t['cursorAlternative.twist.planFor.paths']}</li>
                    <li>• {t['cursorAlternative.twist.planFor.duplicates']}</li>
                    <li>• {t['cursorAlternative.twist.planFor.review']}</li>
                    <li>• {t['cursorAlternative.twist.planFor.approval']}</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* When to Use Cursor vs PlanToCode */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">When to Use Cursor vs PlanToCode (Side-by-Side)</h2>

            <div className="space-y-6">
              <GlassCard className="p-6">
                <div className="flex items-start gap-4">
                  <Target className="w-8 h-8 text-green-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Greenfield Projects & Quick Prototypes</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-primary mb-1">Use Cursor Standalone</p>
                        <p className="text-foreground/80">New projects with simple structure where you can catch mistakes quickly. File organization isn't complex yet.</p>
                      </div>
                      <div className="opacity-50">
                        <p className="font-semibold mb-1">PlanToCode Optional</p>
                        <p className="text-foreground/80">Not critical for small projects with clear structure.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-start gap-4">
                  <Target className="w-8 h-8 text-yellow-400 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Medium Codebases (10k-50k LOC)</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-primary mb-1">Use Cursor for Implementation</p>
                        <p className="text-foreground/80">Still fast enough to review changes manually. Good autocomplete saves time.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-primary mb-1">Add PlanToCode for Complex Tasks</p>
                        <p className="text-foreground/80">Use planning for refactoring, multi-package changes, or when you've hit path errors.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6 border-primary/30">
                <div className="flex items-start gap-4">
                  <Target className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Large/Legacy Codebases (50k+ LOC)</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-primary mb-1">Start with PlanToCode Planning</p>
                        <p className="text-foreground/80">Generate file-by-file plan, catch wrong paths and duplicates during review phase.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-primary mb-1">Execute with Cursor</p>
                        <p className="text-foreground/80">Paste approved plan into Cursor Agent. Let it handle code generation with clear context.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6 border-primary/30">
                <div className="flex items-start gap-4">
                  <Target className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Team Environments & Enterprise</h3>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-primary mb-1">Use PlanToCode for Approval Workflows</p>
                        <p className="text-foreground/80">Stakeholders review plans before execution. Audit trail for compliance and governance.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-primary mb-1">Use Cursor for Individual Contributors</p>
                        <p className="text-foreground/80">Developers use Cursor daily. Plans from PlanToCode guide their work.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </section>

          {/* How to Use Both Together */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">How to Use Cursor + PlanToCode Together</h2>

            <p className="text-lg mb-6">
              The most effective workflow combines both tools, using each for what it does best:
            </p>

            <GlassCard className="p-8 mb-8 bg-gradient-to-br from-primary/10 to-transparent">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Workflow className="w-7 h-7 text-primary" />
                Combined Workflow: Plan → Execute → Review
              </h3>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 flex items-center gap-2">
                      <Eye className="w-5 h-5 text-primary" />
                      Plan in PlanToCode
                    </h4>
                    <p className="text-foreground/80 mb-2">
                      Describe your task (voice or text), run file discovery to find all impacted files, generate implementation plans from multiple AI models (Claude, GPT, Gemini).
                    </p>
                    <p className="text-sm text-foreground/60">
                      <strong>What you catch:</strong> Wrong file paths, duplicate files, missing dependencies, scope creep
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      Review & Approve
                    </h4>
                    <p className="text-foreground/80 mb-2">
                      Open the plan in Monaco editor. Verify exact file paths match your repository structure. Check for duplicates. Edit any steps that need refinement. Merge plans from different models if needed.
                    </p>
                    <p className="text-sm text-foreground/60">
                      <strong>Safety gate:</strong> Nothing happens without your explicit approval
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 flex items-center gap-2">
                      <Play className="w-5 h-5 text-primary" />
                      Execute in Cursor
                    </h4>
                    <p className="text-foreground/80 mb-2">
                      Copy the approved plan. Paste it into Cursor Agent Terminal or Composer. Cursor now has complete architectural context—it knows exactly which files to modify, what to change, and why.
                    </p>
                    <p className="text-sm text-foreground/60">
                      <strong>Alternative:</strong> Execute directly in PlanToCode's integrated terminal with full logging
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    4
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2 flex items-center gap-2">
                      <GitMerge className="w-5 h-5 text-primary" />
                      Review Implementation
                    </h4>
                    <p className="text-foreground/80 mb-2">
                      Cursor generates the code following your approved plan. Review the actual implementation. Since you already approved the architecture, you're only checking code quality—not catching structural mistakes.
                    </p>
                    <p className="text-sm text-foreground/60">
                      <strong>Time saved:</strong> No duplicate file cleanup, no path corrections, no architectural rework
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Real Example: Refactoring Authentication System
              </h4>
              <div className="text-sm text-foreground/80 space-y-2">
                <p><strong>Without PlanToCode:</strong> Ask Cursor to "refactor auth to use JWT instead of sessions." Cursor creates <code>auth-new.ts</code>, <code>middleware/auth.ts</code> (duplicate), misses updating <code>api/login.ts</code>. Spend 2 hours fixing.</p>
                <p><strong>With PlanToCode:</strong> Generate plan showing all 12 files that need changes. Catch that Cursor's initial plan missed 3 API routes. Approve corrected plan. Paste into Cursor. Done in 30 minutes, zero duplicates.</p>
              </div>
            </div>
          </section>

          {/* Why Planning-First Prevents Common Issues */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">Why Planning-First Prevents Cursor's Common Issues</h2>

            <p className="text-lg mb-6">
              The issues developers experience with Cursor aren't random—they're predictable consequences of generate-first workflows. Here's how planning-first prevents each one:
            </p>

            <div className="space-y-6">
              <GlassCard className="p-6">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-primary" />
                  Preventing Duplicate Files
                </h3>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="font-semibold text-red-400 mb-2">Cursor's Generate-First Approach:</p>
                    <p className="text-foreground/80">AI generates code immediately. If it can't find the right file or gets confused by similar names, it creates a new file. You discover duplicates after generation.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-green-400 mb-2">PlanToCode's Plan-First Approach:</p>
                    <p className="text-foreground/80">Plan lists exact file paths before any code generation. You see <code>components/Button.tsx</code> and <code>components/ui/Button.tsx</code> in the plan. You catch the duplicate naming issue during review.</p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-primary" />
                  Preventing Wrong File Paths
                </h3>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="font-semibold text-red-400 mb-2">Cursor's Generate-First Approach:</p>
                    <p className="text-foreground/80">Especially in multi-workspace projects, Cursor may generate code in the wrong workspace or use relative paths incorrectly. You discover path errors when code doesn't run.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-green-400 mb-2">PlanToCode's Plan-First Approach:</p>
                    <p className="text-foreground/80">File discovery shows the complete repository structure. Plans use absolute paths. You verify paths match your actual structure during the review phase. Cursor gets correct paths from the plan.</p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-primary" />
                  Preventing Production Bugs
                </h3>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="font-semibold text-red-400 mb-2">Cursor's Generate-First Approach:</p>
                    <p className="text-foreground/80">Changes are applied immediately. You might not notice that Cursor modified <code>utils/helpers.ts</code> which breaks 15 other files. You discover the breakage in production or during testing.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-green-400 mb-2">PlanToCode's Plan-First Approach:</p>
                    <p className="text-foreground/80">Plan shows all file modifications before execution. You see that <code>utils/helpers.ts</code> will change. You run dependency analysis. You realize 15 files depend on it. You adjust the plan accordingly.</p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-primary" />
                  Preventing Scope Creep
                </h3>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="font-semibold text-red-400 mb-2">Cursor's Generate-First Approach:</p>
                    <p className="text-foreground/80">Asked to "add dark mode toggle," Cursor might also refactor your entire theming system, update 30 components, and change your CSS architecture. You discover the scope explosion after generation.</p>
                  </div>
                  <div>
                    <p className="font-semibold text-green-400 mb-2">PlanToCode's Plan-First Approach:</p>
                    <p className="text-foreground/80">Plan shows "Changes: 47 files including complete theming refactor." You see the scope immediately. You refine the prompt: "Just add a toggle component, no refactoring." Regenerate plan. Now it's 3 files. Approve and execute.</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </section>

          {/* Comparison Table */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">Feature Comparison: Complementary Strengths</h2>

            <p className="text-lg mb-6">
              This isn't a competitive comparison—it's showing how the tools complement each other:
            </p>

            <GlassCard className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10">
                      <th className="text-left p-4 font-semibold">Capability</th>
                      <th className="text-left p-4 font-semibold">Cursor</th>
                      <th className="text-left p-4 font-semibold">PlanToCode</th>
                      <th className="text-left p-4 font-semibold">Better Together</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Code Generation Speed</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Excellent
                      </td>
                      <td className="p-4 text-foreground/60">Not included</td>
                      <td className="p-4 text-foreground/80">Cursor handles generation</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Autocomplete & IntelliSense</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Industry-leading
                      </td>
                      <td className="p-4 text-foreground/60">Not included</td>
                      <td className="p-4 text-foreground/80">Cursor handles autocomplete</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Implementation Planning</td>
                      <td className="p-4 text-foreground/60">Not available</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Core feature
                      </td>
                      <td className="p-4 text-foreground/80">PlanToCode guides Cursor</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Pre-Execution Review</td>
                      <td className="p-4 text-foreground/60">Manual via chat</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Built-in workflow
                      </td>
                      <td className="p-4 text-foreground/80">Review in PlanToCode, execute in Cursor</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">File Discovery & Analysis</td>
                      <td className="p-4 text-foreground/60">Basic indexing</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Advanced workflow
                      </td>
                      <td className="p-4 text-foreground/80">PlanToCode finds files, Cursor modifies them</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Duplicate File Prevention</td>
                      <td className="p-4 text-foreground/60">Not built-in</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Caught during review
                      </td>
                      <td className="p-4 text-foreground/80">PlanToCode prevents, Cursor executes correctly</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Multi-Model Synthesis</td>
                      <td className="p-4 text-foreground/60">Single model per request</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Compare & merge models
                      </td>
                      <td className="p-4 text-foreground/80">Best plan from multiple models → Cursor</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Team Approval Workflows</td>
                      <td className="p-4 text-foreground/60">Not built-in</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Full audit trail
                      </td>
                      <td className="p-4 text-foreground/80">Approve in PlanToCode, implement in Cursor</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Chat Interface</td>
                      <td className="p-4">
                        <CheckCircle2 className="w-5 h-5 text-green-400 inline mr-2" />
                        Excellent UX
                      </td>
                      <td className="p-4 text-foreground/60">Task-based UI</td>
                      <td className="p-4 text-foreground/80">Cursor's chat feels natural</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="p-4 font-medium">Pricing Model</td>
                      <td className="p-4">$20/month subscription</td>
                      <td className="p-4">Pay-as-you-go (no subscription)</td>
                      <td className="p-4 text-foreground/80">$20/mo + actual usage ($5-15 typical)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </section>

          {/* Real Cursor Users Who Added PlanToCode */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">Real Cursor Users Who Added PlanToCode</h2>

            <p className="text-lg mb-6">
              These workflows show how developers use both tools together:
            </p>

            <div className="space-y-6">
              <GlassCard className="p-6 border-primary/30">
                <h3 className="text-xl font-semibold mb-2">Solo Developer, Monorepo (120k LOC)</h3>
                <p className="text-foreground/80 mb-4">
                  "I was getting duplicate files constantly in my monorepo. Cursor would create <code>packages/api/auth.ts</code> and <code>packages/api/src/auth.ts</code>. Now I generate the plan in PlanToCode, verify the paths are correct, then paste into Cursor Agent. Zero duplicates since switching."
                </p>
                <p className="text-sm text-foreground/60">
                  <strong>Tools:</strong> Cursor Pro ($20/mo) + PlanToCode (~$8/mo usage)
                </p>
              </GlassCard>

              <GlassCard className="p-6 border-primary/30">
                <h3 className="text-xl font-semibold mb-2">Enterprise Team, Legacy Codebase (400k LOC)</h3>
                <p className="text-foreground/80 mb-4">
                  "Our compliance team requires all AI changes to be reviewed by a senior engineer before execution. PlanToCode gives us the approval workflow we need. Junior devs generate plans, seniors review and approve, then juniors paste approved plans into Cursor. Everyone's happy."
                </p>
                <p className="text-sm text-foreground/60">
                  <strong>Tools:</strong> Cursor Pro for 8 developers ($160/mo) + PlanToCode self-hosted server
                </p>
              </GlassCard>

              <GlassCard className="p-6 border-primary/30">
                <h3 className="text-xl font-semibold mb-2">Startup CTO, Multi-Workspace Project</h3>
                <p className="text-foreground/80 mb-4">
                  "Cursor's path errors in multi-workspace projects were killing us. PlanToCode's file discovery shows the complete structure across all workspaces. I verify paths in the plan, then Cursor executes perfectly because it has the right context."
                </p>
                <p className="text-sm text-foreground/60">
                  <strong>Tools:</strong> Cursor Pro ($20/mo) + PlanToCode (~$12/mo usage)
                </p>
              </GlassCard>

              <GlassCard className="p-6 border-primary/30">
                <h3 className="text-xl font-semibold mb-2">Freelancer, Client Projects</h3>
                <p className="text-foreground/80 mb-4">
                  "I bill clients hourly. Can't afford to spend 2 hours cleaning up duplicate files. PlanToCode catches everything during the 5-minute review phase. I show clients the plan for approval, they see exactly what they're paying for, then I execute in Cursor. Super professional."
                </p>
                <p className="text-sm text-foreground/60">
                  <strong>Tools:</strong> Cursor Pro ($20/mo) + PlanToCode (~$6/mo usage)
                </p>
              </GlassCard>
            </div>
          </section>

          {/* Getting Started */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">Getting Started with Both Tools</h2>

            <GlassCard className="p-8 bg-gradient-to-br from-primary/10 to-transparent">
              <h3 className="text-2xl font-bold mb-6">Setup Guide: Cursor + PlanToCode</h3>

              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold mb-2">Step 1: Install Both Tools</h4>
                  <ul className="text-foreground/80 space-y-2">
                    <li>• Download Cursor from <a href="https://cursor.sh" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">cursor.sh</a> ($20/month after trial)</li>
                    <li>• Download PlanToCode from <Link href="/downloads" className="text-primary hover:underline">our downloads page</Link> (free, pay-as-you-go API usage)</li>
                    <li>• Install both on the same machine for seamless workflow</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-lg font-semibold mb-2">Step 2: Try Your First Combined Workflow</h4>
                  <ol className="text-foreground/80 space-y-2 list-decimal list-inside">
                    <li>Open your project in Cursor (for context) and PlanToCode (for planning)</li>
                    <li>In PlanToCode: Describe a task, run file discovery, generate implementation plan</li>
                    <li>Review the plan in Monaco editor—check file paths, verify no duplicates</li>
                    <li>Copy the approved plan</li>
                    <li>In Cursor: Open Agent Terminal or Composer, paste the plan, let Cursor execute</li>
                    <li>Review Cursor's generated code (architecture already verified)</li>
                  </ol>
                </div>

                <div>
                  <h4 className="text-lg font-semibold mb-2">Step 3: Learn Advanced Workflows</h4>
                  <ul className="text-foreground/80 space-y-2">
                    <li>• Read our <Link href="/plan-mode/cursor" className="text-primary hover:underline">Cursor integration guide</Link> for detailed workflows</li>
                    <li>• See <Link href="/compare/cursor-vs-windsurf" className="text-primary hover:underline">detailed comparison</Link> for when to use which tool</li>
                    <li>• Explore <Link href="/docs/implementation-plans" className="text-primary hover:underline">implementation planning docs</Link> for best practices</li>
                  </ul>
                </div>
              </div>
            </GlassCard>

            <div className="grid md:grid-cols-2 gap-6 mt-8">
              <GlassCard className="p-6">
                <h4 className="text-lg font-semibold mb-3">Free Resources</h4>
                <ul className="space-y-2 text-sm text-foreground/80">
                  <li>
                    <Link href="/plan-mode/cursor" className="text-primary hover:underline">
                      → Cursor Integration Guide
                    </Link>
                  </li>
                  <li>
                    <Link href="/docs" className="text-primary hover:underline">
                      → Full Documentation
                    </Link>
                  </li>
                  <li>
                    <Link href="/compare/cursor-vs-windsurf" className="text-primary hover:underline">
                      → Detailed Tool Comparison
                    </Link>
                  </li>
                  <li>
                    <Link href="/features/file-discovery" className="text-primary hover:underline">
                      → File Discovery Workflow
                    </Link>
                  </li>
                </ul>
              </GlassCard>

              <GlassCard className="p-6">
                <h4 className="text-lg font-semibold mb-3">Quick Wins</h4>
                <ul className="space-y-2 text-sm text-foreground/80">
                  <li>✓ First plan generated in under 5 minutes</li>
                  <li>✓ Catch duplicate files before they're created</li>
                  <li>✓ Review exact file paths before execution</li>
                  <li>✓ No subscription required for PlanToCode</li>
                  <li>✓ Works with your existing Cursor setup</li>
                </ul>
              </GlassCard>
            </div>
          </section>

          {/* FAQ */}
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">{t['cursorAlternative.faq.title']}</h2>

            <div className="space-y-4">
              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q1.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q1.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q2.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q2.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q3.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q3.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q4.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q4.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q5.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q5.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q6.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q6.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q7.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q7.answer']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <h3 className="text-lg font-semibold mb-2">{t['cursorAlternative.faq.q8.question']}</h3>
                <p className="text-foreground/80">
                  {t['cursorAlternative.faq.q8.answer']}
                </p>
              </GlassCard>
            </div>
          </section>

          {/* CTA */}
          <section>
            <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-12 text-center">
              <h2 className="text-3xl font-bold mb-4">
                {t['cursorAlternative.finalCta.title']}
              </h2>
              <p className="text-xl text-foreground/80 mb-8 max-w-2xl mx-auto">
                {t['cursorAlternative.finalCta.description']}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <LinkWithArrow href="/downloads" className="inline-flex items-center text-lg">
                  {t['cursorAlternative.finalCta.download']}
                </LinkWithArrow>
                <Link
                  href="/plan-mode/cursor"
                  className="inline-flex items-center gap-2 text-lg text-primary hover:underline"
                >
                  {t['cursorAlternative.finalCta.guide']}
                  <span>→</span>
                </Link>
              </div>

              <p className="text-sm text-foreground/60">
                {t['cursorAlternative.finalCta.footer']}
              </p>
            </div>
          </section>

        </article>
      </main>
    </>
  );
}
