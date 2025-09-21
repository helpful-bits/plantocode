import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Cursor Plan Mode - Generate plan.md and Manage Todos',
  description: 'Use Cursor\'s Plan setup to create a plan.md, manage todos, and queue instructions. Step-by-step setup with tips and templates.',
  keywords: ['Cursor Plan Mode', 'plan.md', 'todo management', 'AI planning', 'Cursor IDE', 'development workflow', 'Vibe Manager'],
  openGraph: {
    title: 'Cursor Plan Mode - Generate plan.md and Manage Todos',
    description: 'Use Cursor\'s Plan setup to create a plan.md, manage todos, and queue instructions. Step-by-step setup with tips and templates.',
    url: 'https://www.vibemanager.app/docs/cursor-plan-mode',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cursor Plan Mode - Generate plan.md and Manage Todos',
    description: 'Use Cursor\'s Plan setup to create a plan.md, manage todos, and queue instructions. Step-by-step setup with tips and templates.',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/cursor-plan-mode',
  },
};

export default function CursorPlanModePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is Plan a built-in mode?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Cursor lets you choose modes and provides a Plan example. The Plan mode is one of several example modes that demonstrate how to structure AI workflows for different tasks.'
            }
          },
          {
            '@type': 'Question',
            name: 'What\'s the Planning feature vs Plan mode?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Planning = todos/queue system; Plan example = mode. The Planning feature provides todo management and queued instructions, while the Plan mode is a specific AI behavior template for creating structured plans.'
            }
          },
          {
            '@type': 'Question',
            name: 'How do I switch between modes in Cursor?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can switch modes using the mode picker in the interface or by pressing Ctrl+. (Ctrl+period) to access the mode selection menu.'
            }
          },
          {
            '@type': 'Question',
            name: 'Can I customize the Plan mode behavior?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, you can modify the Plan mode template to fit your specific workflow needs. The mode defines how the AI behaves when generating plans and managing project structure.'
            }
          }
        ]
      },
      {
        '@type': 'Article',
        headline: 'Cursor Planning: From plan.md to Smooth Execution',
        description: 'Use Cursor\'s Plan setup to create a plan.md, manage todos, and queue instructions. Step-by-step setup with tips and templates.',
        author: {
          '@type': 'Organization',
          name: 'Vibe Manager'
        },
        publisher: {
          '@type': 'Organization',
          name: 'Vibe Manager'
        },
        datePublished: '2025-09-12',
        dateModified: '2025-09-12'
      }
    ]
  };

  return (
    <>
      <StructuredData data={structuredData} />
      
      <DocsArticle
        title="Cursor Planning: From plan.md to Smooth Execution"
        description="Use Cursor's Plan setup to create a plan.md, manage todos, and queue instructions. Step-by-step setup with tips and templates."
        date="2025-09-12"
        readTime="8 min"
        category="Cursor Integration"
      >
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 mb-8">
          <h4 className="font-semibold mb-2 text-amber-600 dark:text-amber-400">Important Note About Cursor "Plan Mode"</h4>
          <p className="text-sm text-muted-foreground">
            Cursor doesn't have a built-in "Plan Mode". The official modes are Ask Mode (read-only analysis and suggestions) and Agent Mode (can execute changes). "Plan Mode" is a common user convention or workflow pattern, not an official feature. Users often create custom modes or workflows for planning.
          </p>
        </div>

        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          Cursor's planning capabilities transform complex development tasks into structured, manageable workflows. Through its mode system and Planning features, you can generate comprehensive plan.md files, manage todos with dependencies, and queue instructions for seamless execution.
        </p>

        <h2>The Plan Example: Tools & Behavior</h2>
        <p>
          Cursor's Plan mode example demonstrates how AI can structure complex tasks into actionable steps. When activated, the Plan mode has access to three core tools that enable comprehensive project planning:
        </p>

        <GlassCard className="my-6 p-6">
          <h3 className="text-lg font-semibold mb-4">Core Planning Tools</h3>
          <ul className="space-y-3">
            <li><strong>Codebase:</strong> Analyzes your entire project structure to understand context and dependencies</li>
            <li><strong>Read file:</strong> Examines specific files to gather detailed implementation requirements</li>
            <li><strong>Terminal:</strong> Executes commands to understand the current state and validate assumptions</li>
          </ul>
        </GlassCard>

        <p>
          The Plan mode behavior focuses on creating a structured plan.md file that breaks down complex tasks into manageable steps, identifies dependencies, and provides clear implementation guidance.
        </p>

        <h3>Example plan.md Structure</h3>
        <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-4 overflow-x-auto text-slate-200">
<code className="text-slate-200">{`# Project Implementation Plan

## Overview
Brief description of the task and its objectives.

## Analysis
- Current state assessment
- Key dependencies identified  
- Potential challenges

## Implementation Steps

### Phase 1: Foundation
- [ ] Set up project structure
- [ ] Configure dependencies
- [ ] Create base components

### Phase 2: Core Features
- [ ] Implement main functionality
- [ ] Add error handling
- [ ] Write unit tests

### Phase 3: Integration
- [ ] Connect components
- [ ] End-to-end testing
- [ ] Documentation updates

## Success Criteria
Clear metrics for completion and validation.`}</code>
        </pre>

        <h2>Todos & Queued Messages</h2>
        <p>
          Cursor's Planning feature extends beyond simple todo lists by providing a sophisticated system for breaking down work and managing dependencies. This system integrates seamlessly with the Plan mode to create a comprehensive workflow management solution.
        </p>

        <GlassCard className="my-6 p-6">
          <h3 className="text-lg font-semibold mb-4">Advanced Todo Management</h3>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Dependency Tracking</h4>
              <p className="text-sm text-muted-foreground">
                Set up task dependencies to ensure work flows in the correct order. The system can automatically queue dependent tasks when prerequisites are completed.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Queued Instructions</h4>
              <p className="text-sm text-muted-foreground">
                Queue detailed instructions for each task, including code snippets, file locations, and implementation notes that can be executed when ready.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Context Preservation</h4>
              <p className="text-sm text-muted-foreground">
                Maintain context across work sessions, ensuring that complex multi-step projects can be resumed seamlessly.
              </p>
            </div>
          </div>
        </GlassCard>

        <h3>Queued Message Examples</h3>
        <pre className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded-lg p-4 overflow-x-auto text-slate-200">
<code className="text-slate-200">{`// Example queued instruction for API endpoint creation
"Create POST /api/users endpoint in src/pages/api/users.js with validation for email, password, and username fields. Include error handling for duplicate emails and password strength requirements."

// Example queued instruction for component update  
"Update UserProfile component in src/components/UserProfile.tsx to include the new bio field from the database schema. Add character limit validation (500 chars) and markdown support for formatting."`}</code>
        </pre>

        <h2>How to Switch Modes</h2>
        <p>
          Cursor provides multiple ways to access and switch between different modes, making it easy to adapt your AI assistant's behavior to match your current task requirements.
        </p>

        <div className="grid md:grid-cols-2 gap-6 my-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Mode Picker</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Access the mode picker through the main interface to browse and select from available modes.
            </p>
            <ul className="text-sm space-y-1">
              <li>• Click the mode indicator in the chat interface</li>
              <li>• Browse available modes and descriptions</li>
              <li>• Select the mode that matches your task</li>
            </ul>
          </GlassCard>
          
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Keyboard Shortcut</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Use the quick keyboard shortcut for rapid mode switching during development.
            </p>
            <div className="bg-slate-900 dark:bg-slate-950 border border-slate-700 dark:border-slate-800 rounded px-3 py-2 text-sm font-mono text-slate-200">
              Ctrl + . (Ctrl + period)
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Opens the mode selection menu instantly
            </p>
          </GlassCard>
        </div>

        <h2>Vibe Manager + Cursor Integration</h2>
        <p>
          While Cursor's Plan mode provides excellent single-model planning capabilities, Vibe Manager extends this functionality with multi-model collaboration and advanced context management. This integration creates a powerful hybrid workflow that combines the best of both tools.
        </p>

        <GlassCard className="my-6 p-6 border-l-4 border-l-primary">
          <h3 className="text-lg font-semibold mb-4">Enhanced Planning Workflow</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mt-0.5">1</div>
              <div>
                <h4 className="font-medium">Generate Initial Plan in Cursor</h4>
                <p className="text-sm text-muted-foreground">Use Cursor's Plan mode to create the foundational plan.md with codebase analysis</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mt-0.5">2</div>
              <div>
                <h4 className="font-medium">Import to Vibe Manager</h4>
                <p className="text-sm text-muted-foreground">Load the plan into Vibe Manager for multi-model validation and enhancement</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mt-0.5">3</div>
              <div>
                <h4 className="font-medium">Multi-Model Refinement</h4>
                <p className="text-sm text-muted-foreground">Use different AI models to validate, critique, and improve the plan from multiple perspectives</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center mt-0.5">4</div>
              <div>
                <h4 className="font-medium">Execute with Context</h4>
                <p className="text-sm text-muted-foreground">Return to Cursor with the refined plan and maintain context throughout implementation</p>
              </div>
            </div>
          </div>
        </GlassCard>

        <h3>Key Integration Benefits</h3>
        <ul className="space-y-3 my-6">
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
            <span><strong>Multi-Model Validation:</strong> Different AI models can review and improve plans from various perspectives</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
            <span><strong>Context Preservation:</strong> Maintain rich context across different tools and sessions</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
            <span><strong>Specialized Expertise:</strong> Leverage model strengths for specific aspects of planning and implementation</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
            <span><strong>Iterative Improvement:</strong> Continuously refine plans based on multi-model feedback</span>
          </li>
        </ul>

        <h2>Frequently Asked Questions</h2>
        
        <div className="space-y-6 my-8">
          <GlassCard className="p-6">
            <h3 className="font-semibold mb-2">Is Plan a built-in mode?</h3>
            <p className="text-muted-foreground">
              Cursor lets you choose modes and provides a Plan example. The Plan mode is one of several example modes that demonstrate how to structure AI workflows for different tasks. You can use it as-is or customize it to fit your specific planning needs.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-2">What's the Planning feature vs Plan mode?</h3>
            <p className="text-muted-foreground">
              Planning = todos/queue system; Plan example = mode. The Planning feature provides todo management and queued instructions across all modes, while the Plan mode is a specific AI behavior template focused on creating structured plans and breaking down complex tasks.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-2">How do I switch between modes in Cursor?</h3>
            <p className="text-muted-foreground">
              You can switch modes using the mode picker in the interface or by pressing Ctrl+. (Ctrl+period) to access the mode selection menu. The mode picker shows all available modes with descriptions to help you choose the right one for your task.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-2">Can I customize the Plan mode behavior?</h3>
            <p className="text-muted-foreground">
              Yes, you can modify the Plan mode template to fit your specific workflow needs. The mode defines how the AI behaves when generating plans and managing project structure, and you can adjust the prompts, tools, and behavior patterns to match your preferences.
            </p>
          </GlassCard>
        </div>

      </DocsArticle>
    </>
  );
}