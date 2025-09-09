import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { StructuredData } from '@/components/seo/StructuredData';
import type { SoftwareApplication, FAQPage, BreadcrumbList } from 'schema-dts';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Sparkles, FileSearch, GitMerge, Zap, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Vibe Code Cleanup Specialist - AI-Powered Code Planning & Refactoring',
  description: 'Transform messy codebases with Vibe Manager\'s intelligent planning. Generate cleanup plans from multiple AI models (GPT-5, Claude 4, Gemini 2.5) for systematic code improvement. Works with Claude Code, Cursor, and OpenAI Codex.',
  keywords: [
    'vibe code cleanup specialist',
    'vibe code cleanup',
    'code cleanup specialist',
    'ai code refactoring',
    'code improvement tool',
    'multi-model code analysis',
    'implementation planning',
    'technical debt cleanup',
    'codebase refactoring',
    'ai assisted cleanup',
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
  },
  openGraph: {
    title: 'Vibe Code Cleanup Specialist - Multi-Model AI Planning',
    description: 'Generate intelligent cleanup plans from multiple AI models. Works with Claude Code, Cursor, and OpenAI Codex. Free Mac app.',
    url: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
    type: 'article',
  },
};

const softwareApplicationJsonLd: SoftwareApplication = {
  '@type': 'SoftwareApplication',
  name: 'Vibe Manager - Code Cleanup Planning',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS',
  url: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
  description: 'Multi-model AI planning tool specialized in code cleanup and refactoring. Generates comprehensive cleanup plans from GPT-5, Claude 4, and Gemini 2.5.',
  offers: {
    '@type': 'Offer',
    price: 0,
  },
};

const faqItems = [
  {
    question: 'What is the Vibe Code Cleanup Specialist?',
    answer: 'Vibe Manager helps you plan code cleanup systematically. It analyzes your codebase, identifies areas for improvement, and generates detailed cleanup plans using multiple AI models. These plans can then be executed in Claude Code, Cursor, or any AI coding tool.',
  },
  {
    question: 'How does it work with my existing AI coding tools?',
    answer: 'Vibe Manager generates the cleanup plan, then you copy it to your preferred tool (Claude Code, Cursor, OpenAI Codex) for execution. It enhances your existing workflow rather than replacing it.',
  },
  {
    question: 'What makes it better than single-model planning?',
    answer: 'By generating plans from GPT-5, Claude 4, Gemini 2.5, and other models, then merging their insights, you get more comprehensive and thoughtful cleanup strategies that consider multiple approaches.',
  },
  {
    question: 'What types of cleanup can it help with?',
    answer: 'Code refactoring, removing duplicated code, improving naming conventions, restructuring components, optimizing imports, cleaning up unused code, improving type safety, and modernizing legacy patterns.',
  },
  {
    question: 'How does it find the right files to clean up?',
    answer: 'Vibe Manager uses intelligent file discovery with regex patterns and content analysis to identify all relevant files for your cleanup task, ensuring nothing is missed.',
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

export default function VibeCodeCleanupSpecialistPage() {
  const breadcrumbJsonLd: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.vibemanager.app'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Vibe Code Cleanup Specialist',
        item: 'https://www.vibemanager.app/vibe-code-cleanup-specialist'
      }
    ]
  };

  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <StructuredData data={faqPageJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="relative py-20 sm:py-24">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <Reveal as="div" className="text-center mb-12">
                <Sparkles className="w-16 h-16 mx-auto mb-6 text-primary" />
                <h1 className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                  Vibe Code Cleanup Specialist
                </h1>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  Transform messy codebases with intelligent multi-model planning. 
                  Generate comprehensive cleanup strategies that your AI coding tool can execute.
                </p>
              </Reveal>

              <Reveal className="grid md:grid-cols-2 gap-8 mt-16">
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <FileSearch className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Smart Discovery</h3>
                      <p className="text-muted-foreground">
                        Automatically finds all files needing cleanup using intelligent pattern matching and content analysis.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <GitMerge className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Multi-Model Planning</h3>
                      <p className="text-muted-foreground">
                        Generate cleanup plans from GPT-5, Claude 4, Gemini 2.5, then merge insights for superior strategies.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-4">
                    <Zap className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Works With Your Tools</h3>
                      <p className="text-muted-foreground">
                        Copy the cleanup plan to Claude Code, Cursor, or any AI coding assistant for execution.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-card/50 backdrop-blur-sm rounded-lg p-6 border border-border/50">
                    <h3 className="text-lg font-semibold mb-4">Common Cleanup Tasks</h3>
                    <ul className="space-y-2">
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Remove duplicate code and abstractions</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Improve naming conventions</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Restructure components and modules</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Clean up unused imports and code</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Improve type safety and interfaces</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">Modernize legacy patterns</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </Reveal>

              <Reveal className="mt-16">
                <div className="bg-primary/5 rounded-lg p-8 text-center">
                  <h2 className="text-2xl font-bold mb-4">How It Works</h2>
                  <div className="grid md:grid-cols-3 gap-6 mt-8">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-lg font-bold">1</span>
                      </div>
                      <h4 className="font-semibold mb-2">Describe Your Cleanup</h4>
                      <p className="text-sm text-muted-foreground">
                        Tell Vibe Manager what needs cleaning - duplicated code, poor naming, or technical debt
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-lg font-bold">2</span>
                      </div>
                      <h4 className="font-semibold mb-2">Generate Multi-Model Plan</h4>
                      <p className="text-sm text-muted-foreground">
                        AI models analyze your code and create comprehensive cleanup strategies
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <span className="text-lg font-bold">3</span>
                      </div>
                      <h4 className="font-semibold mb-2">Execute in Your Tool</h4>
                      <p className="text-sm text-muted-foreground">
                        Copy the plan to Claude Code, Cursor, or your preferred AI coding assistant
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal className="mt-16">
                <div className="space-y-8">
                  <h2 className="text-2xl font-bold text-center">Frequently Asked Questions</h2>
                  {faqItems.map((item, index) => (
                    <div key={index} className="bg-card/30 backdrop-blur-sm rounded-lg p-6 border border-border/30">
                      <h3 className="text-lg font-semibold mb-3">{item.question}</h3>
                      <p className="text-muted-foreground">{item.answer}</p>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal className="mt-16 text-center">
                <h2 className="text-2xl font-bold mb-6">Start Cleaning Your Code Today</h2>
                <p className="text-lg text-muted-foreground mb-8">
                  Download Vibe Manager and transform your codebase with intelligent multi-model planning
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button asChild size="lg">
                    <Link href="/download">
                      Download for Mac
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/#how-it-works">
                      See How It Works
                    </Link>
                  </Button>
                </div>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}