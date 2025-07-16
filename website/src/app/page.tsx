import { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Pricing } from '@/components/landing/Pricing';
import { FAQ } from '@/components/landing/FAQ';
import { CallToAction } from '@/components/landing/CallToAction';
import { Footer } from '@/components/landing/Footer';
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

export const metadata: Metadata = {
  title: 'Vibe Manager | AI-Powered Context Curation',
  description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
  keywords: ['AI coding assistant', 'codebase analysis', 'implementation plans', 'developer tools', 'code context', 'file discovery'],
};

export default function Home() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  const features = [
    {
      title: "Smart File Discovery",
      description: "4-stage AI workflow finds all relevant files in your codebase through hierarchical filtering: regex patterns, AI relevance assessment, extended path finding, and path correction",
      icon: <Search className="w-8 h-8" />,
    },
    {
      title: "Deep Research Integration",
      description: "Seamlessly integrates current internet knowledge with your codebase for actionable implementation plans with precise, architecture-specific guidance",
      icon: <Globe className="w-8 h-8" />,
    },
    {
      title: "Multi-Model Planning",
      description: "Generate implementation plans from multiple AI models (o3, o4-mini, DeepSeek, Gemini) and merge them to ensure comprehensive coverage",
      icon: <BrainCircuit className="w-8 h-8" />,
    },
    {
      title: "Voice Dictation & Task Refinement",
      description: "Quickly capture complex ideas with voice input and AI-powered task description refinement for clearer implementation plans",
      icon: <Mic className="w-8 h-8" />,
    },
    {
      title: "Context Persistence",
      description: "Save and restore complete work contexts across sessions. Instantly reload previous file selections and task descriptions for efficient iterative development",
      icon: <Save className="w-8 h-8" />,
    },
    {
      title: "Parallel Execution",
      description: "True parallel productivity - run multiple workflows simultaneously. Every feature operates independently for maximum efficiency",
      icon: <Zap className="w-8 h-8" />,
    },
    {
      title: "Transparent Cost Tracking",
      description: "Real-time cost display with server-validated billing. Know exactly what you'll spend before and during execution",
      icon: <DollarSign className="w-8 h-8" />,
    },
    {
      title: "Privacy-First Architecture",
      description: "Your code stays on your machine. Only AI requests go to external services. Works offline for file browsing and session management",
      icon: <Shield className="w-8 h-8" />,
    },
  ];

  const steps = [
    {
      title: "Task Input & Refinement",
      description: "Use voice dictation for quick thought capture or text input. AI refines your task description for clarity while preserving your intent and formatting.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-1-describe.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-1-poster.jpg",
    },
    {
      title: "File Discovery & Web Research",
      description: "4-stage File Finder workflow analyzes your codebase using hierarchical filtering. Optional Deep Research integrates current internet knowledge with your architecture.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-2-find.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-2-poster.jpg",
    },
    {
      title: "Multi-Model Plan Generation",
      description: "Generate implementation plans from single or multiple AI models (o3, o4-mini, DeepSeek, Gemini). Merge multiple plans to ensure comprehensive coverage.",
      video: "https://vibe-manager-media.s3.amazonaws.com/step-3-generate.mp4",
      poster: "https://vibe-manager-media.s3.amazonaws.com/step-3-poster.jpg",
    },
  ];


  const faqItems = [
    {
      question: "How does Vibe Manager differ from GitHub Copilot?",
      answer: "Vibe Manager focuses on finding relevant files in large codebases and creating comprehensive implementation plans by combining internet research with your code context. It's designed for planning and architecture decisions rather than line-by-line code completion.",
    },
    {
      question: "What programming languages are supported?",
      answer: "Vibe Manager works with any text-based programming language. It uses AI to understand code structure regardless of language, making it effective for JavaScript, Python, Java, Go, Rust, and more.",
    },
    {
      question: "Is my code sent to external servers?",
      answer: "Your code stays on your machine. Only the specific files you select are sent to AI providers for analysis. You have full control over what information leaves your system.",
    },
    {
      question: "What AI models are supported?",
      answer: "We support OpenAI (GPT-4.1, GPT-4.1 Mini, o3, o4-mini), Anthropic (Claude 4 Sonnet, Claude 4 Opus, Claude 3.7 Sonnet), Google (Gemini 2.5 Pro, Gemini 2.5 Flash), and DeepSeek (DeepSeek R1) with unified cost tracking.",
    },
    {
      question: "How does the pricing work?",
      answer: "New users receive free credits (30-day expiration) with full access to all features. Paid credits use pay-as-you-go pricing with processing fees: Under $30 (20%), $30-$300 (10%), Over $300 (5%). No subscriptions or hidden fees.",
    },
    {
      question: "Can I run multiple workflows simultaneously?",
      answer: "Yes! Vibe Manager supports true parallel execution. You can run multiple File Finder workflows, execute Deep Research while generating plans, and process different tasks simultaneously for maximum productivity.",
    },
  ];


  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <Header />
      <main>
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
    </>
  );
}