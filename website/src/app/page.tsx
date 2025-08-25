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
import type { SoftwareApplication, FAQPage } from 'schema-dts';
import { SectionDividerOrbs, SectionDividerMesh } from '@/components/ui/SectionDivider';

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

const HowItWorksInteractive = dynamic(() => import('@/components/interactive-demo/HowItWorksInteractive').then(mod => ({ default: mod.HowItWorksInteractive })), {
  loading: () => <div className="h-[40vh]" />,
});


export const metadata: Metadata = {
  title: 'Vibe code cleanup specialist',
  description: 'Find the right files, merge plans from multiple models, and ship correct changes—without sending your whole codebase to the cloud. Local-first.',
  keywords: [
    'AI coding assistant',
    'codebase context',
    'find relevant files',
    'LLM orchestration',
    'implementation plan',
    'local-first',
    'multi-model planning',
    'deep research for code',
    'large codebase navigation',
    'developer tools',
    'code intelligence',
    'file discovery',
  ],
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS',
    url: 'https://vibemanager.app',
    description: 'AI coding assistant for large codebases: finds relevant files, runs deep research, and merges multi-model plans. Local-first.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  const faqItems = [
    {
      question: 'What is Vibe Manager?',
      answer: 'An AI coding assistant that curates the right repo context and merges multi-model plans so agents make correct changes.',
    },
    {
      question: 'Does my repo leave my machine?',
      answer: "It's local-first: code, sessions, and history live in SQLite on your machine. You control what (if anything) gets sent to model providers.",
    },
    {
      question: 'Which models does it use?',
      answer: 'Gemini 2.5, GPT-5/4.1, Claude 4, o3/o4, Grok 4, DeepSeek R1, Kimi K2—merge AI synthesizes their plans. (List evolves as new models appear.)',
    },
    {
      question: 'What exactly does File Finder do?',
      answer: 'Decomposes the task, builds search patterns, then scores actual file content for relevance and can expand to dependencies.',
    },
    {
      question: 'Can it research current docs?',
      answer: 'Yes—Deep Research pulls up-to-date sources to fill knowledge gaps and ties them back to your code.',
    },
    {
      question: 'Pricing?',
      answer: 'Free welcome credits, then pay-as-you-go; every operation shows real-time token cost. No subscriptions.',
    },
    {
      question: 'Platforms?',
      answer: 'macOS now, Windows coming soon.',
    },
    {
      question: 'Security & keys?',
      answer: 'Vibe Manager acts as a secure proxy to AI providers; you handle auth/billing, and code flows directly through under your control.',
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
      description: 'Generate plans from Gemini 2.5, GPT-5, Claude 4, GPT-4.1, o3/o4, Grok 4, DeepSeek R1, and Kimi K2 - even multiple runs of the same model. The list evolves quickly as more capable models appear. The merge AI synthesizes their unique insights into one superior strategy.',
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

          <section className="py-16">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
                How It Works
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                Experience Vibe Manager's complete workflow through this interactive demonstration. 
                Each step shows exactly how the tool helps you find the right files, generate better plans, and ship correct changes.
              </p>
            </div>
            <HowItWorksInteractive />
          </section>
          <SectionDividerOrbs />

          <Features features={features} />
          <SectionDividerMesh />

          <section className="pb-8">
            <Pricing />
          </section>
          <SectionDividerMesh />

          <section className="pt-8">
            <FAQ items={faqItems} />
          </section>
          <SectionDividerOrbs />

          <section className="pb-8">
            <Community />
          </section>
          <SectionDividerMesh />

          <section className="pt-8">
            <CallToAction
              buttonLink="/download"
              buttonText="Download for Mac"
              description="Download the app, point it to your project, and get your first AI-curated implementation plan in minutes. It's time to get back to building."
              title="Ready to Stop Babysitting Your AI?"
            />
          </section>
        </main>
      </div>
    </>
  );
}