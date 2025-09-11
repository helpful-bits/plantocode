import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import type { Article } from 'schema-dts';
import TechnicalAccuracy from '@/components/docs/TechnicalAccuracy';

export const metadata: Metadata = {
  title: 'Maximizing Claude Code & Cursor with Vibe Manager - Enhanced AI Coding 2025',
  description: 'Discover how Vibe Manager enhances both Claude Code and Cursor with intelligent context preparation, multi-model planning, and smart file discovery for better AI coding results.',
  keywords: [
    'claude code enhancement',
    'cursor ai companion',
    'context preparation workflow',
    'multi-model ai coding',
    'smart file discovery',
    'implementation planning',
    'session management',
    'ai coding workflow',
    'claude code companion',
    'cursor enhancement tool',
    'vibe manager ai coding',
    'context management ai'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/claude-code-vs-cursor',
  },
  openGraph: {
    title: 'Maximizing Claude Code & Cursor with Vibe Manager',
    description: 'Learn how Vibe Manager enhances both Claude Code and Cursor with intelligent context preparation and multi-model planning.',
    url: 'https://www.vibemanager.app/docs/claude-code-vs-cursor',
    type: 'article',
  },
};

const articleJsonLd: Article = {
  '@type': 'Article',
  headline: 'Maximizing Claude Code & Cursor with Vibe Manager',
  author: {
    '@type': 'Organization',
    name: 'Vibe Manager Team',
  },
  datePublished: '2025-09-05T00:00:00Z',
  dateModified: '2025-09-05T00:00:00Z',
  description: 'Learn how Vibe Manager enhances both Claude Code and Cursor with intelligent context preparation, multi-model planning, and smart file discovery.',
};

export default function MaximizeClaudeCodeCursorPage() {
  return (
    <>
      <StructuredData data={articleJsonLd} />
      
      <DocsArticle
        title="Maximizing Claude Code & Cursor with Vibe Manager"
        description="Discover how Vibe Manager works as the perfect companion to both Claude Code and Cursor, providing intelligent context preparation and multi-model planning."
        date="2025-09-05"
        readTime="6 min"
        category="Enhancement"
      >
        <h2 className="text-2xl font-bold mb-6">The Missing Piece for AI Coding</h2>
        
        <p className="text-base mb-6">
          Both Claude Code and Cursor are powerful AI coding tools, but they share a common challenge: 
          <strong> they're only as good as the context you provide</strong>. Vibe Manager bridges this gap 
          by preparing intelligent, comprehensive context that makes both tools dramatically more effective.
        </p>

        <p className="text-base mb-6">
          Instead of manually hunting for relevant files or struggling with incomplete context, 
          Vibe Manager automates the discovery and preparation process, turning both Claude Code 
          and Cursor into precision instruments for complex development tasks.
        </p>

        <h2 className="text-2xl font-bold mb-6">Context Preparation Workflow</h2>
        
        <GlassCard className="p-6 mb-12">
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Smart File Discovery</h3>
                <p className="text-base text-muted-foreground">
                  AI-powered File Finder analyzes your project structure and discovers all files 
                  relevant to your task - not just the obvious ones.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Implementation Planning</h3>
                <p className="text-base text-muted-foreground">
                  Generate detailed implementation plans using multiple AI models before 
                  you start coding, ensuring comprehensive coverage of edge cases. Speak your planning thoughts 
                  naturally with voice dictation to capture ideas as they form, making the planning process 
                  more intuitive and faster than typing complex requirements.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Execute in Your Preferred Tool</h3>
                <p className="text-base text-muted-foreground">
                  Copy the prepared context and implementation plan to Claude Code or Cursor 
                  for precise, informed code generation.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Smart File Discovery</h2>
        
        <p className="text-base mb-6">
          Traditional file search relies on keywords and manual exploration. Vibe Manager's 
          AI-powered File Finder understands your project's architecture and discovers files 
          based on functionality, dependencies, and contextual relevance.
        </p>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">What Makes It Smart:</h3>
          <ul className="space-y-3">
            <li className="flex items-start space-x-3">
              <span className="text-primary">•</span>
              <span className="text-base"><strong>Semantic Understanding:</strong> Finds files by purpose, not just name patterns</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-primary">•</span>
              <span className="text-base"><strong>Dependency Mapping:</strong> Identifies related files across your entire codebase</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-primary">•</span>
              <span className="text-base"><strong>Context-Aware Filtering:</strong> Prioritizes files most relevant to your specific task</span>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-primary">•</span>
              <span className="text-base"><strong>Cross-Language Support:</strong> Works with any programming language or framework</span>
            </li>
          </ul>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Implementation Planning</h2>
        
        <p className="text-base mb-6">
          Before writing a single line of code, get a comprehensive implementation strategy. 
          Vibe Manager uses multiple AI models to analyze your requirements and generate 
          detailed plans that consider architecture, edge cases, and best practices.
        </p>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Multi-Model Planning Benefits:</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2 text-primary">Strategic Perspective</h4>
              <ul className="space-y-2 text-sm">
                <li>• Architecture decisions</li>
                <li>• Performance considerations</li>
                <li>• Scalability planning</li>
                <li>• Security implications</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2 text-primary">Tactical Details</h4>
              <ul className="space-y-2 text-sm">
                <li>• Step-by-step implementation</li>
                <li>• Code organization</li>
                <li>• Testing strategies</li>
                <li>• Error handling</li>
              </ul>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Session Management</h2>
        
        <p className="text-base mb-6">
          Complex projects require managing multiple feature contexts simultaneously. 
          Vibe Manager's session management keeps your work organized across different 
          development streams without context bleeding.
        </p>

        <GlassCard className="p-6 mb-12">
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold mb-3">Unlimited Local Sessions</h3>
              <p className="text-base text-muted-foreground mb-4">
                Store as many project contexts as you need locally, without cloud limitations or token restrictions.
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-3">Context Isolation</h3>
              <p className="text-base text-muted-foreground mb-4">
                Each session maintains its own file discoveries, implementation plans, and conversation history.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">Quick Context Switching</h3>
              <p className="text-base text-muted-foreground">
                Jump between different features or bug fixes without losing context or starting over.
              </p>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Real Developer Workflows</h2>
        
        <h3 className="text-xl font-semibold mb-4">Workflow 1: Feature Development</h3>
        <GlassCard className="p-6 mb-6">
          <ol className="space-y-3">
            <li className="text-base"><strong>1. Discovery:</strong> "Find all authentication-related files in this React app" (use voice dictation for quick task description)</li>
            <li className="text-base"><strong>2. Planning:</strong> Generate implementation plan for OAuth integration with natural voice input</li>
            <li className="text-base"><strong>3. Execute:</strong> Copy context + plan to Claude Code or Cursor</li>
            <li className="text-base"><strong>4. Result:</strong> Precise code generation with full context awareness</li>
          </ol>
        </GlassCard>

        <h3 className="text-xl font-semibold mb-4">Workflow 2: Bug Investigation</h3>
        <GlassCard className="p-6 mb-6">
          <ol className="space-y-3">
            <li className="text-base"><strong>1. Discovery:</strong> "Find files related to payment processing errors" + capture error sequences with screen recording</li>
            <li className="text-base"><strong>2. Analysis:</strong> AI examines error patterns and related code, including visual context from recordings</li>
            <li className="text-base"><strong>3. Planning:</strong> Multi-model analysis of potential fixes with complete error context</li>
            <li className="text-base"><strong>4. Execute:</strong> Targeted debugging with comprehensive context in Claude Code/Cursor</li>
          </ol>
        </GlassCard>

        <h3 className="text-xl font-semibold mb-4">Workflow 3: Legacy Code Modernization</h3>
        <GlassCard className="p-6 mb-12">
          <ol className="space-y-3">
            <li className="text-base"><strong>1. Discovery:</strong> "Map all jQuery dependencies in this codebase"</li>
            <li className="text-base"><strong>2. Planning:</strong> Staged migration strategy with risk assessment</li>
            <li className="text-base"><strong>3. Session Management:</strong> Separate contexts for each migration phase</li>
            <li className="text-base"><strong>4. Execute:</strong> Systematic refactoring with full dependency awareness</li>
          </ol>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Getting Started</h2>
        
        <p className="text-base mb-6">
          Ready to enhance your Claude Code and Cursor workflows? Here's how to get started with Vibe Manager:
        </p>

        <GlassCard className="p-6 mb-12">
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold mb-3">1. Download & Install</h3>
              <p className="text-base text-muted-foreground mb-4">
                Get the macOS app (Windows support coming soon) and launch it in your project directory.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <PlatformDownloadSection 
                  location="docs_claude_code_vs_cursor"
                  redirectToDownloadPage={true}
                />
                <Button asChild variant="outline" size="lg">
                  <Link href="/docs">View All Docs</Link>
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">2. Start Your First Discovery</h3>
              <p className="text-base text-muted-foreground">
                Use the File Finder to discover relevant files for your current task - 
                be as specific or general as you like.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">3. Generate Implementation Plans</h3>
              <p className="text-base text-muted-foreground">
                Create detailed plans using multiple AI models to get comprehensive coverage 
                of your implementation approach.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-3">4. Copy to Your Preferred Tool</h3>
              <p className="text-base text-muted-foreground">
                Export the prepared context and plans to Claude Code, Cursor, or any other AI coding tool 
                for precise, informed code generation.
              </p>
            </div>
          </div>
        </GlassCard>

        <p className="text-base mb-6">
          Vibe Manager doesn't replace Claude Code or Cursor - it makes them exponentially more effective 
          by solving their biggest challenge: getting the right context to generate the right code.
        </p>

        <TechnicalAccuracy />
      </DocsArticle>
    </>
  );
}