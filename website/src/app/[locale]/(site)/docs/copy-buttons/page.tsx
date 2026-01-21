import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/copy-buttons',
    title: t['copyButtons.meta.title'] || 'Copy Buttons - PlanToCode',
    description: t['copyButtons.meta.description'] || 'How template-driven copy buttons resolve placeholders against plans and hand off to terminals or clipboard for agent execution.',
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function CopyButtonsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  // Placeholder examples
  const placeholders = [
    { placeholder: '{{IMPLEMENTATION_PLAN}}', description: 'Full plan content as shown in the viewer' },
    { placeholder: '{{STEP_CONTENT}}', description: 'Content of the selected plan step (when a step is selected)' },
    { placeholder: '{{TASK_DESCRIPTION}}', description: 'Current task description from the session' },
  ];

  // Default buttons
  const defaultButtons = [
    { id: 'parallel-agents', label: 'Parallel Claude Coding Agents', description: 'Template that instructs Claude Code to launch parallel agents using the plan.' },
    { id: 'investigate-results', label: 'Investigate Results', description: 'Template that asks the agent to review changes without launching new agents.' },
    { id: 'task-only', label: 'Task', description: 'Copies only the task description.' },
    { id: 'task-and-plan', label: 'Task + Plan', description: 'Combines task description and plan for full context.' },
    { id: 'plan-only', label: 'Plan', description: 'Copies only the plan content.' },
  ];

  return (
    <DocsArticle
      title={t['copyButtons.title'] || 'Copy Buttons'}
      description={t['copyButtons.description'] || 'Template-driven handoff from implementation plans to PTY terminals and external tools.'}
      date={t['copyButtons.date'] || '2025-09-23'}
      readTime={t['copyButtons.readTime'] || '10 min'}
      category={t['copyButtons.category'] || 'Execution'}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Copy buttons resolve template placeholders against the active plan and then send the result to the clipboard (plan views)
        or the PTY (terminal modal). They are a lightweight way to hand plan context to agent CLIs or terminals without extra steps.
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['copyButtons.visuals.templateFlow.title'] || 'Template resolution flow'}
        description={t['copyButtons.visuals.templateFlow.description'] || 'How button templates pull task context, plan XML, and model settings before handoff.'}
        imageSrc={t['copyButtons.visuals.templateFlow.imageSrc'] || '/images/docs/copy-buttons/templates.svg'}
        imageAlt={t['copyButtons.visuals.templateFlow.imageAlt'] || 'Flow showing copy button template resolution'}
        caption={t['copyButtons.visuals.templateFlow.caption']}
      />

      {/* Template Configuration Sources Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Template Configuration Sources</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Copy button templates follow a layered configuration model. Server defaults provide baseline templates, and
            project-level overrides customize the implementation_plan task for a given repo.
          </p>
          <div className="space-y-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Server Defaults</h4>
              <p className="text-sm text-muted-foreground">
                Shared templates from <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">/api/config/desktop-runtime-config</code>.
                Includes button labels and template strings.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Project Overrides</h4>
              <p className="text-sm text-muted-foreground">
                Templates stored in SQLite key_value_store under <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">project_task_settings</code>.
                Merged at runtime with server defaults to customize team standards.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Task-Specific</h4>
              <p className="text-sm text-muted-foreground">
                Copy buttons are configured per task type (implementation_plan) and stored per project. There is no per-job
                override in the current release.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Placeholder Resolution Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Placeholder Resolution</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Templates use double-brace placeholders that are resolved against the active plan and session context at click time.
            Supported placeholders include the full plan, the current task description, and the selected step content.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Example template with placeholders
You are an AI coding assistant. Execute the following plan:

{{IMPLEMENTATION_PLAN}}

Task: {{TASK_DESCRIPTION}}`}</code></pre>
          </div>
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-3">Available Placeholders</h4>
            <div className="grid gap-2">
              {placeholders.map((item) => (
                <div key={item.placeholder} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                  <code className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold whitespace-nowrap">
                    {item.placeholder}
                  </code>
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <strong>Resolution:</strong> Missing placeholders are replaced with empty strings. Step content is only available
            when a plan step is selected.
          </p>
        </GlassCard>
      </section>

      {/* Template Processing Pipeline Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Template Processing Pipeline</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            When a button is clicked, the template processor executes a multi-step pipeline: placeholder extraction,
            context lookup, value substitution, and delivery to clipboard or terminal.
          </p>
          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
              <div>
                <h4 className="font-semibold">Extract Placeholders</h4>
                <p className="text-sm text-muted-foreground">Regex scan for {"{{...}}"} patterns in the template string</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
              <div>
                <h4 className="font-semibold">Lookup Context</h4>
                <p className="text-sm text-muted-foreground">Query job metadata, plan content, and session state for values</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
              <div>
                <h4 className="font-semibold">Substitute Values</h4>
                <p className="text-sm text-muted-foreground">Replace placeholders with resolved values, preserving formatting</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">4</div>
              <div>
                <h4 className="font-semibold">Send Output</h4>
                <p className="text-sm text-muted-foreground">Copy to clipboard (plan views) or write to the PTY input buffer (terminal modal)</p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Large Plan Chunking</h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Terminal handoff splits large content into 4KB segments and appends a carriage return after sending.
              Clipboard copy is a single write.
            </p>
          </div>
        </GlassCard>
      </section>

      {/* PTY Terminal Handoff Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">PTY Terminal Handoff</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            In the plan terminal modal, copy buttons write the resolved template to the PTY input buffer. Large content is
            chunked and a carriage return is appended after sending.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`// Terminal handoff (PlanTerminalModal)
const textToSend = replacePlaceholders(button.content, {
  IMPLEMENTATION_PLAN: planContent,
  TASK_DESCRIPTION: taskDescription ?? ''
});
await sendInChunks(sessionId, textToSend);`}</code></pre>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Handoff Details</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Content sent via <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">write_terminal_input_command</code></li>
              <li>• Chunked into 4KB segments for large plans</li>
              <li>• Appends a carriage return after sending</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Clipboard Handoff Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Clipboard Handoff</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            In plan cards and plan modals, buttons copy the resolved template to the system clipboard using the browser
            clipboard API. This enables handoff to external tools like IDE terminals or web-based agents.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Cross-Platform API</h4>
              <p className="text-sm text-muted-foreground">
                Uses <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">navigator.clipboard.writeText()</code> inside the
                Tauri webview for clipboard access.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">User Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Toast notification confirms the copy action.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Default Copy Buttons Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Default Copy Buttons</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            PlanToCode ships with several default copy buttons that cover common workflows. These can be customized or
            extended through project settings.
          </p>
          <div className="grid gap-3 mt-4">
            {defaultButtons.map((button) => (
              <div key={button.id} className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <code className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold">
                    {button.label}
                  </code>
                  <span className="text-xs text-muted-foreground font-mono">{button.id}</span>
                </div>
                <p className="text-sm text-muted-foreground">{button.description}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      {/* Customization Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Customizing Copy Buttons</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Copy buttons can be customized at two levels: global defaults and project-level overrides for the implementation_plan task type.
          </p>
          <div className="space-y-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Global Defaults</h4>
              <p className="text-sm text-muted-foreground">
                Server-side configuration in <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">/api/config/desktop-runtime-config</code> defines
                the base set of copy buttons. These are loaded when the desktop app starts and cached for offline use.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Project-Level Customization</h4>
              <p className="text-sm text-muted-foreground">
                Each project can override the default buttons through the Settings panel. Project-specific buttons are stored
                in key_value_store and merged with server defaults at runtime.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Task-Level Configuration</h4>
              <p className="text-sm text-muted-foreground">
                Copy buttons are configured per task type (implementation_plan) and stored per project. There are no per-job overrides.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            The copy button editor in Settings allows drag-and-drop reordering, inline label editing, and template content
            modification. Changes are debounced and persisted automatically.
          </p>
        </GlassCard>
      </section>

      {/* UI Integration and Safety Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">UI Integration and Safety</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Copy buttons appear in plan viewers and terminal headers. Clicking a button sends output immediately; there is
            no preview step by default.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Token Counts</h4>
              <p className="text-sm text-muted-foreground">
                Plan cards display total token counts for the plan job. Copy buttons do not compute per-template token estimates.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Preview</h4>
              <p className="text-sm text-muted-foreground">
                There is no preview popover or modal in the current release. Open the plan content to inspect what will be copied.
              </p>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Disabled State</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Buttons are disabled when required context is missing (e.g., no active plan, missing session). Tooltips explain
              what context is needed to enable the button.
            </p>
          </div>
        </GlassCard>
      </section>

      {/* Mobile Integration Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Mobile Integration</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Copy buttons work across desktop and mobile clients with consistent behavior. The iOS client uses the same
            placeholder resolution logic and can send content to linked terminals.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Device Link Support</h4>
              <p className="text-sm text-muted-foreground">
                When a mobile device is linked to a desktop session, copy buttons can target the desktop terminal directly.
                The resolved content is sent through the device link WebSocket connection.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Mobile-Specific Buttons</h4>
              <p className="text-sm text-muted-foreground">
                Mobile clients support the same button customization as desktop. Button configurations sync through the
                server to maintain consistency across devices.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* CTA Section */}
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Trace handoff to execution</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Terminal sessions show where copy button output lands and keep the session output log.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/terminal-sessions">Terminal sessions</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/implementation-plans">Implementation plans</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
