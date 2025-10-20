import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';

export const metadata: Metadata = {
  title: 'File discovery workflow - PlanToCode',
  description: 'Comprehensive technical guide to the 5-stage AI workflow that identifies and filters relevant files for task execution.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/file-discovery',
  },
  openGraph: {
    title: 'File discovery workflow - PlanToCode',
    description: 'Technical documentation for the multi-stage file discovery workflow architecture.',
    url: 'https://www.plantocode.com/docs/file-discovery',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

export default function FileDiscoveryDocPage() {
  return (
    <DocsArticle
      title="File Discovery Workflow"
      description="Comprehensive technical guide to the 5-stage AI workflow that identifies and filters relevant files for task execution."
      date="2025-09-21"
      readTime="12 min"
      category="Technical Guide"
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        PlanToCode identifies the right files before you plan or run commands. The 5-stage workflow narrows scope and keeps context tight.
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Workflow Architecture</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The workflow operates as an orchestrated background job system with five distinct stages that execute sequentially.
            Each stage builds upon the previous stage's output, progressively refining the file selection based on task requirements.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The system uses a distributed job architecture where each stage runs as an independent background job, enabling
            cancellation, retry logic, and detailed progress tracking. Real-time events are published throughout execution
            to provide immediate feedback to the user interface.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold mb-2">Key Architecture Features:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Event-driven progress reporting with WebSocket-like updates</li>
              <li>• Comprehensive error handling with automatic retry mechanisms</li>
              <li>• Cost tracking and timeout management for AI operations</li>
              <li>• Caching of intermediate results for performance optimization</li>
              <li>• Git integration with fallback to directory traversal</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">5-Stage Workflow Process</h2>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Stage 1: Root Folder Selection</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Determines the project root directory and validates git repository status. This stage establishes the base directory
              for all subsequent file operations and configures exclusion patterns.
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>Technical Details:</strong> Uses git detection with fallback to directory validation, applies user-defined
              exclusion patterns, and establishes the working directory context for the entire workflow.
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Stage 2: Regex File Filter</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Generates intelligent regex patterns based on the task description to perform initial file filtering. This stage
              combines git ls-files output with binary file detection to create a preliminary file list.
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm mb-3">
              <strong>Git Integration:</strong> Executes `git ls-files --cached --others --exclude-standard` to respect
              .gitignore rules while including both tracked and untracked files.
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>Binary Detection:</strong> Filters out files with binary extensions (.jpg, .png, .pdf, .exe, etc.)
              and uses content analysis to detect binary files by null bytes and non-printable character ratios.
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Stage 3: AI File Relevance Assessment</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Employs AI models to analyze file content and assess relevance to the specific task description. This stage
              performs deep content analysis to identify files that are most likely to be useful for the given task.
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>AI Processing:</strong> Uses large language models to evaluate file content against task requirements,
              with intelligent batching to manage token limits and cost optimization.
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Stage 4: Extended Path Finder</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Discovers additional relevant files through relationship analysis and dependency tracking. This stage identifies
              files that might not match initial patterns but are contextually important.
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>Relationship Analysis:</strong> Analyzes import statements, configuration files, and project structure
              to find related files that enhance the context for the specific task.
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Stage 5: Path Correction</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Validates and corrects file paths, ensuring all selected files exist and are accessible. This final stage
              performs consistency checks and path normalization across different operating systems.
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>Validation Process:</strong> Verifies file existence, normalizes path separators, resolves symbolic links,
              and removes any paths that have become invalid during the workflow execution.
            </div>
          </GlassCard>
        </div>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Configuration Options</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">Workflow Configuration</h3>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Timeout Management</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Configure maximum execution time for the entire workflow or individual stages to prevent indefinite hanging.
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                timeoutMs: 300000 // 5 minutes default
              </code>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Exclusion Patterns</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Define directories and file patterns to exclude from the discovery process.
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                excludedPaths: ["node_modules", ".git", "dist", "build"]
              </code>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Retry Configuration</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Set maximum retry attempts for failed stages with exponential backoff.
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                maxRetries: 3 // Per stage retry limit
              </code>
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">API Usage Examples</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">Starting a Workflow</h3>
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`const tracker = await WorkflowTracker.startWorkflow(
  sessionId,
  "Add user authentication to the login page",
  "/path/to/project",
  ["node_modules", "dist"],
  { timeoutMs: 300000 }
);`}
            </pre>
          </div>

          <h3 className="text-lg font-semibold mb-3 mt-6">Monitoring Progress</h3>
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`tracker.onProgress((state) => {
  console.log(\`Stage: \${state.currentStage}\`);
  console.log(\`Progress: \${state.progressPercentage}%\`);
});

tracker.onComplete((results) => {
  console.log(\`Selected \${results.selectedFiles.length} files\`);
});`}
            </pre>
          </div>

          <h3 className="text-lg font-semibold mb-3 mt-6">Retrieving Results</h3>
          <div className="bg-muted/50 rounded-lg p-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`const results = await tracker.getResults();
const selectedFiles = results.selectedFiles;
const intermediateData = results.intermediateData;
const totalCost = results.totalActualCost;`}
            </pre>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Performance Considerations</h2>
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Memory Management</h4>
              <p className="text-sm text-muted-foreground">
                The workflow implements intelligent memory management with file caching (30-second TTL), batch processing
                (100 files per batch), and automatic cleanup of intermediate data to prevent memory exhaustion.
              </p>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Cost Optimization</h4>
              <p className="text-sm text-muted-foreground">
                AI stages track actual costs from API responses, implement intelligent batching to minimize token usage,
                and provide cost estimates before execution to help manage expenses.
              </p>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Performance Monitoring</h4>
              <p className="text-sm text-muted-foreground">
                Built-in performance tracking monitors execution times, memory usage, throughput metrics, and provides
                recommendations for optimization based on historical data analysis.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Integration Patterns</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">Desktop Application</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The workflow integrates seamlessly with the desktop application through Tauri commands, providing native
            file system access and event-driven updates via the WorkflowTracker class.
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-6">Implementation Plans Integration</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Selected files are automatically fed into the Implementation Plans panel, ensuring that plan generation
            uses the same optimized file context without requiring re-execution of the discovery workflow.
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-6">Session Management</h3>
          <p className="text-muted-foreground leading-relaxed">
            Workflow results are cached per session, allowing multiple operations within the same session to reuse
            the discovered file context, significantly improving performance for iterative development workflows.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Error Handling & Troubleshooting</h2>
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Common Issues</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Git repository not found:</strong> Falls back to directory traversal with standard exclusions</li>
                <li>• <strong>Binary file detection:</strong> Uses both extension-based and content-based binary detection</li>
                <li>• <strong>Token limit exceeded:</strong> Implements intelligent batching and provides clear error messages</li>
                <li>• <strong>Network timeouts:</strong> Automatic retry with exponential backoff for transient failures</li>
              </ul>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Error Categories</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <strong>Validation Errors:</strong> Invalid session ID, missing task description, or invalid project directory</li>
                <li>• <strong>Workflow Errors:</strong> Stage-specific failures with detailed context and retry suggestions</li>
                <li>• <strong>Billing Errors:</strong> Insufficient credits or payment failures with actionable guidance</li>
                <li>• <strong>System Errors:</strong> File system access, git command failures, or memory constraints</li>
              </ul>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Debugging Tools</h4>
              <p className="text-sm text-muted-foreground">
                The workflow provides comprehensive logging, performance metrics export, and detailed error context
                including stage information, retry attempts, and intermediate data for troubleshooting.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Workflow State Management</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">State Transitions</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The workflow progresses through clearly defined states: Created → Running → Paused (optional) → Completed/Failed/Canceled.
            Each state transition publishes events that can be monitored for real-time updates.
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-6">Intermediate Data Storage</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Each stage stores its output in a structured intermediate data format, including directory tree content,
            regex patterns, filtered file lists, and path correction results. This data is accessible for debugging
            and can be used to resume workflows from specific stages.
          </p>

          <h3 className="text-lg font-semibold mb-3 mt-6">Event-Driven Updates</h3>
          <p className="text-muted-foreground leading-relaxed">
            The system publishes real-time events for workflow status changes, stage completions, and error conditions.
            These events enable responsive user interfaces and integration with external monitoring systems.
          </p>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Need the desktop app?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The file discovery workflow runs inside the desktop client alongside implementation planning and terminal sessions.
          </p>
          <PlatformDownloadSection location="docs_file_discovery" />
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
