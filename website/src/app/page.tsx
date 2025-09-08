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
} from 'lucide-react';
import type { SoftwareApplication, FAQPage } from 'schema-dts';
import { SectionDividerOrbs, SectionDividerMesh } from '@/components/ui/SectionDivider';

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

const HowItWorks = dynamic(() => import('@/components/landing/HowItWorks').then(mod => ({ default: mod.HowItWorks })), {
  loading: () => <div className="h-[40vh]" />,
});


export const metadata: Metadata = {
  title: 'Vibe Manager - Multi-Model Planning for Claude Code, Cursor & AI Agents',
  description: 'Planning assistant for Claude Code, Cursor, OpenAI Codex CLI and agentic coding tools. Enhanced multi-model planning from GPT-5, Claude 4, and Gemini 2.5 for superior AI-assisted development.',
  keywords: [
    'claude code install',
    'install claude code',
    'claudecode',
    'claude code planning',
    'claude code companion',
    'claude code agents',
    'claude code mcp',
    'claude code cli',
    'claude code router',
    'claude code subagents',
    'claude code vs cursor',
    'cursor vs claude code',
    'cursor ide',
    'cursor ai',
    'openai codex cli',
    'openai codex',
    'agentic coding',
    'ai coding agents',
    'claude code github',
    'claude code vscode',
    'claude code hooks',
    'claude code sdk',
    'claude code plan mode',
    'claude code windows',
    'claude code docs',
    'how to use claude code',
    'claude code update',
    'AI coding assistant',
    'multi-model planning',
    'gpt-5',
    'gemini 2.5 pro',
    'deepseek',
    'codebase context',
    'file discovery',
    'macOS dev tools',
  ],
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS',
    url: 'https://vibemanager.app',
    description: 'Multi-model planning assistant for Claude Code, Cursor, OpenAI Codex CLI and agentic coding tools. Enhances any AI coding agent with intelligent context curation and plans from GPT-5, Claude 4, and Gemini 2.5.',
    offers: {
      '@type': 'Offer',
      price: 0, // Numeric 0 for free apps, no priceCurrency needed per Google guidance
    },
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
      question: 'What is Vibe Manager for AI coding agents?',
      answer: 'A planning assistant that enhances any agentic tool with multi-model intelligence. It curates context and merges plans from GPT-5, Claude 4, and Gemini 2.5 before your preferred coding agent executes - whether that\'s Claude Code, Cursor, OpenAI Codex CLI, or other agentic tools.',
    },
    {
      question: 'How do I use Vibe Manager with my coding assistant?',
      answer: 'Install your preferred agentic tool, then download Vibe Manager to add multi-model planning capabilities. The generated plans can be copied directly into any agentic tool that accepts structured instructions.',
    },
    {
      question: 'Does Vibe Manager replace my existing AI coding tools?',
      answer: 'No - Vibe Manager enhances whatever you\'re already using. It adds planning and context curation layers that make any agentic tool more effective. Works alongside all agentic tools.',
    },
    {
      question: 'How does it work with AI agents and their execution?',
      answer: 'Vibe Manager plans tasks using multiple AI models, then your chosen agentic tool executes them. It ensures agents have the right context and files, improving success rates dramatically regardless of which tool you prefer.',
    },
    {
      question: 'Which coding tools does it support?',
      answer: 'Works with any agentic tool that accepts structured plans - Claude Code, Cursor, OpenAI Codex CLI, and countless others. It adds multi-model planning that most tools don\'t offer natively, making all of them more powerful.',
    },
    {
      question: 'Which AI models does it use for planning?',
      answer: 'Gemini 2.5, GPT-5, Claude 4, o3/o4, Grok 4, DeepSeek R1, Kimi K2 - all working together to create superior plans for any agentic tool to execute.',
    },
    {
      question: 'Does it support tool-specific features and integrations?',
      answer: 'Yes! Works seamlessly with the unique features of any agentic tool - GitHub integrations, IDE features, CLI commands, and more. Adds its own customization layer for even greater control regardless of your chosen agentic environment.',
    },
    {
      question: 'Platform support for different coding tools?',
      answer: 'macOS now with Windows coming soon. Currently enhances any agentic tool on Mac. Windows users of all agentic tools await our Windows release.',
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

  const videoSteps = [
    {
      title: "File Discovery & Search",
      description: "Watch how AI finds relevant files in your codebase using intelligent search patterns",
      video: cdnUrl('/assets/videos/step-2-find.mp4'),
      poster: cdnUrl('/assets/images/step-2-poster.jpg')
    },
    {
      title: "Plan Creation & Merge",
      description: "Generate multiple implementation plans from different AI models and merge the best approaches into a unified solution",
      video: cdnUrl('/assets/videos/step-4-merge.mp4'), 
      poster: cdnUrl('/assets/images/step-4-poster.jpg')
    },
    {
      title: "Deep Research & Context Analysis", 
      description: "Watch AI perform comprehensive research across your codebase to gather context and understand dependencies",
      video: cdnUrl('/assets/videos/step-3-generate.mp4'),
      poster: cdnUrl('/assets/images/step-3-poster.jpg')
    },
    {
      title: "Task Description Input",
      description: "Describe your task naturally with text input and get AI assistance with enhancement. Skip typing entirely with voice dictation or capture visual context with screen recording",
      subSteps: [
        {
          title: "AI Text Enhancement",
          video: cdnUrl('/assets/videos/step-1-text.mp4'),
          poster: cdnUrl('/assets/images/step-1-text-poster.jpg')
        },
        {
          title: "Voice Dictation - 10x Faster Input",
          video: cdnUrl('/assets/videos/step-1-voice.mp4'), 
          poster: cdnUrl('/assets/images/step-1-voice-poster.jpg')
        },
        {
          title: "Screen Recording - Instant Error Capture",
          video: cdnUrl('/assets/videos/step-1-video.mp4'),
          poster: cdnUrl('/assets/images/step-1-video-poster.jpg')
        }
      ]
    },
    {
      title: "Settings & Prompt Customization",
      description: "Configure AI models, edit system prompts, and customize settings to match your workflow",
      video: cdnUrl('/assets/videos/step-5-customize.mp4'),
      poster: cdnUrl('/assets/images/step-5-poster.jpg')
    }
  ];

  const features = [
    {
      title: 'Enhanced Task Description Creation',
      description: 'Transform your raw ideas into structured, actionable plans. Describe your task 10x faster with voice dictation for natural input, selective text editing for precision, and get AI assistance to enhance your task descriptions with goals, constraints, and affected areas.',
      icon: <Video className="w-8 h-8" />,
    },
    {
      title: 'Visual Context Capture',
      description: 'Capture errors and UI issues instantly with screen recording. Record your screen to capture complex workflows and visual context. Gemini 2.5 Pro analyzes your recordings to extract technical details, UI states, and implementation requirements, seamlessly integrating with your IDE and CLI workflows.',
      icon: <Search className="w-8 h-8" />,
    },
    {
      title: 'Intelligent Web Research',
      description: 'Automatically formulate research questions based on your tasks and pull in real-time documentation, API references, and best practices. Get up-to-date answers that connect directly to your specific implementation needs.',
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: 'File Finder',
      description: "Decomposes your task into logical areas, creates targeted search patterns, then AI assesses actual file content for relevance. Can expand to find critical dependencies when needed. Real-time intelligence finding what matters.",
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: 'The Council of LLMs',
      description: 'Generate plans from Gemini 2.5, GPT-5, Claude 4, o3/o4, Grok 4, DeepSeek R1, and Kimi K2 - even multiple runs of the same model. The list evolves quickly as more capable models appear. The merge AI synthesizes their unique insights into one superior strategy.',
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: 'Never Start from Scratch',
      description: 'Persistent sessions with complete history. Your task descriptions, file selections, search terms - everything is preserved. Close the app, come back next week, pick up exactly where you left off.',
      icon: <History className="w-8 h-8" />,
    },
    {
      title: 'Deep Research Workflow',
      description: "Your codebase doesn't exist in a vacuum. The Deep Research workflow searches for current documentation to fill knowledge gaps, getting up-to-date answers for your specific implementation problems.",
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: 'You Control Your Data',
      description: 'Sessions and history stored locally in SQLite. When you use AI features, your code is sent to AI providers (OpenAI, Google, Anthropic) for processing. We handle auth and billing. You see exactly what gets sent before confirming.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Truly Parallel Workflows',
      description: "Why wait? While one implementation plan generates, switch sessions and kick off a file discovery workflow for another task. Each session maintains its own complete state.",
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: 'You Are The CEO',
      description: "Override any system prompt. Customize the 'Copy Button' instructions. Your customizations are saved per project. Full control over every aspect of the tool.",
      icon: <Save className="w-8 h-8" />,
    },
  ];



  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <StructuredData data={faqPageJsonLd} />
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="mb-0">
            <HeroSection />
          </section>
          <FounderProof />
          <SectionDividerMesh />

          <HowItWorks steps={videoSteps} />
          <SectionDividerOrbs />

          <Features features={features} />
          <SectionDividerMesh />

          <section id="pricing" className="pb-8">
            <Pricing />
          </section>
          <SectionDividerMesh />

          <section id="faq" className="pt-8">
            <FAQ items={faqItems} />
          </section>
          <SectionDividerOrbs />

          <section id="community" className="pb-8">
            <Community />
          </section>
          <SectionDividerMesh />

          <section id="cta" className="pt-8">
            <CallToAction
              buttonLink="/download"
              buttonText="Download for Mac"
              description="Join early access - ship your first AI-curated implementation plan in minutes."
              title="Ready to Take Control of Your AI Context?"
            />
          </section>
        </main>
      </div>
    </>
  );
}