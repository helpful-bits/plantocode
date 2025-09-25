// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { GlassCard } from '@/components/ui/GlassCard';
import { cdnUrl } from '@/lib/cdn';
import {
  Search,
  Globe,
  Zap,
  Shield,
  Video,
  History,
  Sparkles,
  Code2,
  GitMerge,
  Mic,
} from 'lucide-react';
import type { SoftwareApplication, FAQPage, VideoObject, ImageObject } from 'schema-dts';
import { SectionDividerMesh } from '@/components/ui/SectionDivider';


const Features = dynamic(() => import('@/components/landing/Features').then(mod => ({ default: mod.Features })), {
  loading: () => <div className="h-[50vh]" />,
});


const Pricing = dynamic(() => import('@/components/landing/Pricing').then(mod => ({ default: mod.Pricing })), {
  loading: () => <div className="h-[40vh]" />,
});

const FAQ = dynamic(() => import('@/components/landing/FAQ').then(mod => ({ default: mod.FAQ })), {
  loading: () => <div className="h-[50vh]" />,
});

const CallToAction = dynamic(() => import('@/components/landing/CallToAction').then(mod => ({ default: mod.CallToAction })), {
  loading: () => <div className="h-[30vh]" />,
});

const Value = dynamic(() => import('@/components/landing/Value').then(mod => ({ default: mod.Value })), {
  loading: () => <div className="h-[40vh]" />,
});


export const metadata: Metadata = {
  title: 'Vibe Manager - Experience the true intelligence of GPT-5 and Gemini 2.5 Pro',
  description: 'Discover relevant files automatically, compare implementation plans from the most powerful AI models, then execute through integrated terminal. The planning workspace that makes AI coding tools work for real codebases.',
  keywords: [
    'ai plan editor',
    'monaco editor plans',
    'merge ai plans',
    'implementation plan editor',
    'merge instructions ai',
    'edit ai generated code',
    'integrated terminal claude code',
    'run claude code in app',
    'codex cli terminal',
    'cursor cli',
    'gemini cli',
    'multi model planning',
    'gpt-5 planning',
    'claude sonnet 4',
    'gemini 2.5 pro',
    'grok 4',
    'deepseek r1',
    'kimi k2',
    'file discovery workflow',
    'voice transcription coding',
    'token estimates',
    'desktop ai planning',
  ],
  openGraph: {
    title: 'Vibe Manager - Stop guessing which files matter in your codebase',
    description: 'Automatically discover relevant files, experience the true intelligence of GPT, Gemini, and Claude through plan comparison, then execute through integrated terminal. The planning workspace that makes AI coding tools work for real codebases.',
    url: 'https://www.vibemanager.app',
    siteName: 'Vibe Manager',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'Vibe Manager - AI Architect Studio with Integrated Terminal',
      type: 'image/png',
    }],
    locale: 'en_US',
    alternateLocale: ['en_GB', 'en_CA'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe Manager - Stop guessing which files matter in your codebase',
    description: 'Experience the true intelligence of GPT, Gemini, and Claude with automatic file discovery, plan comparison, and integrated execution.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'Vibe Manager - AI Architect Studio with Integrated Terminal',
      width: 1200,
      height: 630,
    }],
  },
  alternates: {
    canonical: 'https://www.vibemanager.app',
  },
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.vibemanager.app',
    description: 'Desktop planning workspace with a Monaco editor for implementation plans. Generate approaches from configured models, merge them with custom instructions, and execute from the integrated terminal that launches claude, cursor, codex, or gemini without context switching. Available for Windows and macOS.',
    offers: {
      '@type': 'Offer',
      price: 0, // Numeric 0 for free apps, no priceCurrency needed per Google guidance
      description: 'Free app with pay-as-you-go API usage. $5 free credits on signup.',
    },
    downloadUrl: 'https://www.vibemanager.app/downloads',
    softwareVersion: '1.0.23',
    // @ts-ignore - isRelatedTo is a valid schema.org property but not in the TypeScript types
    isRelatedTo: [
      {
        '@type': 'SoftwareApplication',
        name: 'Claude Code',
        applicationCategory: 'DeveloperApplication',
        creator: {
          '@type': 'Organization',
          name: 'Anthropic'
        }
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Cursor',
        applicationCategory: 'DeveloperApplication'
      },
      {
        '@type': 'SoftwareApplication',
        name: 'OpenAI Codex',
        applicationCategory: 'DeveloperApplication',
        creator: {
          '@type': 'Organization',
          name: 'OpenAI'
        }
      }
    ],
    // Note: aggregateRating and review should be added when visible on the page
  };

  const faqItems = [
    {
      question: 'How is this different from chat-based coding agents?',
      answer: 'Vibe Manager is a desktop planning workspace. You run the file discovery workflow, review implementation plans in a Monaco editor, adjust prompts, and then launch the terminal from the same session. Chat tools hand you a single reply; here you stage the work before anything runs.',
    },
    {
      question: 'Do I need to know how to code?',
      answer: 'Yes. The app assumes you already work in large repositories and are comfortable with terminals, dependency graphs, and architecture trade-offs. The software keeps context organized so you can apply your judgment faster.',
    },
    {
      question: 'Which AI models can generate plans?',
      answer: 'The default configuration ships with OpenAI GPT-5, Gemini 2.5 Pro, Anthropic Claude 4 Sonnet, OpenAI o3, xAI Grok 4, DeepSeek R1, and Moonshot Kimi K2. You can switch models per task from the settings panel before submitting a job.',
    },
    {
      question: 'What happens to my source code?',
      answer: 'Project state, terminal logs, and plan drafts are stored locally in SQLite. Only the prompt you approve plus the files you select are sent through your configured server proxy. The Rust server in this repo can be self-hosted when you need to keep traffic on your own infrastructure.',
    },
    {
      question: 'Which CLI tools work inside the terminal?',
      answer: 'The terminal boots the same shell you use on the host machine and auto-detects claude, cursor, codex, and gemini binaries. You can still run any other tooling manually - the PTY session is a regular shell with voice dictation available when you need hands-free input.',
    },
    {
      question: 'How does it cope with large codebases?',
      answer: 'Start the file finder workflow to generate search patterns, relevance scoring, and prioritized file lists. Each stage runs as its own background job so you can inspect results before applying the selections to your session.',
    },
    {
      question: 'Can I edit AI-generated plans before execution?',
      answer: 'Absolutely. Plans open in a Monaco editor with syntax highlighting, diff-friendly formatting, and clipboard helpers. You can tweak the prompt, copy individual steps, and rerun generation without leaving the workspace.',
    },
    {
      question: 'How do merge instructions work?',
      answer: 'Select two or more plans, write the merge guidance, and submit. The merged result is saved alongside the originals so you can compare drafts, keep notes, or rerun the merge with different instructions.',
    },
    {
      question: 'Why do senior engineers use this?',
      answer: 'Token estimates, prompt previews, terminal health monitoring, and persistent sessions reduce rework. You decide when to run commands and which model to trust, while the app handles orchestration details.',
    },
    {
      question: 'What does a typical workflow look like?',
      answer: 'Describe the task (typing or voice) → run the file finder workflow → generate one or more implementation plans → edit or merge plans in the Monaco editor → launch the built-in terminal to execute the plan and monitor logs. Sessions and logs stay available the next time you open the app.',
    },
  ];

  const faqPageJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const valuePropositions = [
    {
      title: 'Review plans before anything runs',
      metric: 'Prompt control',
      description: 'Preview the exact prompt, inspect token estimates, and edit the Monaco draft before you trigger a job. Plans stay alongside their background job history so you can revisit changes later.',
      icon: <Shield className="w-8 h-8" />,
      features: ['Prompt preview & copy helpers', 'Token estimates with context window checks'],
    },
    {
      title: 'Find the right files without guesswork',
      metric: 'File discovery',
      description: 'Run the staged file finder workflow to generate search patterns, relevance scoring, and prioritized selections. Apply the results directly to your session when you are satisfied.',
      icon: <Search className="w-8 h-8" />,
      features: ['Regex pattern generation', 'Relevance ranking before inclusion'],
    },
    {
      title: 'Keep work in sync across restarts',
      metric: 'Persistent sessions',
      description: 'Session state, plan drafts, and terminal logs are stored locally. Close the laptop mid-debug and resume later with the same job history and shell output.',
      icon: <History className="w-8 h-8" />,
      features: ['SQLite-backed terminal log ring buffer', 'Session restoration on launch'],
    },
    {
      title: 'Capture ideas hands-free',
      metric: 'Voice input',
      description: 'Use built-in voice transcription for task descriptions or terminal commands. Configure language and temperature defaults per project.',
      icon: <Video className="w-8 h-8" />,
      features: ['Realtime transcription pipeline', 'Per-project language settings'],
    },
  ];

  const features = [
    {
      title: 'File discovery workflow',
      description: 'Start staged background jobs for regex pattern generation, relevance scoring, and path correction. Review each stage before applying the results to your session.',
      icon: <Search className="w-8 h-8" />,
      href: '/features/file-discovery',
    },
    {
      title: 'Voice transcription pipeline',
      description: 'Record task descriptions or terminal commands and send them through the transcription service. Configure language and temperature defaults for each project.',
      icon: <Mic className="w-8 h-8" />,
      href: '/features/voice-transcription',
    },
    {
      title: 'Text improvement popover',
      description: 'Highlight any selection to run the text-improvement job with Claude Sonnet 4 or Gemini 2.5 Flash. The rewrite preserves formatting and applies inside Monaco editors, task inputs, and terminal dictation.',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
    },
    {
      title: 'Model configuration per task',
      description: 'Choose from GPT-5, Gemini 2.5 Pro, Claude 4 Sonnet, Grok 4, DeepSeek R1, and Kimi K2 for implementation plans. Settings persist per project.',
      icon: <Globe className="w-8 h-8" />,
      href: '/docs/model-configuration',
    },
    {
      title: 'Token guardrails & prompt preview',
      description: 'View the exact prompt, estimated token counts, and context window warnings before you submit a job. Adjust instructions with full visibility.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Monaco implementation plan editor',
      description: 'Plans open in a Monaco editor with syntax highlighting, diff-friendly formatting, and clipboard helpers. Edit steps, store drafts, and keep templates ready for the next task.',
      icon: <Code2 className="w-8 h-8" />,
      href: '/features/plan-mode',
    },
    {
      title: 'Merge plans with instructions',
      description: 'Select multiple plans, write merge guidance, and keep the merged output alongside the originals. Iterate until the approach matches your standards.',
      icon: <GitMerge className="w-8 h-8" />,
      href: '/features/merge-instructions',
    },
    {
      title: 'Integrated PTY terminal with CLI detection',
      description: 'Launch claude, cursor, codex, or gemini directly in the built-in terminal. Health monitoring, auto-recovery, and resize handling keep long-running jobs stable.',
      icon: <Zap className="w-8 h-8" />,
      href: '/features/integrated-terminal',
    },
    {
      title: 'Persistent sessions and logs',
      description: 'Terminal output is stored in a 5 MB ring buffer and project sessions reload on start-up. Pick up outstanding work without rebuilding context.',
      icon: <History className="w-8 h-8" />,
      href: '/docs/terminal-sessions',
    },
  ];

  // Video structured data for better indexing
  const videoStructuredData: VideoObject[] = [
    {
      '@type': 'VideoObject',
      name: 'File Discovery & Search in Your Codebase',
      description: 'Walkthrough of the staged file finder workflow generating search patterns, relevance scoring, and prioritized selections before they are applied to a session.',
      thumbnailUrl: cdnUrl('/assets/images/step-2-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-2-find.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT50S',
    },
    {
      '@type': 'VideoObject',
      name: 'Plan Creation & Merge from Multiple AI Models',
      description: 'Demonstrates generating implementation plans from configured models such as Gemini 2.5 Pro, GPT-5, and Claude 4 Sonnet, then merging the preferred steps into a single draft.',
      thumbnailUrl: cdnUrl('/assets/images/step-4-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-4-merge.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT60S',
    },
    {
      '@type': 'VideoObject',
      name: 'Deep Research & Context Analysis',
      description: 'Shows background jobs collecting additional context and impact analysis before implementation planning begins.',
      thumbnailUrl: cdnUrl('/assets/images/step-3-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-3-generate.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT55S',
    },
    {
      '@type': 'VideoObject',
      name: 'AI Text Enhancement - Task Description',
      description: 'Illustrates using the text improvement tools to enrich task descriptions with goals, constraints, and affected areas before planning.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-text-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-text.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
    },
    {
      '@type': 'VideoObject',
      name: 'Voice Dictation - Faster Input',
      description: 'Highlights the voice transcription pipeline that turns spoken input into task descriptions or terminal commands.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-voice-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-voice.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT30S',
    },
    {
      '@type': 'VideoObject',
      name: 'Screen Recording - Instant Error Capture',
      description: 'Captures how screen recordings are analysed so you can pull technical details into implementation plans.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-video-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-video.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT40S',
    },
    {
      '@type': 'VideoObject',
      name: 'Settings & Prompt Customization',
      description: 'Covers configuring models, editing system prompts, and adjusting project defaults for the integrated terminal and planning tasks.',
      thumbnailUrl: cdnUrl('/assets/images/step-5-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-5-customize.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
    },
  ];

  // Image structured data for better indexing
  const imageStructuredData: ImageObject[] = [
    {
      '@type': 'ImageObject',
      name: 'Vibe Manager App Icon',
      description: 'Vibe Manager logo featuring a compass navigation symbol in a white circle with mountain silhouettes at the bottom, on a teal-blue gradient background',
      contentUrl: 'https://www.vibemanager.app/images/icon.webp',
      thumbnailUrl: 'https://www.vibemanager.app/images/icon.webp',
      width: '512',
      height: '512',
    },
    {
      '@type': 'ImageObject',
      name: 'Vibe Manager File Discovery Screenshot',
      description: 'Screenshot showing the AI-powered file discovery interface with generated search patterns and relevance ranking.',
      contentUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Multi-Model Implementation Plans',
      description: 'Interface showing implementation plans from multiple configured models merged into a single draft.',
      contentUrl: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Video Analysis Feature',
      description: 'Screen recording analysis interface showing Gemini 2.5 Pro extracting technical details from visual context',
      contentUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Settings and Prompt Customization',
      description: 'Configuration interface for AI models, system prompts, and workflow customization for Claude Code, Cursor, and OpenAI Codex',
      contentUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
    },
  ];


  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <StructuredData data={faqPageJsonLd} />
      {videoStructuredData.map((video, index) => (
        <StructuredData key={`video-${index}`} data={video} />
      ))}
      {imageStructuredData.map((image, index) => (
        <StructuredData key={`image-${index}`} data={image} />
      ))}
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          {/* SR-only content for better Google snippets */}
          <div className="sr-only">
            <h1>Vibe Manager - AI planning workspace for implementation plans</h1>
            <p>Generate and edit implementation plans in a Monaco editor, run the staged file discovery workflow, choose from configured models such as Gemini 2.5 Pro, GPT-5, Claude 4 Sonnet, Grok 4, DeepSeek R1, and Kimi K2, and execute through the integrated terminal that launches claude, cursor, codex, or gemini without leaving the app.</p>
          </div>
          <section className="mb-0">
            <HeroSection />
          </section>
          <SectionDividerMesh />

          <Value propositions={valuePropositions} />
          <SectionDividerMesh />

          <Features features={features} />
          <SectionDividerMesh />

          <section id="pricing">
            <Pricing />
          </section>
          <SectionDividerMesh />

          <section className="py-16 px-4">
            <GlassCard className="max-w-3xl mx-auto p-8 sm:p-12 text-center" highlighted>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Try Before You Buy</h2>
              <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                Experience the full workflow with our interactive demo - no installation required
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button variant="cta" size="lg" asChild>
                  <Link href="/demo">
                    Launch Interactive Demo
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="/screenshots">
                    View All Screenshots
                  </Link>
                </Button>
              </div>
            </GlassCard>
          </section>
          <SectionDividerMesh />

          <section id="faq" className="pt-8">
            <FAQ items={faqItems} />
          </section>
          <SectionDividerMesh />

          <section id="cta" className="pt-8">
            <CallToAction
              description="Plan, review, and run AI-assisted changes from one workspace. Keep models, prompts, files, and terminal output aligned."
              title="Ready to coordinate your next implementation plan?"
            />
          </section>
        </main>
      </div>
    </>
  );
}