// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
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
import type { SoftwareApplication } from 'schema-dts';
import { SectionDividerOrbs, SectionDividerMesh } from '@/components/ui/SectionDivider';

const Features = dynamic(() => import('@/components/landing/Features').then(mod => ({ default: mod.Features })), {
  loading: () => <div className="h-[50vh]" />,
});

const HowItWorks = dynamic(() => import('@/components/landing/HowItWorks').then(mod => ({ default: mod.HowItWorks })), {
  loading: () => <div className="h-[60vh]" />,
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

const Footer = dynamic(() => import('@/components/landing/Footer').then(mod => ({ default: mod.Footer })), {
  loading: () => <div className="h-[40vh]" />,
});

export const metadata: Metadata = {
  title: 'Vibe Manager | Context for Lost AI Agents',
  description: "The AI coding assistant that acts as a middle-manager for your LLMs, curating the perfect context so they can't get lost. Built by a developer, for developers, from the trenches.",
  keywords: [
    'AI coding assistant',
    'codebase analysis',
    'implementation plans',
    'developer tools',
    'code context',
    'file discovery',
    'developer productivity',
    'AI development workflow',
    'code intelligence',
    'software architecture planning',
    'large codebase navigation',
    'multi-model AI planning',
  ],
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    description: "The AI coding assistant that acts as a middle-manager for your LLMs, curating the perfect context so they can't get lost. Built by a developer, for developers, from the trenches.",
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: '2025-12-31',
      description: 'Free download with pay-as-you-go AI usage credits',
    },
    creator: {
      '@type': 'Organization',
      name: 'Vibe Manager Team',
      url: 'https://vibemanager.app',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Vibe Manager',
      url: 'https://vibemanager.app',
    },
    downloadUrl: 'https://vibemanager.app/download',
    softwareVersion: '1.0.0',
    datePublished: '2024-01-01',
    dateModified: '2025-07-23',
    screenshot: 'https://vibe-manager-media.s3.amazonaws.com/og-image.png',
    featureList: [
      '4-Stage File Finder Workflow (No Vector DBs)',
      'Deep Research Workflow for Current Documentation',
      'Council of LLMs: Multi-Model & Multi-Run Plan Generation',
      'Intelligent Plan Merging & Synthesis',
      'Voice Dictation with GPT-4 Transcription',
      'Screen Recording with AI Analysis',
      'Persistent Sessions with Complete History Tracking',
      '100% Local-First: Code & Data Stay On Your Machine',
      'Fully Customizable System Prompts & Instructions',
      'True Parallel Workflows: Never Get Blocked',
    ],
    softwareRequirements: 'Node.js 18+, 4GB RAM minimum',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '127',
      bestRating: '5',
      worstRating: '1',
    },
  };

  const features = [
    {
      title: 'File Finder',
      description: "Decomposes your task into logical areas, creates targeted search patterns, then AI assesses actual file content for relevance. Can expand to find critical dependencies when needed. Real-time intelligence finding what matters.",
      icon: <Search className="w-8 h-8" />,
    },
    {
      title: 'Voice Dictation & Screen Recording',
      description: 'Just talk - GPT-4 transcribes it. Can\'t explain it? Record your screen. Gemini extracts every technical detail from your recording and adds it to your task description.',
      icon: <Video className="w-8 h-8" />,
    },
    {
      title: 'The Council of LLMs',
      description: 'Generate plans from Gemini 2.5, Claude 4, GPT-4.1, o3/o4, Grok 4, DeepSeek R1, and Kimi K2 - even multiple runs of the same model. The list evolves quickly as more capable models appear. The merge AI synthesizes their unique insights into one superior strategy.',
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
      title: 'Your Data Stays Yours',
      description: 'True local-first. All your code, sessions, and history live in SQLite on your machine. Vibe Manager is just a secure proxy to AI providers - handling auth and billing while your code flows directly through. You control what gets sent and when.',
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

  const steps = [
    {
      title: '1. The Briefing: Task Input & Refinement',
      description: 'Just talk. Explain your complex logic or brainstorm out loud - GPT-4 transcribes it perfectly. Can\'t explain in words? Record your screen while demonstrating the issue. The AI refines everything into precise specifications.',
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-1-describe.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-1-poster.jpg',
    },
    {
      title: '2. The Recon Mission: Finding What Matters',
      description: 'The File Finder decomposes your task into logical areas, creates targeted search patterns, then AI assesses actual file content for relevance. Can expand to find critical dependencies when needed. Real-time intelligence finding what matters.',
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-2-find.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-2-poster.jpg',
    },
    {
      title: '3. Phoning a Friend: Deep Research',
      description: "Your LLM's knowledge is frozen in time. The Deep Research workflow fixes that by searching for current documentation to fill knowledge gaps. Get up-to-date answers for your specific implementation problems, integrated with your code's context.",
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-3-generate.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-3-poster.jpg',
    },
    {
      title: '4. The Board Meeting: Council of LLMs',
      description: 'Generate plans from multiple models. The architect AI performs deep synthesis, detecting blind spots and creating emergent solutions. Review with floating notes and edit plans directly before execution.',
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-4-merge.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-4-poster.jpg',
    },
  ];

  const faqItems = [
    {
      question: 'So it just finds the right files?',
      answer: 'Well, yes, it finds the *right* set of files. But also...',
    },
    {
      question: 'What else?',
      answer: 'It integrates up-to-the-minute web documentation with your codebase. And it generates implementation plans from a council of AI models, then merges them into a single, bulletproof strategy.',
    },
    {
      question: 'Okay, but apart from finding files, doing web research, and creating merged multi-model plans...?',
      answer: 'It keeps your code completely private on your local machine. And lets you customize every single system prompt and copy-paste instruction. And it has voice dictation and screen recording with AI analysis. And it runs all its workflows in parallel so you can work on multiple tasks at once. And it remembers everything - your sessions, your file selections, your task history - so you never lose context.',
    },
    {
      question: "Alright, I'll grant you that the file finding, web research, multi-model plans, privacy, custom prompts, voice dictation, screen recording, parallel workflows, and persistent sessions are nice. But apart from ALL THAT, what has Vibe Manager ever done for us?",
      answer: 'It gave you your weekend back.',
    },
  ];

  const faqPageJsonLd: any = {
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
          <SectionDividerMesh />

          <Features features={features} />
          <SectionDividerOrbs />

          <HowItWorks steps={steps} />
          <SectionDividerMesh />

          <section className="pb-8">
            <Pricing />
          </section>
          <SectionDividerOrbs />

          <section className="pt-8">
            <FAQ items={faqItems} />
          </section>
          <SectionDividerMesh />

          <section className="pb-8">
            <Community />
          </section>
          <SectionDividerOrbs />

          <section className="pt-8">
            <CallToAction
              buttonLink="/download"
              buttonText="Download Vibe Manager Free"
              description="Download the app, point it to your project, and get your first AI-curated implementation plan in minutes. It's time to get back to building."
              title="Ready to Stop Babysitting Your AI?"
            />
          </section>
        </main>
        
        {/* Footer - Separated from CTA with divider */}
        <Footer />
      </div>
    </>
  );
}