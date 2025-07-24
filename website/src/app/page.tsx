// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { InteractiveBackground } from '@/components/landing/InteractiveBackground';
import { 
  Search, 
  Globe, 
  BrainCircuit, 
  Mic, 
  Save, 
  Zap, 
  DollarSign, 
  Shield 
} from 'lucide-react';
import type { SoftwareApplication } from 'schema-dts';

const Features = dynamic(() => import('@/components/landing/Features').then(mod => ({ default: mod.Features })), { 
  loading: () => <div className="h-[50vh]" /> 
});

const HowItWorks = dynamic(() => import('@/components/landing/HowItWorks').then(mod => ({ default: mod.HowItWorks })), { 
  loading: () => <div className="h-[60vh]" /> 
});

const Pricing = dynamic(() => import('@/components/landing/Pricing').then(mod => ({ default: mod.Pricing })), { 
  loading: () => <div className="h-[40vh]" /> 
});

const FAQ = dynamic(() => import('@/components/landing/FAQ').then(mod => ({ default: mod.FAQ })), { 
  loading: () => <div className="h-[50vh]" /> 
});

const CallToAction = dynamic(() => import('@/components/landing/CallToAction').then(mod => ({ default: mod.CallToAction })), { 
  loading: () => <div className="h-[30vh]" /> 
});

const Footer = dynamic(() => import('@/components/landing/Footer').then(mod => ({ default: mod.Footer })), { 
  loading: () => <div className="h-[40vh]" /> 
});

export const metadata: Metadata = {
  title: 'Vibe Manager | AI-Powered Context Curation for Large Codebases',
  description: 'Transform your development workflow with AI-powered file discovery, web research integration, and multi-model implementation planning. Privacy-first architecture with transparent cost tracking.',
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
    'multi-model AI planning'
  ],
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    description: 'Transform your development workflow with AI-powered file discovery, web research integration, and multi-model implementation planning. Privacy-first architecture with transparent cost tracking.',
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
      '4-Stage Smart File Discovery with AI filtering',
      'Deep Web Research Integration',
      'Multi-Model AI Planning (OpenAI, Anthropic, Google, DeepSeek)',
      'Voice Dictation with Task Refinement',
      'Session Context Persistence',
      'True Parallel Workflow Execution',
      'Real-time Transparent Cost Tracking',
      'Privacy-First Architecture - Code Stays Local'
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
      title: "Never Lose Track of Relevant Files Again",
      description: "Our 4-stage AI workflow eliminates the guesswork in large codebases. From regex patterns to AI relevance assessment, we find every file that matters to your implementation - saving hours of manual searching",
      icon: <Search className="w-8 h-8" />,
    },
    {
      title: "Bridge the Gap Between Ideas and Implementation",
      description: "Stop context-switching between Google and your code. Our Deep Research Integration pulls current web knowledge directly into your implementation plans, ensuring you never miss critical architectural patterns or best practices",
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: "Get the Best from Every AI Model",
      description: "Why settle for one perspective? Generate and merge implementation plans from o3, Claude 4, Gemini 2.5, and DeepSeek simultaneously. Each model's unique strengths combine for bulletproof planning",
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: "Turn Thoughts into Actionable Tasks Instantly",
      description: "Voice-capture complex requirements while walking or thinking, then let AI refine them into crystal-clear implementation tasks. No more losing great ideas to poor documentation",
      icon: <Mic className="w-8 h-8" />,
    },
    {
      title: "Pick Up Exactly Where You Left Off",
      description: "Context switching kills productivity. Save complete work sessions with file selections, task descriptions, and progress. Resume any project instantly with zero mental overhead",
      icon: <Save className="w-8 h-8" />,
    },
    {
      title: "Multiply Your Development Velocity",
      description: "Why wait? Run file discovery while generating plans while researching patterns - all simultaneously. True parallel execution means every minute counts toward progress",
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: "No Billing Surprises, Ever",
      description: "See exact costs before and during execution. Server-validated billing with real-time tracking means you're always in control of your AI spend - no hidden fees or surprise charges",
      icon: <DollarSign className="w-8 h-8" />,
    },
    {
      title: "Your Code Never Leaves Your Machine",
      description: "Built for enterprise security: your codebase stays local, only selected files go to AI services, and file browsing works completely offline. Privacy-first architecture you can trust",
      icon: <Shield className="w-8 h-8" />,
    },
  ];

  const steps = [
    {
      title: "1. Capture & Clarify Your Vision",
      description: "Start with voice dictation for rapid idea capture or detailed text input. Our AI Task Refinement analyzes your requirements and transforms them into clear, actionable specifications while preserving your original intent and technical preferences.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-1-describe.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-1-poster.jpg",
    },
    {
      title: "2. Discover Files & Research Context",
      description: "Launch our intelligent 4-stage File Finder: regex pattern matching, AI relevance scoring, dependency path exploration, and smart path correction. Simultaneously run Deep Research to pull current best practices and architectural patterns from the web that match your codebase.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-2-find.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-2-poster.jpg",
    },
    {
      title: "3. Generate & Merge Implementation Plans",
      description: "Choose single or multiple AI models (o3, Claude 4 Opus, Gemini 2.5 Pro, DeepSeek R1) to generate comprehensive implementation plans. Our merge algorithm combines the unique strengths of each model into a single, battle-tested roadmap with step-by-step instructions.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-3-generate.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-3-poster.jpg",
    },
  ];


  const faqItems = [
    {
      question: "How does Vibe Manager differ from GitHub Copilot and other AI coding tools?",
      answer: "While Copilot excels at line-by-line code completion, Vibe Manager specializes in the planning phase. We help you find all relevant files in massive codebases, integrate current web research with your architecture, and generate comprehensive implementation roadmaps. Think of us as your AI planning partner before you start coding, while Copilot helps during the actual coding process.",
    },
    {
      question: "What programming languages and frameworks are supported?",
      answer: "Vibe Manager is language-agnostic and works with any text-based codebase. Our AI models understand code structure across JavaScript/TypeScript, Python, Java, Go/Rust, C#/.NET, PHP, Ruby, and more. We're equally effective with frameworks like React, Angular, Vue, Django, Rails, Spring Boot, and modern architectures like microservices or monorepos.",
    },
    {
      question: "How secure is my code? What data leaves my machine?",
      answer: "Security is our foundation. Your entire codebase stays on your machine - we never upload or store it. Only the specific files you explicitly select for analysis are sent to AI providers, and you see exactly what's being sent before it happens. File browsing, session management, and context persistence all work completely offline.",
    },
    {
      question: "Which AI models do you support and how do I choose?",
      answer: "We support the leading AI models: OpenAI (o3, GPT-4.1, o4-mini), Anthropic (Claude 4 Opus, Claude 4 Sonnet), Google (Gemini 2.5 Pro, Gemini 2.5 Flash), and DeepSeek (R1). Each has unique strengths - o3 for complex reasoning, Claude for code analysis, Gemini for broad knowledge integration. Our multi-model merge feature lets you combine their perspectives for the most comprehensive plans.",
    },
    {
      question: "How does pricing work? Are there any hidden fees or subscriptions?",
      answer: "Zero subscriptions, zero hidden fees. New users get free credits (30-day expiration) to try all features. After that, it's pure pay-as-you-go with transparent processing fees: Under $30 usage (20% fee), $30-$300 (10% fee), Over $300 (5% fee). You see exact costs before executing any operation, and all billing is server-validated in real-time.",
    },
    {
      question: "Can I work on multiple projects simultaneously?",
      answer: "Absolutely! Vibe Manager is built for parallel productivity. Run file discovery on one project while generating implementation plans for another, or execute deep research while working on task refinement. Every feature operates independently with separate sessions, contexts, and progress tracking. Perfect for consultants and developers juggling multiple codebases.",
    },
    {
      question: "What are the system requirements and how difficult is setup?",
      answer: "Minimal requirements: Node.js 18+, 4GB RAM, and any modern OS (macOS, Windows, Linux). Setup takes under 2 minutes - download, install, and you're ready. No complex configuration, no server setup, no API key management headaches. Everything works locally with optional cloud AI integration when you need it.",
    },
    {
      question: "How effective is the file discovery in really large codebases?",
      answer: "Our 4-stage discovery process is specifically designed for enterprise-scale codebases. We've tested on repositories with 100,000+ files where traditional search fails. The hierarchical approach (regex → AI relevance → dependency mapping → path correction) finds files that developers miss, even in complex monorepos with deep nesting and non-standard structures.",
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
      {/* Particle background with proper z-index */}
      <InteractiveBackground />
      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />
        <main className="relative">
        <HeroSection />
        <Features features={features} />
        <HowItWorks steps={steps} />
        <Pricing />
        <FAQ items={faqItems} />
        <CallToAction 
          title="Ready to Transform Your Development Workflow?"
          description="Join developers using Vibe Manager to build better software faster with AI-powered context curation."
          buttonText="Download Vibe Manager Free"
          buttonLink="/download"
        />
        </main>
        <Footer />
      </div>
    </>
  );
}