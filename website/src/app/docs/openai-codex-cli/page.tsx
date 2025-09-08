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
  title: 'OpenAI Codex CLI + Vibe Manager | Agentic Coding Guide 2025',
  description: 'Learn how to use OpenAI Codex CLI with Vibe Manager for enhanced AI-powered coding. Multi-model planning meets o3-powered execution.',
  keywords: [
    'openai codex cli',
    'codex cli install',
    'openai codex',
    'codex terminal',
    'codex agent',
    'o3 model',
    'o4 mini',
    'vibe manager',
    'multi-model planning',
    'ai coding assistant',
    'implementation planning',
    'agentic coding',
    'macos app'
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/openai-codex-cli',
  },
  openGraph: {
    title: 'OpenAI Codex CLI Guide - Enhanced with Vibe Manager',
    description: 'Step-by-step guide to install OpenAI Codex CLI and enhance it with Vibe Manager for multi-model planning and superior context curation.',
    url: 'https://www.vibemanager.app/docs/openai-codex-cli',
    type: 'article',
    images: [{
      url: cdnUrl('/images/og-codex-cli.png'),
      width: 1200,
      height: 630,
      alt: 'OpenAI Codex CLI Guide with Vibe Manager',
    }],
  },
};

const howToJsonLd: HowTo = {
  '@type': 'HowTo',
  name: 'How to Install OpenAI Codex CLI and Set Up Vibe Manager',
  description: 'Complete guide for installing OpenAI Codex CLI and enhancing it with Vibe Manager for better planning and context management.',
  totalTime: 'PT10M',
  step: [
    {
      '@type': 'HowToStep',
      name: 'Install OpenAI Codex CLI',
      text: 'Install Codex using npm: npm install -g @openai/codex or download the binary from GitHub releases',
    },
    {
      '@type': 'HowToStep',
      name: 'Configure Codex CLI',
      text: 'Set up your OpenAI API key and configure Codex preferences in ~/.codex/config.toml',
    },
    {
      '@type': 'HowToStep',
      name: 'Install Vibe Manager',
      text: 'Download and install Vibe Manager to enhance Codex with multi-model planning',
      url: 'https://www.vibemanager.app/download'
    },
    {
      '@type': 'HowToStep',
      name: 'Connect Vibe Manager to Codex',
      text: 'Use Vibe Manager to generate plans and copy them into Codex CLI for execution',
    }
  ]
};


export default function OpenAICodexCLIPage() {
  return (
    <>
      <StructuredData data={howToJsonLd} />
      
      <DocsArticle
        title="OpenAI Codex CLI Integration Guide"
        description="Complete guide to using OpenAI Codex CLI with Vibe Manager for enhanced AI-powered development"
        date="2025-09-08"
        readTime="12 min"
        category="Integration Guide"
      >
        {/* Quick Start Section */}
        <GlassCard className="p-6 mb-12 border-primary/20">
          <h2 className="text-2xl font-bold mb-6 text-foreground">🚀 Quick Start: Codex CLI + Vibe Manager</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">1. Install Codex CLI</h3>
              <p className="text-sm mb-4 text-muted-foreground">
                OpenAI's lightweight terminal agent:
              </p>
              <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800">
                <code className="text-emerald-400 font-mono text-sm"># Install via npm{'\n'}npm install -g @openai/codex{'\n\n'}# Or download binary{'\n'}# Visit github.com/openai/codex/releases</code>
              </pre>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4 text-primary">2. Add Vibe Manager</h3>
              <p className="text-base mb-4 text-muted-foreground leading-relaxed">
                Enhance Codex with multi-model planning and intelligent context curation:
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
          OpenAI Codex CLI brings the power of o3 and GPT-5 directly to your terminal as a lightweight 
          coding agent. This guide shows you how to supercharge Codex with Vibe Manager's multi-model 
          planning capabilities for superior AI-assisted development.
        </p>

        <h2 className="text-2xl font-bold mb-6">What is OpenAI Codex CLI?</h2>
        
        <p className="mb-6">
          Released in 2025, OpenAI Codex CLI is an open-source command-line tool that acts as a coding 
          agent in your terminal. It's powered by codex-1, a version of OpenAI's o3 model optimized 
          specifically for software engineering tasks.
        </p>
        
        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Key Capabilities</h3>
          <ul className="space-y-3">
            <li>• <strong>Multimodal inputs:</strong> Pass text, screenshots, or diagrams</li>
            <li>• <strong>Local execution:</strong> Code never leaves your environment unless you choose</li>
            <li>• <strong>Three operation modes:</strong> Suggest, auto-edit, or full-auto</li>
            <li>• <strong>Model flexibility:</strong> Target GPT-5, o3, o4-mini, or any available model</li>
            <li>• <strong>MCP support:</strong> Enable Model Context Protocol servers</li>
          </ul>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Installation & Setup</h2>

        <h3 className="text-xl font-semibold mb-4">Installing Codex CLI</h3>
        
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-4">macOS & Linux</h4>
            <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800 mb-4">
              <code className="text-emerald-400 font-mono text-sm"># Via npm (recommended){'\n'}npm install -g @openai/codex{'\n\n'}# Or via Homebrew{'\n'}brew install openai/tap/codex{'\n\n'}# Upgrade existing installation{'\n'}codex --upgrade</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              Full support on Unix-based systems
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-4">Windows</h4>
            <p className="mb-4">
              Windows support is experimental. Best experience with WSL:
            </p>
            <ol className="space-y-2 text-sm">
              <li>1. Install WSL2 from Microsoft Store</li>
              <li>2. Open Ubuntu/Debian terminal</li>
              <li>3. Run: <code className="bg-primary/10 px-2 py-1 rounded text-primary">npm install -g @openai/codex</code></li>
              <li>4. Configure with your API key</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-4">
              Native Windows binary available from GitHub releases
            </p>
          </GlassCard>
        </div>

        <h3 className="text-xl font-semibold mb-4">Configuration</h3>
        
        <p className="mb-6">
          After installation, configure Codex CLI with your OpenAI API key:
        </p>
        
        <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800 mb-6">
          <code className="text-emerald-400 font-mono text-sm">{`# Set your API key
export OPENAI_API_KEY="your-api-key-here"

# Or add to config file
echo 'api_key = "your-api-key-here"' >> ~/.codex/config.toml

# Verify installation
codex --version`}</code>
        </pre>

        <h2 className="text-2xl font-bold mb-6">How Vibe Manager Enhances Codex CLI</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">The Perfect Workflow</h3>
          <ol className="space-y-4">
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">1.</span>
              <div>
                <strong>Describe Your Task in Vibe Manager:</strong>
                <p className="text-sm text-muted-foreground mt-1">Use voice dictation for 10x faster input, or screen recording to capture visual bugs</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">2.</span>
              <div>
                <strong>Multi-Model Planning:</strong>
                <p className="text-sm text-muted-foreground mt-1">Generate plans from GPT-5, Claude 4, Gemini 2.5, and merge the best approaches</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">3.</span>
              <div>
                <strong>Context Discovery:</strong>
                <p className="text-sm text-muted-foreground mt-1">AI finds relevant files and dependencies in your codebase</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-bold text-primary">4.</span>
              <div>
                <strong>Execute with Codex:</strong>
                <p className="text-sm text-muted-foreground mt-1">Copy the plan to Codex CLI and let o3 implement it with precision</p>
              </div>
            </li>
          </ol>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Codex CLI Operation Modes</h2>

        <p className="mb-6">
          Codex CLI offers three distinct operation modes, each providing different levels of automation:
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Suggest Mode</h4>
            <pre className="bg-black/50 p-2 rounded text-sm mb-3">
              <code className="text-emerald-400">codex --suggest</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              Reviews code and suggests changes without making edits. Perfect for learning and code review.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Auto-Edit Mode</h4>
            <pre className="bg-black/50 p-2 rounded text-sm mb-3">
              <code className="text-emerald-400">codex --auto-edit</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              Makes edits with your approval. Shows diffs before applying changes. Recommended for most users.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h4 className="text-lg font-semibold mb-3 text-primary">Full-Auto Mode</h4>
            <pre className="bg-black/50 p-2 rounded text-sm mb-3">
              <code className="text-emerald-400">codex --full-auto</code>
            </pre>
            <p className="text-sm text-muted-foreground">
              Autonomous execution. Makes changes and runs commands without approval. Use with caution.
            </p>
          </GlassCard>
        </div>

        <h2 className="text-2xl font-bold mb-6">Model Selection & Performance</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Available Models</h3>
          <p className="mb-4">
            Codex CLI can target different models based on your needs:
          </p>
          <pre className="bg-slate-900 dark:bg-slate-950 p-4 rounded-lg overflow-x-auto border border-slate-700 dark:border-slate-800 mb-4">
            <code className="text-emerald-400 font-mono text-sm">{`# Default: GPT-5 for fast reasoning
codex "Fix the authentication bug"

# Use o3 for complex problems
codex -m o3 "Refactor the entire auth system"

# Use o4-mini for simple tasks
codex -m o4-mini "Add a comment to this function"

# Use any available model
codex -m gpt-4-turbo "Generate unit tests"`}</code>
          </pre>
          <p className="text-sm text-muted-foreground">
            💡 Tip: Vibe Manager helps you choose the right model combination for your task complexity
          </p>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Advanced Features</h2>

        <h3 className="text-xl font-semibold mb-4">MCP Server Support</h3>
        <p className="mb-6">
          Enable Model Context Protocol servers for enhanced capabilities:
        </p>
        <pre className="bg-black/50 dark:bg-black/70 p-4 rounded-lg overflow-x-auto border border-border/50 mb-6">
          <code className="text-green-400">{`# ~/.codex/config.toml
[mcp_servers]
github = { command = "npx", args = ["@modelcontextprotocol/server-github"] }
filesystem = { command = "npx", args = ["@modelcontextprotocol/server-filesystem", "/path/to/code"] }`}</code>
        </pre>

        <h3 className="text-xl font-semibold mb-4">Multimodal Inputs</h3>
        <p className="mb-6">
          Codex CLI accepts various input types:
        </p>
        <pre className="bg-black/50 dark:bg-black/70 p-4 rounded-lg overflow-x-auto border border-border/50 mb-6">
          <code className="text-green-400">{`# Pass a screenshot
codex "Fix the layout issue in this screenshot" screenshot.png

# Pass a diagram
codex "Implement this architecture" architecture.svg

# Pass multiple files
codex "Refactor these components" src/*.tsx`}</code>
        </pre>

        <h2 className="text-2xl font-bold mb-6">Integration with Vibe Manager</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Typical Workflow</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Step 1: Capture Context in Vibe Manager</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Use voice to describe complex requirements quickly</li>
                <li>• Record screen to show UI bugs or workflows</li>
                <li>• Let AI enhance your task description</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 2: Generate Multi-Model Plans</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Click to generate plans from multiple models</li>
                <li>• Review different approaches side by side</li>
                <li>• Merge the best ideas into one plan</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 3: Execute with Codex CLI</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Copy the structured plan from Vibe Manager</li>
                <li>• Paste into Codex CLI with your preferred mode</li>
                <li>• Let o3 implement with precision</li>
              </ul>
            </div>
          </div>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Pricing & Access</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Codex CLI Availability</h3>
          <p className="mb-4">
            As of September 2025, Codex CLI is available through:
          </p>
          <ul className="space-y-3">
            <li>• <strong>ChatGPT Plus:</strong> $20/month includes Codex access</li>
            <li>• <strong>ChatGPT Pro:</strong> Enhanced limits and priority access</li>
            <li>• <strong>ChatGPT Business/Enterprise:</strong> Team collaboration features</li>
            <li>• <strong>API Access:</strong> Pay-per-use with OpenAI API key</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4">
            Vibe Manager uses its own server-side API keys for planning, separate from your Codex subscription
          </p>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Comparison: Codex CLI vs Other Tools</h2>

        <div className="overflow-x-auto mb-12">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4">Feature</th>
                <th className="text-left p-4">Codex CLI</th>
                <th className="text-left p-4">Claude Code</th>
                <th className="text-left p-4">Cursor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="p-4">Primary Model</td>
                <td className="p-4">o3/GPT-5</td>
                <td className="p-4">Claude 3.5</td>
                <td className="p-4">Multiple</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="p-4">Interface</td>
                <td className="p-4">Terminal</td>
                <td className="p-4">Terminal</td>
                <td className="p-4">IDE</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="p-4">Multimodal</td>
                <td className="p-4">✅ Yes</td>
                <td className="p-4">❌ No</td>
                <td className="p-4">✅ Yes</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="p-4">MCP Support</td>
                <td className="p-4">✅ Yes</td>
                <td className="p-4">✅ Yes</td>
                <td className="p-4">✅ Yes</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="p-4">Open Source</td>
                <td className="p-4">✅ Yes</td>
                <td className="p-4">❌ No</td>
                <td className="p-4">❌ No</td>
              </tr>
            </tbody>
          </table>
        </div>

        <TechnicalAccuracy />

        <h2 className="text-2xl font-bold mb-6 mt-12">Tips & Best Practices</h2>

        <GlassCard className="p-6 mb-12">
          <h3 className="text-xl font-semibold mb-4">Getting the Most from Codex + Vibe Manager</h3>
          <ul className="space-y-3">
            <li>
              <strong>🎯 Use the right mode:</strong>
              <p className="text-sm text-muted-foreground mt-1">Start with --suggest mode for unfamiliar codebases, graduate to --auto-edit when comfortable</p>
            </li>
            <li>
              <strong>🔍 Let Vibe Manager find context:</strong>
              <p className="text-sm text-muted-foreground mt-1">Don't manually search for files - use Vibe Manager's AI-powered file discovery first</p>
            </li>
            <li>
              <strong>🎤 Voice for complex tasks:</strong>
              <p className="text-sm text-muted-foreground mt-1">Describe intricate requirements 10x faster with voice dictation in Vibe Manager</p>
            </li>
            <li>
              <strong>📹 Record debugging sessions:</strong>
              <p className="text-sm text-muted-foreground mt-1">Show Vibe Manager the exact bug behavior with screen recording</p>
            </li>
            <li>
              <strong>🔄 Iterate on plans:</strong>
              <p className="text-sm text-muted-foreground mt-1">Generate multiple plans in Vibe Manager and merge the best approaches</p>
            </li>
          </ul>
        </GlassCard>

        <h2 className="text-2xl font-bold mb-6">Next Steps</h2>

        <p className="mb-6">
          Now that you understand how OpenAI Codex CLI and Vibe Manager work together, you're ready to 
          experience the future of AI-assisted development. Whether you're debugging complex issues, 
          refactoring legacy code, or building new features, this powerful combination ensures you have 
          the best planning and execution capabilities available.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild variant="cta" size="lg">
            <Link href="/download">Download Vibe Manager</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="https://github.com/openai/codex" target="_blank" rel="noopener noreferrer">
              View Codex CLI on GitHub
            </a>
          </Button>
        </div>
      </DocsArticle>
    </>
  );
}