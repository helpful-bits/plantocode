// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { cdnUrl } from '@/lib/cdn';
import {
  Search,
  Globe,
  BrainCircuit,
  Save,
  Zap,
  Shield,
  Video,
  History,
  Sparkles,
} from 'lucide-react';
import type { SoftwareApplication, FAQPage, VideoObject, ImageObject } from 'schema-dts';
import { SectionDividerMesh } from '@/components/ui/SectionDivider';

const FounderProof = dynamic(() => import('@/components/landing/FounderProof').then(mod => ({ default: mod.FounderProof })), {
  loading: () => <div className="h-[20vh]" />,
});

const Features = dynamic(() => import('@/components/landing/Features').then(mod => ({ default: mod.Features })), {
  loading: () => <div className="h-[50vh]" />,
});


const Pricing = dynamic(() => import('@/components/landing/Pricing').then(mod => ({ default: mod.Pricing })), {
  loading: () => <div className="h-[40vh]" />,
});

const FAQ = dynamic(() => import('@/components/landing/FAQ').then(mod => ({ default: mod.FAQ })), {
  loading: () => <div className="h-[50vh]" />,
});

const Community = dynamic(() => import('@/components/landing/Community').then(mod => ({ default: mod.Community })), {
  loading: () => <div className="h-[40vh]" />,
});

const CallToAction = dynamic(() => import('@/components/landing/CallToAction').then(mod => ({ default: mod.CallToAction })), {
  loading: () => <div className="h-[30vh]" />,
});

const Value = dynamic(() => import('@/components/landing/Value').then(mod => ({ default: mod.Value })), {
  loading: () => <div className="h-[40vh]" />,
});


export const metadata: Metadata = {
  title: 'Vibe Manager - AI Architect Studio with Full Plan Editor & Merge Control',
  description: 'Edit AI plans in Monaco editor. Merge multiple plans with your instructions. Integrated terminal runs codex, claude, cursor, aider. Built for senior engineers who need control, not chat interfaces.',
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
    'aider integrated',
    'heavy coding agent users',
    'staff engineer tools',
    'gpt-5 planning',
    'claude sonnet 4',
    'gemini 2.5 pro',
    'o3 mini',
    'o4 mini',
    'grok 4',
    'deepseek r1',
    'kimi k2',
    'terminal orchestration',
    'voice dictation terminal',
    'session transcripts',
    'command approvals',
    'code aware discovery',
    'impact surface analysis',
    'legacy patterns',
    'professional ai planning',
    'single tenant',
    'on prem ai',
    'claude code terminal',
    'cursor alternative',
    'agentic power users',
    'serious codebases',
    'implementation blueprints',
  ],
  openGraph: {
    title: 'Vibe Manager - Serious AI Architect Studio',
    description: 'Planning layer for heavy coding-agent users. Integrated terminal runs codex, claude, cursor, aider. Multi-model strategies from GPT-5, Claude Sonnet 4, Gemini 2.5 Pro. Voice dictation. Session transcripts.',
    url: 'https://www.vibemanager.app',
    siteName: 'Vibe Manager',
    locale: 'en_US',
    alternateLocale: ['en_GB', 'en_CA'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe Manager - AI Architect Studio',
    description: 'Built for agentic power users. Plan with multiple models. Execute in integrated terminal. Ship safely in large codebases.',
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
    description: 'AI Architect Studio with full Monaco editor for plans. Generate multiple approaches, merge with custom instructions, edit before execution. Integrated terminal runs codex, claude, cursor, aider. Not a chat - a real IDE for AI planning. Windows & Mac.',
    offers: {
      '@type': 'Offer',
      price: 0, // Numeric 0 for free apps, no priceCurrency needed per Google guidance
      description: 'Free app with pay-as-you-go API usage. $10 free credits on signup.',
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
      question: 'How is this different from Cursor/Claude Code/Windsurf?',
      answer: 'Those are chat interfaces. This is a planning IDE. Generate multiple AI strategies, edit them in Monaco editor, merge with your instructions, then execute in integrated terminal. Chat tools give you one answer. We give you control over the planning process. Plus integrated terminal runs codex, claude, cursor, aider without switching apps.',
    },
    {
      question: 'Do I need to know how to code?',
      answer: 'Yes. This is built for staff/principal engineers managing complex codebases. If you\'re looking for "no-code AI," this isn\'t it. We assume you understand terminals, dependencies, architecture decisions. This tool amplifies expert knowledge, doesn\'t replace it.',
    },
    {
      question: 'What AI models are supported?',
      answer: 'All the best ones: GPT-5, Claude Sonnet 4, Gemini 2.5 Pro, o3/o4-mini, Grok 4, DeepSeek R1, Kimi K2. Generate plans from multiple models simultaneously, compare approaches, merge the best parts. One model is never enough for production-grade decisions.',
    },
    {
      question: 'Is my code secure?',
      answer: 'Your code stays local. We only send the specific context you approve. See exactly what gets transmitted before confirming. Professional customers get enhanced security options and on-prem deployment. Built by engineers who understand why security matters for large codebases.',
    },
    {
      question: 'Does it work with my existing CLI tools?',
      answer: 'Absolutely. Integrated terminal runs codex, claude, cursor, aider, or any tool you use. Voice dictation for complex commands. Session transcripts for audits. Command approvals for sensitive operations. Your workflow, amplified.',
    },
    {
      question: 'What about large codebases (100k+ files)?',
      answer: 'Built for this. Code-aware discovery finds true impact surfaces across massive repos. Understands legacy patterns and complex dependencies. Intelligent file filtering. Database-backed session persistence. Because production systems require careful analysis.',
    },
    {
      question: 'Can I edit AI-generated plans before execution?',
      answer: 'This is the core feature. Full Monaco editor (VS Code editor) with syntax highlighting, auto-save, change tracking. Edit any AI plan before execution. Create templates, persist edits to database. Not a chat interface - a real IDE for implementation plans.',
    },
    {
      question: 'How does the merge instructions feature work?',
      answer: 'Generate multiple plans from different models, then specify exactly how to merge them. "Use Plan 2\'s error handling with Plan 3\'s architecture." Floating instruction panel stays visible while reviewing. AI merges following your specifications, not generic rules. This is our secret weapon.',
    },
    {
      question: 'Why do senior engineers choose this over chat tools?',
      answer: 'Control. Generate multiple approaches, merge with your rules, edit before execution. See token costs, edit prompts, persist sessions across restarts. Built by engineers who got tired of losing context in chat interfaces and starting over.',
    },
    {
      question: 'What\'s the complete workflow for complex features?',
      answer: 'Describe task (voice/text/screen recording) → Generate 3-5 plans from different models → Review in Monaco editor → Add merge instructions → Get intelligently merged plan → Edit details → Execute in integrated terminal → Iterate based on results. Complete control from idea to deployment.',
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
      title: "Avoid 3-Week Cleanup Sprints",
      metric: "Zero cleanup",
      description: "AI can generate 10,000 lines in minutes. Wrong architecture means weeks of refactoring. Plan first, execute once, ship clean.",
      icon: <Shield className="w-8 h-8" />,
      testimonial: "Last rushed AI feature took 3 weeks to untangle. Now I edit plans before execution. No more technical debt bombs.",
      features: ["Multi-model consensus validation", "AI file relevance assessment"]
    },
    {
      title: "Ship Right the First Time",
      metric: "First-try success",
      description: "Multi-model validation before execution. Compare 5 approaches, merge the best parts, edit details. One careful implementation beats ten hasty fixes.",
      icon: <BrainCircuit className="w-8 h-8" />,
      testimonial: "GPT said one thing, Claude another. Merged both approaches with my rules. Caught a critical edge case before production.",
      features: ["Architectural synthesis with source traceability", "Monaco editor with real-time validation"]
    },
    {
      title: "Control AI Code Sprawl",
      metric: "Clean architecture",
      description: "Stop AI from reinventing your patterns. Merge instructions enforce your standards. Edit plans to match existing conventions. Consistent codebase at scale.",
      icon: <Save className="w-8 h-8" />,
      testimonial: "AI kept creating new patterns for solved problems. Now I specify 'use our existing auth flow' in merge instructions.",
      features: ["Floating merge instructions with SOLID principles", "Unified prompt system with template enforcement"]
    },
    {
      title: "Maintain Context Across Restarts",
      metric: "Persistent sessions",
      description: "Complex debugging spans days. Terminal sessions persist. Plans stay editable. Implementation context never lost. Pick up exactly where you left off.",
      icon: <History className="w-8 h-8" />,
      testimonial: "Debugging session from last Tuesday still there with full context. Saved me from re-explaining the entire problem.",
      features: ["Terminal session persistence with 5MB ring buffer", "Project session state with file selection history"]
    }
  ];

  const features = [
    {
      title: 'Full Monaco Editor for Plans',
      description: 'Edit AI-generated plans with VS Code\'s Monaco editor. Syntax highlighting, auto-save, change tracking. Not a chat interface - a real IDE for implementation plans. Persist edits, create templates, full control before execution.',
      icon: <Sparkles className="w-8 h-8" />,
    },
    {
      title: 'Intelligent Merge with Instructions',
      description: 'Generate multiple plans, then merge with your instructions. "Use Plan 2\'s error handling, Plan 3\'s architecture." Floating instruction panel while reviewing. AI merges exactly how you specify. No more settling for one approach.',
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: 'Integrated Terminal & CLI Orchestration',
      description: 'Run codex, claude, cursor, aider directly inside Vibe Manager. Stage prompts with voice dictation, approve, then execute. Keep traceable transcripts. No context switching. Built for power users who live in terminals.',
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: 'Code-Aware Discovery',
      description: 'From 1,000 files to the true impact surface. AI finds dependencies, patterns, non-obvious links. Understands legacy code structures and complex architectural patterns. Essential for dealing with technical debt at scale.',
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: 'Multi-Model Plan Generation',
      description: 'Council of LLMs: GPT-5, Claude Sonnet 4, Gemini 2.5 Pro, o3/o4-mini, Grok 4, DeepSeek R1. Generate multiple approaches, compare side-by-side, merge the best parts. One model is never enough for production.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Voice → Terminal Flow',
      description: 'Dictate complex commands instead of typing. Faster input for implementation plans. Stage in rich text area, review, approve, execute. Full transcript retention for audits. Accessibility for RSI sufferers.',
      icon: <Video className="w-8 h-8" />,
    },
    {
      title: 'Transparency & Control',
      description: 'Live token counts and costs. Editable prompts. Local session storage. You see exactly what gets sent before confirming. No black boxes. Built by engineers who hate surprises in production.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Session Persistence',
      description: 'Complete history including terminal transcripts. Close the app mid-debug, come back next week, continue where you left off. SQLite local storage. Your debugging context never disappears.',
      icon: <History className="w-8 h-8" />,
    },
    {
      title: 'Library Upgrade Planning',
      description: 'API diff analysis, breaking change detection, migration checklists. Generate upgrade plans that actually work. Essential for teams maintaining large dependency graphs.',
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: 'Professional Security',
      description: 'Single-tenant isolated servers or on-prem deployment. Command approvals, transcript retention, redaction support. Built for teams that can\'t use cloud-only tools.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Parallel Processing',
      description: 'Run multiple terminal sessions. Generate plans while debugging. Each session isolated with its own state. Because production issues don\'t wait for your current task to finish.',
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: 'Hard Bug Cracking',
      description: 'Capture repro with screen recording. Plan precise fixes across models. Execute with full terminal control. Keep debugging transcripts. Built for the bugs that take days to solve.',
      icon: <Search className="w-8 h-8" />,
    },
  ];

  // Video structured data for better indexing
  const videoStructuredData: VideoObject[] = [
    {
      '@type': 'VideoObject',
      name: 'File Discovery & Search in Your Codebase',
      description: 'Watch how AI intelligently finds relevant files in your codebase using smart search patterns for better context curation.',
      thumbnailUrl: cdnUrl('/assets/images/step-2-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-2-find.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT50S',
    },
    {
      '@type': 'VideoObject',
      name: 'Plan Creation & Merge from Multiple AI Models',
      description: 'Generate implementation plans from GPT-5, Claude Sonnet 4, Gemini 2.5 Pro and merge the best approaches into a unified solution.',
      thumbnailUrl: cdnUrl('/assets/images/step-4-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-4-merge.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT60S',
    },
    {
      '@type': 'VideoObject',
      name: 'Deep Research & Context Analysis',
      description: 'See AI perform comprehensive research across your codebase to gather context and understand dependencies for accurate planning.',
      thumbnailUrl: cdnUrl('/assets/images/step-3-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-3-generate.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT55S',
    },
    {
      '@type': 'VideoObject',
      name: 'AI Text Enhancement - Task Description',
      description: 'Learn how to describe tasks with AI assistance that enhances your descriptions with goals, constraints, and affected areas.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-text-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-text.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT45S',
    },
    {
      '@type': 'VideoObject',
      name: 'Voice Dictation - Faster Input',
      description: 'Discover how voice dictation makes task input faster for natural coding workflow with Claude Code and Cursor.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-voice-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-voice.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT30S',
    },
    {
      '@type': 'VideoObject',
      name: 'Screen Recording - Instant Error Capture',
      description: 'Capture complex workflows and visual context with screen recording. Gemini 2.5 Pro analyzes recordings to extract technical details.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-video-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-video.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
      duration: 'PT40S',
    },
    {
      '@type': 'VideoObject',
      name: 'Settings & Prompt Customization',
      description: 'Configure AI models, edit system prompts, and customize settings to match your workflow with Claude Code, Cursor, or OpenAI Codex.',
      thumbnailUrl: cdnUrl('/assets/images/step-5-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-5-customize.mp4'),
      uploadDate: '2025-08-01T00:00:00Z',
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
      description: 'Screenshot showing AI-powered file discovery interface with search patterns and codebase analysis for Claude Code and Cursor',
      contentUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Multi-Model Implementation Plans',
      description: 'Interface showing merged implementation plans from GPT-5, Claude Sonnet 4, and Gemini 2.5 Pro for superior coding strategies',
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
            <h1>Vibe Manager - Serious AI Architect Studio</h1>
            <p>AI Architect Studio built for heavy coding-agent users and staff/principal engineers. Multi-model planning with integrated terminal execution. Run codex, claude, cursor, aider directly in-app with voice dictation and session transcripts. Generate plans from GPT-5, Claude Sonnet 4, Gemini 2.5 Pro, o3/o4-mini, Grok 4, DeepSeek R1, Kimi K2. Built for large and legacy codebases.</p>
          </div>
          <section className="mb-0">
            <HeroSection />
          </section>
          <FounderProof />
          <SectionDividerMesh />

          <Value propositions={valuePropositions} />
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

          <section id="community" className="pb-8">
            <Community />
          </section>
          <SectionDividerMesh />

          <section id="cta" className="pt-8">
            <CallToAction
              description="Planning layer trusted by heavy users of coding agents. Ship features and fixes safely in large & legacy codebases."
              title="Ready to Level Up Your Agent Workflow?"
            />
          </section>
        </main>
      </div>
    </>
  );
}