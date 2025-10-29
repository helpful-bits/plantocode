// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  CheckCircle2,
} from 'lucide-react';
import type { SoftwareApplication, FAQPage, VideoObject, ImageObject, Organization, WebSite } from 'schema-dts';
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



export const metadata: Metadata = {
  title: 'PlanToCode - Human-in-the-loop AI Planning for Large & Legacy Codebases',
  description: 'Generate granular, file-by-file implementation plans with exact repository paths. Human-reviewed approvals before execution. Prevent regressions with corporate AI governance. Microsoft Teams meeting ingestion.',
  keywords: [
    'human-in-the-loop ai',
    'corporate ai governance',
    'file-by-file implementation plans',
    'legacy codebase planning',
    'microsoft teams meeting ingestion',
    'ai plan approval workflow',
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
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    url: 'https://www.plantocode.com',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Architect Studio with Integrated Terminal',
      type: 'image/png',
    }],
    locale: 'en_US',
    alternateLocale: ['en_GB', 'en_CA'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'PlanToCode - AI Architect Studio with Integrated Terminal',
      width: 1200,
      height: 630,
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com',
  },
};

export default function Home() {
  const organizationJsonLd: Organization = {
    '@type': 'Organization',
    name: 'PlanToCode',
    url: 'https://www.plantocode.com',
    logo: 'https://www.plantocode.com/images/icon.png',
    description: 'Plan and ship code changes - find files, generate and merge AI plans, run them in a persistent terminal.',
    foundingDate: '2024',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: 'https://www.plantocode.com/support',
    },
  };

  const websiteJsonLd: WebSite = {
    '@type': 'WebSite',
    name: 'PlanToCode',
    url: 'https://www.plantocode.com',
    description: 'Plan and ship code changes - find files, generate and merge AI plans from multiple models, run them in a persistent terminal.',
    inLanguage: 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.plantocode.com/docs?q={search_term_string}',
      },
      // @ts-ignore - query-input is a valid schema.org property but not in the TypeScript types
      'query-input': 'required name=search_term_string',
    },
  };

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com',
    description: 'Plan and ship code changes. Find the right files, generate and merge implementation plans from multiple AI models, then run them in a persistent terminal. Available for Windows and macOS.',
    offers: {
      '@type': 'Offer',
      description: 'Pay-as-you-go API usage. No subscriptions or seat licenses.',
    },
    downloadUrl: 'https://www.plantocode.com/downloads',
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
      question: 'Can stakeholders review and approve plans before execution?',
      answer: 'Yes. PlanToCode provides a human-in-the-loop workflow where team leads and stakeholders can review generated implementation plans, edit details, request modifications, and approve changes before they are executed by coding agents or developers. This ensures corporate governance and prevents regressions.',
    },
    {
      question: 'How do Teams meetings become specifications?',
      answer: 'Upload Microsoft Teams meeting recordings or screen captures to PlanToCode. Advanced multimodal models analyze both audio transcripts (including speaker identification) and visual content (shared screens, documents) to extract specification requirements. You review the extracted insights - decisions, action items, discussion points - and incorporate them into implementation plans.',
    },
    {
      question: 'Do plans map to exact files in our repo?',
      answer: 'Yes. Implementation plans break down changes on a file-by-file basis with exact repository paths corresponding to your project structure. This granular approach ensures you know exactly what will be modified before execution, providing complete visibility and control.',
    },
    {
      question: 'How is this different from chat-based coding agents?',
      answer: 'PlanToCode is a desktop planning workspace. You run the file discovery workflow, review implementation plans in a Monaco editor, adjust prompts, and then launch the terminal from the same session. Chat tools hand you a single reply; here you stage the work before anything runs.',
    },
    {
      question: 'Do I need to know how to code?',
      answer: 'Yes. The app assumes you already work in large repositories and are comfortable with terminals, dependency graphs, and architecture trade-offs. The software keeps context organized so you can apply your judgment faster.',
    },
    {
      question: 'Which AI models can generate plans?',
      answer: 'The default configuration ships with Gemini 2.5 Pro, GPT-5, Claude 4.5 Sonnet, o3, Grok 4, DeepSeek R1, and Kimi K2. You can switch models per task from the settings panel before submitting a job.',
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


  const features = [
    {
      title: 'Specification capture & refinement',
      description: 'Voice dictation for rapid input, text enhancement for clarity, and task refinement to identify implied requirements and edge cases.',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
    },
    {
      title: 'Meeting recording ingestion',
      description: 'Upload Microsoft Teams meetings or screen recordings. Multimodal analysis extracts specifications from audio transcripts and visual content for review and incorporation.',
      icon: <Video className="w-8 h-8" />,
      href: '/features/video-analysis',
    },
    {
      title: 'Human-reviewed implementation plans',
      description: 'Generate file-by-file implementation plans with exact repository paths. Review, edit, and approve changes before execution to prevent regressions and ensure alignment with requirements.',
      icon: <Shield className="w-8 h-8" />,
      href: '/docs',
    },
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
      description: 'Highlight any selection to run the text-improvement job with Claude 4.5 Sonnet or Gemini 2.5 Flash. The rewrite preserves formatting and applies inside Monaco editors, task inputs, and terminal dictation.',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
    },
    {
      title: 'Model configuration per task',
      description: 'Choose from Gemini 2.5 Pro, GPT-5, Claude 4.5 Sonnet, Grok 4, DeepSeek R1, and Kimi K2 for implementation plans. Settings persist per project.',
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
      description: 'Demonstrates generating implementation plans from configured models such as Gemini 2.5 Pro, GPT-5, and Claude 4.5 Sonnet, then merging the preferred steps into a single draft.',
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
      name: 'PlanToCode App Icon',
      description: 'PlanToCode logo featuring a compass navigation symbol in a white circle with mountain silhouettes at the bottom, on a teal-blue gradient background',
      contentUrl: 'https://www.plantocode.com/images/icon.webp',
      thumbnailUrl: 'https://www.plantocode.com/images/icon.webp',
      width: '512',
      height: '512',
    },
    {
      '@type': 'ImageObject',
      name: 'PlanToCode File Discovery Screenshot',
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
      <StructuredData data={organizationJsonLd} />
      <StructuredData data={websiteJsonLd} />
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
            <h1>Plan software changes before you code</h1>
            <p>PlanToCode helps you find the right files, generate and merge implementation plans, then run them in a persistent terminal. You see scope before you run anything. Plans are editable and traceable.</p>
          </div>
          <section className="mb-0">
            <HeroSection />
          </section>
          <SectionDividerMesh />

          {/* Human-in-the-loop Implementation Planning */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-6xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Human-in-the-loop Governance</h2>
              <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
                Maintain full control over AI-generated implementation plans. Review, edit, approve, and audit every step before execution.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">File-by-file Plans with Exact Paths</h3>
                  <p className="text-foreground/80">
                    Implementation plans break down changes on a file-by-file basis with exact repository paths, ensuring complete visibility into what will be modified.
                  </p>
                </GlassCard>
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">Review, Edit & Approve Workflow</h3>
                  <p className="text-foreground/80">
                    Team leads and stakeholders can review proposed changes, directly edit plan details, request modifications, and approve plans before execution.
                  </p>
                </GlassCard>
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">Safe Handoff to Agents</h3>
                  <p className="text-foreground/80">
                    Once approved, plans are securely transmitted to your chosen coding agent or assigned to developers, preventing regressions and ensuring alignment with requirements.
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>
          <SectionDividerMesh />

          {/* Specification Capture Mode */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-6xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Specification Capture & Refinement</h2>
              <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
                Rapidly crystallize ideas into clear, actionable specifications with voice dictation and AI-powered enhancement.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6">
                  <Mic className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Voice Dictation</h3>
                  <p className="text-foreground/80 mb-4">
                    Capture initial requirements through voice input, which you can then refine manually for precision and clarity.
                  </p>
                  <Link href="/features/voice-transcription" className="text-primary hover:underline text-sm font-medium">
                    Learn more →
                  </Link>
                </GlassCard>
                <GlassCard className="p-6">
                  <Sparkles className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Text Enhancement</h3>
                  <p className="text-foreground/80 mb-4">
                    Improve grammar, sentence structure, clarity, and conciseness while maintaining your original intent, tone, and technical detail level.
                  </p>
                  <Link href="/features/text-improvement" className="text-primary hover:underline text-sm font-medium">
                    Learn more →
                  </Link>
                </GlassCard>
                <GlassCard className="p-6">
                  <Code2 className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Task Refinement</h3>
                  <p className="text-foreground/80 mb-4">
                    Expand task descriptions by identifying implied requirements, clarifying expected behavior and edge cases, and adding technical considerations.
                  </p>
                  <Link href="/features/text-improvement" className="text-primary hover:underline text-sm font-medium">
                    Learn more →
                  </Link>
                </GlassCard>
              </div>
            </div>
          </section>
          <SectionDividerMesh />

          {/* Meeting & Recording Ingestion */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-6xl">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Meeting & Recording Ingestion</h2>
              <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
                Transform Microsoft Teams meetings and screen recordings into actionable implementation requirements.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <Video className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Multimodal Analysis</h3>
                  <p className="text-foreground/80 mb-4">
                    Upload Microsoft Teams meetings or screen recordings. Advanced multimodal models analyze both audio transcripts (with speaker identification) and relevant visual content (shared screens, presented documents, key moments) to extract specification requirements.
                  </p>
                  <Link href="/features/video-analysis" className="text-primary hover:underline text-sm font-medium">
                    Learn more →
                  </Link>
                </GlassCard>
                <GlassCard className="p-6">
                  <CheckCircle2 className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-xl font-semibold mb-3">Review & Incorporate Insights</h3>
                  <p className="text-foreground/80 mb-4">
                    Extracted insights - summarized decisions, action items, and key discussion points - are presented in an intuitive interface where team leads can review, select, and incorporate them into actionable implementation plans.
                  </p>
                  <Link href="/features/video-analysis" className="text-primary hover:underline text-sm font-medium">
                    Learn more →
                  </Link>
                </GlassCard>
              </div>
            </div>
          </section>
          <SectionDividerMesh />

          <Features features={features} />
          <SectionDividerMesh />

          <section id="pricing">
            <Pricing />
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