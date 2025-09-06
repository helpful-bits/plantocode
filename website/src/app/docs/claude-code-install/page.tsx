import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { StructuredData } from '@/components/seo/StructuredData';
import type { HowTo } from 'schema-dts';
import { cdnUrl } from '@/lib/cdn';
import TechnicalAccuracy from '@/components/docs/TechnicalAccuracy';

export const metadata: Metadata = {
  title: 'Claude CLI Setup + Vibe Manager | AI Coding Assistant Guide 2025',
  description: 'Learn how to use Claude CLI tools with Vibe Manager for enhanced AI-powered coding assistance. Multi-model planning and context management.',
  keywords: [
    'claude code install',
    'install claude code',
    'claudecode',
    'claude code setup',
    'claude code cli',
    'vibe manager',
    'multi-model planning',
    'ai coding assistant',
    'implementation planning',
    'macos app'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/claude-code-install',
  },
  openGraph: {
    title: 'Claude Code Install Guide - Complete Setup with Vibe Manager',
    description: 'Step-by-step guide to install Claude Code and enhance it with Vibe Manager for multi-model planning and context curation.',
    url: 'https://www.vibemanager.app/docs/claude-code-install',
    type: 'article',
    images: [{
      url: cdnUrl('/images/og-claude-install.png'),
      width: 1200,
      height: 630,
      alt: 'Claude Code Install Guide with Vibe Manager',
    }],
  },
};

const howToJsonLd: HowTo = {
  '@type': 'HowTo',
  name: 'How to Install Claude Code and Set Up Vibe Manager',
  description: 'Complete guide for installing Claude Code CLI and enhancing it with Vibe Manager for better planning and context management.',
  totalTime: 'PT10M',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Install Claude Code CLI',
      text: 'Install Claude Code using npm: npm install -g @anthropic/claude-cli or pip: pip install claude-cli',
    },
    {
      '@type': 'HowToStep',
      name: 'Configure Claude Code',
      text: 'Set up your Claude API key and configure Claude Code MCP protocols',
    },
    {
      '@type': 'HowToStep',
      name: 'Install Vibe Manager',
      text: 'Download and install Vibe Manager to enhance Claude Code with multi-model planning',
      url: 'https://www.vibemanager.app/download'
    },
    {
      '@type': 'HowToStep',
      name: 'Connect Vibe Manager to Claude Code',
      text: 'Configure Vibe Manager to work alongside your Claude Code installation for enhanced context curation',
    }
  ]
};


export default function ClaudeCodeInstallPage() {
  return (
    <>
      <StructuredData data={howToJsonLd} />
      
      <DocsArticle
        title="Claude Code Installation Guide"
        description="Complete step-by-step guide to install Claude Code and enhance it with Vibe Manager for multi-model planning"
        date="2025-09-04"
        readTime="10 min"
        category="Installation Guide"
      >
        {/* Quick Start Section */}
        <GlassCard className="p-6 mb-12 border-primary/20">
          <h2 className="text-2xl font-bold mb-6 text-foreground">🚀 Quick Start: Claude Code + Vibe Manager</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">1. Install Claude Code</h3>
              <p className="text-sm mb-4 text-muted-foreground">
                Anthropic's official CLI tool:
              </p>
              <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800">
                <code className="text-emerald-400 font-mono text-sm"># Install via npm{'\n'}npm install -g @anthropic-ai/claude-code{'\n\n'}# Or via curl{'\n'}curl -fsSL https://claude.ai/install.sh | bash</code>
              </pre>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">2. Add Vibe Manager</h3>
              <p className="text-base mb-4 text-muted-foreground leading-relaxed">
                Enhance Claude Code with multi-model planning and intelligent file discovery:
              </p>
              <Button asChild variant="cta" size="lg">
                <Link href="/download">Download Vibe Manager for macOS</Link>
              </Button>
              <p className="text-sm mt-2 text-muted-foreground">
                Windows support coming soon
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Main Content */}
        <p className="text-base sm:text-lg lg:text-xl mb-6 leading-relaxed">
          Looking to supercharge Claude Code with multi-model intelligence? This guide shows you how to 
          install Claude Code and enhance it with Vibe Manager - a desktop app that generates superior 
          implementation plans for Claude Code to execute.
        </p>

        <h2 className="text-2xl font-bold mb-6">Prerequisites</h2>
        
        <p className="mb-6">Before getting started, ensure you have:</p>
        
        <ul className="space-y-4 mb-12">
          <li>• macOS (Windows support coming soon)</li>
          <li>• Your preferred code editor or IDE</li>
          <li>• API keys for the AI services you want to use (optional)</li>
        </ul>

        <h2 className="text-2xl font-bold mb-6">How They Work Together</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">The Perfect Workflow</h3>
          <ol className="space-y-4">
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">1.</span>
              <div>
                <strong>Capture Ideas Quickly:</strong>
                <p className="text-sm text-muted-foreground mt-1">Use voice dictation to quickly capture development ideas and requirements - perfect for brainstorming sessions or when you're away from the keyboard</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">2.</span>
              <div>
                <strong>Plan with Vibe Manager:</strong>
                <p className="text-sm text-muted-foreground mt-1">Use multi-model planning to generate comprehensive implementation strategies</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">3.</span>
              <div>
                <strong>Find Files with AI:</strong>
                <p className="text-sm text-muted-foreground mt-1">Vibe Manager's File Finder discovers relevant code and context</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">4.</span>
              <div>
                <strong>Execute with Claude Code:</strong>
                <p className="text-sm text-muted-foreground mt-1">Claude Code implements the plan with its powerful agentic capabilities</p>
              </div>
            </li>
          </ol>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Getting Started with Vibe Manager</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Installation Steps</h3>
          <ol className="space-y-4">
            <li>
              <strong>1. Download Vibe Manager</strong>
              <p className="text-sm text-muted-foreground mt-1">Get the macOS app from our download page</p>
            </li>
            <li>
              <strong>2. Launch the Application</strong>
              <p className="text-sm text-muted-foreground mt-1">Double-click to install and open Vibe Manager</p>
            </li>
            <li>
              <strong>3. Sign In (Optional)</strong>
              <p className="text-sm text-muted-foreground mt-1">Use Auth0 to access LLM features</p>
            </li>
          </ol>
        </GlassCard>


        <h2 className="text-2xl font-bold mb-6">Key Features of Vibe Manager</h2>

        <GlassCard className="p-6 mb-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-semibold mb-4 text-primary">Core Capabilities</h4>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2">🎯</span>
                  <span>Multi-model planning across providers</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🔍</span>
                  <span>Intelligent file discovery with AI</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">📝</span>
                  <span>Implementation plan generation</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🎤</span>
                  <span>Voice dictation for rapid idea capture</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">📹</span>
                  <span>Screen recording for debugging workflows</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">🗂️</span>
                  <span>Context management and curation</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">💾</span>
                  <span>Local session persistence</span>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4 text-primary">Workflow Process</h4>
              <ol className="space-y-3">
                <li className="flex items-start">
                  <span className="mr-2 font-bold">1.</span>
                  <span>Define your development task (voice or text)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold">2.</span>
                  <span>Let AI find relevant files</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold">3.</span>
                  <span>Generate implementation plans</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold">4.</span>
                  <span>Record debugging sessions when needed</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-bold">5.</span>
                  <span>Use with your preferred tools</span>
                </li>
              </ol>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Platform-Specific Installation</h2>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-4">Installation on macOS</h3>
            <p className="mb-4">
              To install Claude Code on macOS, use the npm package manager. This method provides the most reliable installation experience:
            </p>
            <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800 mb-4">
              <code className="text-emerald-400 font-mono text-sm">npm install -g @anthropic/claude-cli</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              After installation, enhance Claude Code with Vibe Manager for multi-model planning capabilities.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-4">Installation on Windows</h3>
            <p className="mb-4">
              For Windows users, Claude Code can be installed using npm or pip. Follow these steps:
            </p>
            <ol className="space-y-2">
              <li>1. Install Node.js from nodejs.org</li>
              <li>2. Open PowerShell as Administrator</li>
              <li>3. Run: <code className="bg-primary/10 px-2 py-1 rounded text-primary">npm install -g @anthropic/claude-cli</code></li>
              <li>4. Alternatively, use pip: <code className="bg-primary/10 px-2 py-1 rounded text-primary">pip install claude-cli</code></li>
              <li>5. Configure with your API key</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-4">
              Note: Vibe Manager macOS app is available; Windows support is coming soon.
            </p>
          </GlassCard>
        </div>

        <h2 className="text-2xl font-bold mb-6">What is Claude Code</h2>
        
        <p className="mb-6">
          Claude Code is Anthropic's official CLI tool designed for AI-powered coding assistance. 
          You can install it using either npm or the curl installation script:
        </p>
        
        <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800 mb-6">
          <code className="text-emerald-400 font-mono text-sm">{`# Install via npm
npm install -g @anthropic-ai/claude-code

# Or via curl
curl -fsSL https://claude.ai/install.sh | bash`}</code>
        </pre>
        
        <p className="mb-6">
          Once installed, enhance Claude Code with Vibe Manager for superior planning capabilities and 
          multi-model coordination.
        </p>

        <h2 className="text-2xl font-bold mb-6">Integration with Development Tools</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">VS Code Integration</h3>
          <p className="mb-4">
            Claude Code integrates seamlessly with Visual Studio Code through its official extension:
          </p>
          <ol className="space-y-2">
            <li>1. Install Claude Code CLI first</li>
            <li>2. Open VS Code Extensions marketplace</li>
            <li>3. Search for "Claude Code"</li>
            <li>4. Install the official extension</li>
            <li>5. Use Vibe Manager alongside for enhanced planning capabilities</li>
          </ol>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Vibe Manager Compatibility</h2>
        
        <p className="mb-6">
          Vibe Manager works perfectly alongside Claude Code to enhance its capabilities. While not 
          required for basic Claude Code functionality, using both together provides:
        </p>
        
        <ul className="space-y-3 mb-6">
          <li>• Claude Code's direct AI access and execution capabilities</li>
          <li>• Vibe Manager's multi-model planning and context curation</li>
          <li>• Enhanced workflow coordination between different AI providers</li>
          <li>• Intelligent file discovery and context management</li>
        </ul>

        <h2 className="text-2xl font-bold mb-6">Enhanced Agent Capabilities</h2>
        
        <p className="mb-6">
          While Claude Code agents handle specific coding tasks efficiently, Vibe Manager adds a 
          sophisticated planning layer that coordinates server-configured models across multiple providers 
          including OpenAI, Anthropic, Google, and xAI. This combination creates superior implementation 
          plans that Claude Code can then execute with its powerful agentic capabilities.
        </p>
        
        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Technical Architecture</h3>
          <p className="text-sm text-muted-foreground">
            Vibe Manager workflows run as queued background jobs with SQLite-backed persistence 
            and staged processors, ensuring reliable execution and state management for complex 
            multi-step development tasks.
          </p>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Advanced Claude Code Configuration</h2>



        <h3 className="text-xl font-semibold mb-4">Claude Code Plan Mode</h3>
        <p className="mb-6">
          Enable <strong>Claude Code plan mode</strong> for better task planning:
        </p>
        <pre className="bg-black/50 dark:bg-black/70 p-4 rounded-lg overflow-x-auto border border-border/50 mb-6">
          <code className="text-green-400">claude config set planning_mode true{'\n'}claude config set max_planning_iterations 5</code>
        </pre>
        <p className="text-sm text-muted-foreground">
          💡 Tip: Vibe Manager enhances plan mode with server-configured models across providers. Use voice dictation to quickly describe complex planning requirements, and screen recording to capture error states for better debugging context. Technical note: Workflows run as queued background jobs (SQLite-backed), with staged processors.
        </p>


        <TechnicalAccuracy />

        <h2 className="text-2xl font-bold mb-6">Next Steps</h2>

        <p className="mb-6">
          Now that you've successfully installed Claude Code and understand how Vibe Manager enhances it, 
          you're ready to start building with AI-powered assistance. Whether you're working with 
          <strong> Claude Code agents</strong>, configuring <strong>Claude Code MCP</strong>, or exploring 
          <strong> Claude Code GitHub</strong> integration, Vibe Manager ensures you have the best possible 
          planning and context for every coding task.
        </p>
      </DocsArticle>
    </>
  );
}