import React from 'react';

export default function DeveloperOverview() {
  return (
    <section aria-labelledby="developer-overview-title" className="mt-12">
      <header className="mb-8">
        <h2 id="developer-overview-title" className="text-2xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
          Enhancing Claude Code & Cursor Workflows
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          PlanToCode is a desktop companion that supercharges your AI coding experience by providing context preparation, planning, and research capabilities before you start coding.
        </p>
      </header>

      <div className="space-y-12">
        {/* How PlanToCode Complements Claude Code/Cursor */}
        <div className="border rounded-lg p-6 bg-muted/30">
          <h3 className="text-xl font-semibold mb-6">The Perfect Companion for AI Coding</h3>
          <p className="text-base text-muted-foreground mb-6 leading-relaxed">
            While Claude Code and Cursor excel at writing code with the context you provide, PlanToCode handles the crucial preparatory work - finding relevant files, researching solutions, and creating implementation plans that you can then execute in your AI coding environment.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold">Context Preparation Layer</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Instead of manually searching for relevant files or spending time crafting the perfect prompt, PlanToCode intelligently gathers and organizes the context your AI coding tool needs to be most effective. Use voice dictation to describe your needs naturally - speak your requirements and let the system understand what you're trying to build, making context preparation effortless.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Planning Before Coding</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate comprehensive implementation plans using multiple AI models, then copy these detailed strategies directly to Claude Code or Cursor for execution, ensuring you start with a clear roadmap. Voice dictation makes it easy to articulate complex ideas and architectural thoughts that might be difficult to type out quickly.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Research Integration</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gather external context, documentation, and examples before opening your coding session, so you arrive at Claude Code or Cursor fully informed about the task at hand.
              </p>
            </div>
          </div>
        </div>

        {/* Key Workflow Enhancement Features */}
        <div className="border rounded-lg p-6 bg-muted/30">
          <h3 className="text-xl font-semibold mb-6">Workflow Enhancement Features</h3>
          <p className="text-base text-muted-foreground mb-6 leading-relaxed">
            Each feature is designed to solve a specific pain point in AI-assisted development, creating a seamless handoff to your coding environment.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold">🔍 Smart File Finder</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Describe what you need in natural language (or speak it with voice dictation for speed) and get a curated selection of relevant files to provide as context to Claude Code or Cursor.
              </p>
              <ul className="text-sm text-muted-foreground space-y-4 pl-4">
                <li>• "Find authentication-related components" → Gets all login, signup, auth guard files</li>
                <li>• "Show me API endpoint files for user management" → Discovers routes, controllers, models</li>
                <li>• "Find styling files that affect the header" → Locates CSS, styled-components, theme files</li>
                <li>• One-click copy of file contents ready for your AI coding session</li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold">📋 Implementation Planning</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Generate detailed, step-by-step implementation plans that serve as comprehensive prompts for Claude Code and Cursor. When debugging complex issues, use screen recording to capture error sequences, UI state changes, and console output - giving AI tools visual context that text alone can't provide.
              </p>
              <ul className="text-sm text-muted-foreground space-y-4 pl-4">
                <li>• Multi-model consensus: Compare plans from different AI models for robust strategies</li>
                <li>• Context-aware planning: Considers your existing codebase and project structure, enhanced by voice input for natural requirement expression</li>
                <li>• Copy-ready format: Plans are formatted as detailed prompts you can paste directly</li>
                <li>• Progressive refinement: Iteratively improve plans before committing to code</li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold">🌐 Web Search Integration</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Research solutions, gather documentation, and find examples relevant to your coding task before starting your AI coding session.
              </p>
              <ul className="text-sm text-muted-foreground space-y-4 pl-4">
                <li>• Context-driven queries: Searches are tailored to your specific development context</li>
                <li>• Curated results: Filters and ranks results for development relevance</li>
                <li>• Knowledge synthesis: Combines web research with your project knowledge</li>
                <li>• Reference material ready: Organized research to inform your coding prompts</li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold">📂 Session Management</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Track and manage multiple coding contexts, so you can quickly switch between different tasks and maintain organized workflows.
              </p>
              <ul className="text-sm text-muted-foreground space-y-4 pl-4">
                <li>• Project-based organization: Separate contexts for different features or bugs</li>
                <li>• Persistent history: Resume research and planning sessions across app restarts</li>
                <li>• Context switching: Quickly jump between different coding tasks with prepared context</li>
                <li>• Progress tracking: Know exactly where you left off on each implementation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Background Processing */}
        <div className="border rounded-lg p-6 bg-muted/30">
          <h3 className="text-xl font-semibold mb-6">Background Processing</h3>
          <p className="text-base text-muted-foreground mb-6 leading-relaxed">
            While you're coding in Claude Code or Cursor, PlanToCode can work in the background preparing context for your next task or researching related topics.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold">Non-Blocking Operations</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                File discovery, web searches, and plan generation run independently, so you can continue coding while preparation happens in parallel. Record screen captures of complex debugging sessions in the background while maintaining your coding flow.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Queue Management</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Stack multiple research or planning tasks to be processed while you focus on implementation, creating a pipeline of prepared contexts.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Real-Time Updates</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Get notified when background tasks complete, so you know when new context or plans are ready for your next coding session.
              </p>
            </div>
          </div>
        </div>

        {/* Local-First Benefits */}
        <div className="border rounded-lg p-6 bg-muted/30">
          <h3 className="text-xl font-semibold mb-6">Local-First Benefits</h3>
          <p className="text-base text-muted-foreground mb-6 leading-relaxed">
            Your research, plans, and context preparation stay on your machine, providing fast access and persistent availability that complements your local AI coding workflow.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold">Instant Context Switching</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No network delays when switching between prepared contexts - everything is local and immediately available for your coding sessions.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Offline Planning Capability</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Prepare contexts, organize files, and review previous plans even when offline, so you're ready to code the moment you reconnect.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Persistent Session History</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All your research, plans, and context preparations are preserved locally, creating a knowledge base that grows with your development work.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Privacy & Security</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your code exploration and planning data never leaves your machine, maintaining privacy while preparing contexts for your AI coding tools.
              </p>
            </div>
          </div>
        </div>

        {/* AI Model Flexibility */}
        <div className="border rounded-lg p-6 bg-muted/30">
          <h3 className="text-xl font-semibold mb-6">AI Model Flexibility</h3>
          <p className="text-base text-muted-foreground mb-6 leading-relaxed">
            Use different AI models for planning and research while maintaining your preferred Claude Code or Cursor setup for actual coding implementation.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold">Multi-Model Planning</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate implementation plans using GPT-4, Claude, Gemini, or other models in parallel, then bring the best strategy to your coding session.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Task-Optimized Model Selection</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Use cost-effective models for file discovery and more powerful ones for complex planning, optimizing both quality and efficiency.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Coding Tool Independence</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your preparation workflow works regardless of whether you prefer Claude Code, Cursor, or any other AI coding tool - context is context.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold">Seamless Integration</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Copy prepared contexts, plans, and research directly into your AI coding environment with formatting optimized for prompt effectiveness.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}