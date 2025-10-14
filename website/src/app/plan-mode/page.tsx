import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoButton } from '@/components/ui/VideoButton';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Code2, Terminal, GitMerge, Search, Zap } from 'lucide-react';
import type { SoftwareApplication } from 'schema-dts';

export const metadata: Metadata = {
  title: 'AI Architect for Codex CLI, Claude Code & Cursor | Stop AI Drift in 2025',
  description: 'Pre-plan complex changes before AI writes code. Discover impacted files, merge multi-model plans (GPT-5, Claude 4, Gemini 2.5), execute with full visibility. Used by senior engineers who review before they run.',
  keywords: [
    'codex cli planning workflow',
    'codex cli architectural planning',
    'claude code planning workflow',
    'cursor planning workflow',
    'claude code plan mode complement',
    'openai codex cli approval modes',
    'codex cli read-only mode',
    'cursor composer planning',
    'cursor agent mode workflow',
    'claude code cli planning',
    'ai architectural planning',
    'multi-model plan synthesis',
    'file discovery for cli tools',
    'vibe manager'
  ],
};

export default function HirePage() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.vibemanager.app/plan-mode',
    description: 'Desktop planning workspace that helps you generate, merge, and execute implementation plans—then run them in an integrated terminal.',
    offers: {
      '@type': 'Offer',
      price: 0,
      description: 'Free app with pay-as-you-go API usage. $5 free credits on signup.',
    },
  };

  const realCircumstances = [
    {
      moment: 'AI fixes the symptom in /components, misses the cause in /config',
      progress: 'Guide it to the right abstraction layer with file discovery',
      icon: <Search className="w-5 h-5" />
    },
    {
      moment: 'One plan catches edge cases, another handles error states, third adds types',
      progress: 'AI architect combines complementary insights into complete implementation',
      icon: <Code2 className="w-5 h-5" />
    },
    {
      moment: 'AI drifts from your requirements, builds what it thinks you want',
      progress: 'AI architect keeps plans aligned with your actual goals, no drift',
      icon: <Zap className="w-5 h-5" />
    },
    {
      moment: 'Your change breaks three downstream services, discovered in prod',
      progress: 'File discovery maps all dependencies upfront, catches impacts early',
      icon: <GitMerge className="w-5 h-5" />
    },
  ];

  const whatYouGet = [
    {
      capability: 'Know what will be changed before it happens',
      details: 'File discovery shows exact impact. See which files each plan touches. No surprises.',
      link: '/docs/file-discovery'
    },
    {
      capability: 'AI architect merges plans with your guidance',
      details: 'Guide the merge with your architectural requirements. AI consolidates complementary details from multiple runs into one comprehensive plan',
      link: '/features/plan-editor'
    },
    {
      capability: 'One-click prompts that work',
      details: 'Copy buttons for your battle-tested prompts. No more retyping "make it type-safe" 20 times.',
      link: '/features/copy-buttons'
    },
    {
      capability: 'Execution with full control',
      details: 'Review the plan, verify the scope, then execute. Or paste into your IDE\'s chat.',
      link: '/features/integrated-terminal'
    },
  ];

  const workflow = [
    {
      step: 'File Discovery',
      description: 'Multi-stage workflow surfaces the right files before you plan',
      icon: <Search className="w-5 h-5" />
    },
    {
      step: 'Generate Plans',
      description: 'Run models multiple times (3x GPT-5, 2x Gemini) with token guardrails',
      icon: <Code2 className="w-5 h-5" />
    },
    {
      step: 'AI Merges + You Guide',
      description: 'Provide merge instructions, AI consolidates complementary details from multiple runs',
      icon: <GitMerge className="w-5 h-5" />
    },
    {
      step: 'Execute',
      description: 'Run in terminal or paste into Cursor/Windsurf chat',
      icon: <Terminal className="w-5 h-5" />
    },
  ];

  const whyNowReasons = [
    {
      reason: 'Models are borderline genius now',
      detail: 'GPT-5, Gemini 2.5 Pro, Claude 4 write flawless code. But they don\'t know YOUR architecture, YOUR patterns, YOUR constraints.'
    },
    {
      reason: 'Codebases are interconnected systems',
      detail: 'Change the user service, break the mobile app. Update this interface, affect three microservices. AI doesn\'t see these connections.'
    },
    {
      reason: 'Every IDE has AI now',
      detail: 'Codex CLI, Claude Code, Cursor, Windsurf - they\'re all brilliant at the micro level. You need something that sees the macro.'
    },
  ];

  const integrationPaths = [
    {
      name: 'Codex CLI planning workflow',
      description: 'Map every dependency, merge multi-model plans, then execute with Codex approval modes for safe iteration.',
      href: '/plan-mode/codex',
      icon: <Terminal className="w-5 h-5 text-primary" />
    },
    {
      name: 'Claude Code planning workflow',
      description: 'Enhance Claude Code\'s native Plan Mode with multi-model synthesis, file discovery, and merge instructions.',
      href: '/plan-mode/claude-code',
      icon: <GitMerge className="w-5 h-5 text-primary" />
    },
    {
      name: 'Cursor planning workflow',
      description: 'Give Cursor Composer and Agent mode full architectural context with WSL-friendly execution guardrails.',
      href: '/plan-mode/cursor',
      icon: <Code2 className="w-5 h-5 text-primary" />
    },
  ];

  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />

        <main>
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Terminal className="w-4 h-4" />
                  <span>For developers who review before they run</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Architectural Planning for Codex CLI, Claude Code & Cursor
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed mb-6">
                  You can't possibly remember to mention every webhook, cache, background job,
                  and API consumer that depends on that one function. That's how regressions sneak in.
                </p>
                <p className="text-base sm:text-lg text-foreground/80 mb-8">
                  <strong>The newest, most advanced models are brilliant at code, blind to architecture.</strong><br/>
                  See the full scope, guide it to the right files, pick the approach that fits your system.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">
                      Install Vibe Manager
                    </Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60 mt-4">
                  $5 free credits • Pay-as-you-go • Works with any AI coding tool
                </p>
              </div>

              {/* Choose your IDE */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Choose your CLI planning workflow</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {integrationPaths.map((item, i) => (
                    <GlassCard key={i} className="p-6 h-full" highlighted>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="mt-1">{item.icon}</div>
                        <div>
                          <h3 className="font-semibold text-lg">{item.name}</h3>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed mb-4">{item.description}</p>
                      <LinkWithArrow href={item.href} className="text-sm">
                        Open the {item.name} guide
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Real circumstances */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">When AI needs architectural context</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {realCircumstances.map((item, i) => (
                    <GlassCard key={i} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="text-primary mt-1">{item.icon}</div>
                        <div>
                          <div className="font-semibold text-lg mb-2">{item.moment}</div>
                          <div className="text-foreground/70">{item.progress}</div>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
                <div className="text-center mt-8">
                  <p className="text-foreground/80">
                    These aren't "pain points." They're moments where you need <strong>visibility and control</strong><br/>
                    before committing to an approach. That's what we built.
                  </p>
                </div>
              </div>

              {/* What you actually get */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">What you actually get</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {whatYouGet.map((item, i) => (
                    <GlassCard key={i} className="p-6" highlighted>
                      <h3 className="font-semibold text-lg mb-2">{item.capability}</h3>
                      <p className="text-sm text-foreground/70 mb-3">{item.details}</p>
                      <LinkWithArrow href={item.link} className="text-sm">
                        See how it works
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Why now */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why this matters now</h2>
                <div className="space-y-4">
                  {whyNowReasons.map((item, i) => (
                    <GlassCard key={i} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {i + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold mb-1">{item.reason}</h3>
                          <p className="text-foreground/70">{item.detail}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* How it works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How it works</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {workflow.map((item, i) => (
                    <GlassCard key={i} className="p-6" highlighted>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="text-primary">{item.icon}</div>
                        <span className="font-semibold">{item.step}</span>
                      </div>
                      <p className="text-sm text-foreground/70">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
                <div className="mt-6 text-center">
                  <LinkWithArrow href="/how-it-works">
                    See detailed workflow
                  </LinkWithArrow>
                </div>
              </div>

              {/* Who uses this */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Who's using this</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">Senior engineers</h3>
                    <p className="text-sm text-foreground/70">
                      "AI kept fixing symptoms, not causes. Now I guide it to the right abstraction layer
                      first. File discovery shows the real architecture before any code is written."
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">CLI agent users</h3>
                    <p className="text-sm text-foreground/70">
                      "My CLI agent would miss edge cases or break existing features.
                      Now the AI architect catches gaps and regressions in plans before they hit my codebase."
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">Cursor & Windsurf users</h3>
                    <p className="text-sm text-foreground/70">
                      "IDE agents lack architectural context. Now my AI architect pre-plans the right approach,
                      considering all system impacts. Then I paste the validated plan into Cursor."
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* The real progress you make */}
              <div className="mb-16 text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6">The progress you actually make</h2>
                  <div className="space-y-6 max-w-2xl mx-auto">
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">Ship complex features with confidence</p>
                      <p className="text-sm text-foreground/70">AI architect merges complementary insights from multiple plans into complete implementation</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">Guide merges with your expertise</p>
                      <p className="text-sm text-foreground/70">Tell AI what you like, what to avoid. It follows your architectural decisions surprisingly well</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">Execute with full visibility</p>
                      <p className="text-sm text-foreground/70">See exact scope before running. Integrated terminal or paste to your IDE</p>
                    </div>
                    <p className="text-sm text-foreground/60 mt-8">
                      <em>AI generates the code. You architect the solution.</em>
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to hire your architect?</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Join developers who ship big changes with clarity, traceability, and operational reliability.
                  </p>

                  <PlatformDownloadSection location="hire_page" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">
                      Try interactive demo first
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/support#book">
                      Book architect session
                    </LinkWithArrow>
                  </div>
                  <p className="text-sm text-foreground/70 mt-6">
                    Pay-as-you-go credits. $5 free promo for new users. No subscriptions.
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
