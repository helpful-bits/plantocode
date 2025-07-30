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
} from 'lucide-react';
import type { SoftwareApplication } from 'schema-dts';

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

const CallToAction = dynamic(() => import('@/components/landing/CallToAction').then(mod => ({ default: mod.CallToAction })), {
  loading: () => <div className="h-[30vh]" />,
});

const Footer = dynamic(() => import('@/components/landing/Footer').then(mod => ({ default: mod.Footer })), {
  loading: () => <div className="h-[40vh]" />,
});

export const metadata: Metadata = {
  title: 'Vibe Manager | Stop Babysitting Your AI Coder',
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
      'Deep Research Workflow with Official Documentation',
      'Council of LLMs: Multi-Model & Multi-Run Plan Generation',
      'Intelligent Plan Merging & Synthesis',
      'Voice Dictation & AI-Powered Text Improvement',
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
      title: 'The Council of LLMs',
      description: 'Generate plans from multiple models (Gemini, Claude, etc.) and even multiple runs of the same model. Our merge AI synthesizes their unique insights into one superior strategy.',
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: 'Deep Research Workflow',
      description: "Bridge the gap between your code and the web. We consult current, official documentation to get up-to-date answers for your implementation problems, ensuring you're not using outdated patterns.",
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: 'Intelligent File Finder',
      description: "Forget stale vector databases. Our 4-stage workflow uses LLM intelligence to pinpoint the exact files needed for a task, just like a senior developer would. It's faster and more accurate.",
      icon: <Search className="w-8 h-8" />,
    },
    {
      title: 'Your Code Stays Yours. Period.',
      description: 'Privacy-first is our promise. Your code, session data, and tasks stay on your local machine, in your Git repo and a local SQLite DB. Nothing goes to the cloud without your approval.',
      icon: <Shield className="w-8 h-8" />,
    },
    {
      title: 'Truly Parallel Workflows',
      description: "Why wait? While one implementation plan generates, switch sessions and kick off a file discovery workflow for another task. You're never blocked.",
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: 'You Are The CEO',
      description: "You have the final say. Override any system prompt. Customize the 'Copy Button' instructions. Tailor the tool to your exact project needs and workflow.",
      icon: <Save className="w-8 h-8" />,
    },
  ];

  const steps = [
    {
      title: '1. The Briefing: Task Input & Refinement',
      description: 'Start with voice dictation or text. Our AI refines your vague ideas into precise specifications, using your codebase to clarify ambiguities and identify components before any work begins.',
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-1-describe.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-1-poster.jpg',
    },
    {
      title: '2. The Recon Mission: Finding What Matters',
      description: 'Our 4-stage File Finder acts like a senior dev, using Regex, AI content assessment, and path finding to pinpoint only the essential files. No stale vector databases, just pure LLM intelligence.',
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-2-find.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-2-poster.jpg',
    },
    {
      title: '3. Phoning a Friend: Deep Research',
      description: "Your LLM's knowledge is frozen in time. We fix that by consulting official documentation to get up-to-date answers for your specific implementation problems, integrated with your code's context.",
      video: 'https://vibe-manager-media.s3.amazonaws.com/step-3-generate.mp4',
      poster: 'https://vibe-manager-media.s3.amazonaws.com/step-3-poster.jpg',
    },
    {
      title: '4. The Board Meeting: Council of LLMs',
      description: 'Generate plans from multiple models. Our architect AI performs deep synthesis, detecting blind spots and creating emergent solutions. Review with floating notes and edit plans directly before execution.',
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
      answer: 'It keeps your code completely private on your local machine. And lets you customize every single system prompt and copy-paste instruction. And it has voice dictation. And it runs all its workflows in parallel so you can work on multiple tasks at once.',
    },
    {
      question: "Alright, I'll grant you that the file finding, web research, multi-model plans, privacy, custom prompts, voice dictation, and parallel workflows are nice. But apart from ALL THAT, what has Vibe Manager ever done for us?",
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
        <main className="relative">
          <section>
            <HeroSection />
          </section>
          <section>
            <Features features={features} />
          </section>
          <section>
            <HowItWorks steps={steps} />
          </section>
          <section>
            <Pricing />
          </section>
          <section>
            <FAQ items={faqItems} />
          </section>
          <section>
            <CallToAction
              buttonLink="/download"
              buttonText="Download Vibe Manager Free"
              description="Download the app, point it to your project, and get your first AI-curated implementation plan in minutes. It's time to get back to building."
              title="Ready to Stop Babysitting Your AI?"
            />
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}