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
    title: t['copyButtonsDoc.meta.title'] || 'Copy Buttons - PlanToCode',
    description: t['copyButtonsDoc.meta.description'] || 'How template-driven copy buttons resolve placeholders against plans and hand off to terminals or clipboard for agent execution.',
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
    { placeholder: '{{IMPLEMENTATION_PLAN}}', description: 'Full merged plan XML content' },
    { placeholder: '{{STEP_CONTENT}}', description: 'Content of a specific plan step by index' },
    { placeholder: '{{TASK_DESCRIPTION}}', description: 'The refined task specification' },
    { placeholder: '{{PROJECT_CONTEXT}}', description: 'File paths, directory structure, and repo summary' },
    { placeholder: '{{SELECTED_FILES}}', description: 'List of files included in the plan' },
    { placeholder: '{{MODEL_NAME}}', description: 'Currently selected model identifier' },
    { placeholder: '{{SESSION_ID}}', description: 'Active session UUID for traceability' },
    { placeholder: '{{COMMANDS}}', description: 'Extracted shell commands from plan steps' },
    { placeholder: '{{STEPS_SECTION}}', description: 'Plan steps without agent instructions' },
    { placeholder: '{{REQUIREMENTS}}', description: 'Task requirements and constraints' },
  ];

  // Default buttons
  const defaultButtons = [
    { id: 'use-full-plan', label: 'Use Full Plan', description: 'Copies the entire implementation plan XML content. Best for agents that accept structured plan input.' },
    { id: 'use-step', label: 'Use This Step', description: 'Copies only the currently selected step content. Useful for incremental execution or reviewing specific changes.' },
    { id: 'use-commands', label: 'Use Commands', description: 'Extracts and copies only the shell commands from the plan steps. Ideal for quick terminal execution.' },
    { id: 'use-steps-only', label: 'Use Steps Only', description: 'Copies the plan steps without agent instructions or metadata. Cleaner output for human review.' },
  ];

  // Audit fields
  const auditFields = [
    { field: 'action_id', description: 'Unique identifier for this handoff action' },
    { field: 'plan_id', description: 'Source implementation plan reference' },
    { field: 'job_id', description: 'Associated background job if applicable' },
    { field: 'session_id', description: 'Target terminal session or null for clipboard' },
    { field: 'template_id', description: 'Template configuration that was used' },
    { field: 'content_hash', description: 'SHA-256 of resolved content for integrity' },
    { field: 'created_at', description: 'Timestamp of the action' },
  ];

  return (
    <DocsArticle
      title={t['copyButtonsDoc.title'] || 'Copy Buttons'}
      description={t['copyButtonsDoc.description'] || 'Template-driven handoff from implementation plans to PTY terminals and external tools.'}
      date={t['copyButtonsDoc.date'] || '2025-09-23'}
      readTime={t['copyButtonsDoc.readTime'] || '10 min'}
      category={t['copyButtonsDoc.category'] || 'Execution'}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Copy buttons bridge planning and execution by resolving template placeholders against the active plan, then delivering
        the result to PTY sessions or the system clipboard. Each action is tied to job metadata for complete audit trails,
        enabling teams to trace exactly what was sent to agents.
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['copyButtonsDoc.visuals.templateFlow.title'] || 'Template resolution flow'}
        description={t['copyButtonsDoc.visuals.templateFlow.description'] || 'How button templates pull task context, plan XML, and model settings before handoff.'}
        imageSrc={t['copyButtonsDoc.visuals.templateFlow.imageSrc'] || '/images/docs/copy-buttons/templates.svg'}
        imageAlt={t['copyButtonsDoc.visuals.templateFlow.imageAlt'] || 'Flow showing copy button template resolution'}
        caption={t['copyButtonsDoc.visuals.templateFlow.caption']}
      />

      {/* Template Configuration Sources Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Template Configuration Sources</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Copy button templates follow a layered configuration model. Server defaults provide baseline templates, project-level
            overrides customize for team workflows, and task-specific configurations handle one-off scenarios.
          </p>
          <div className="space-y-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Server Defaults</h4>
              <p className="text-sm text-muted-foreground">
                Shared templates from <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">/api/config/desktop-runtime-config</code>.
                Includes button labels, template strings, target (terminal or clipboard), and visibility conditions.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Project Overrides</h4>
              <p className="text-sm text-muted-foreground">
                Templates stored in SQLite <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">project_settings</code> table.
                Merged at runtime with server defaults to customize for team standards.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Task-Specific</h4>
              <p className="text-sm text-muted-foreground">
                Per-<code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">task_model_config</code> templates for specialized
                workflows. Enables custom handoff patterns without modifying global settings.
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
            The resolution engine supports nested context access and conditional sections.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Example template with placeholders
You are an AI coding assistant. Execute the following plan:

{{IMPLEMENTATION_PLAN}}

Working on task: {{TASK_DESCRIPTION}}

Selected files for context:
{{SELECTED_FILES}}

Model: {{MODEL_NAME}}
Session: {{SESSION_ID}}`}</code></pre>
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
            <strong>Resolution order:</strong> Job metadata first, then plan content, then session context. Undefined placeholders
            are preserved in the output for debugging.
          </p>
        </GlassCard>
      </section>

      {/* Template Processing Pipeline Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Template Processing Pipeline</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            When a button is clicked, the template processor executes a multi-step pipeline: placeholder extraction,
            context lookup, value substitution, and output formatting.
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
                <h4 className="font-semibold">Format Output</h4>
                <p className="text-sm text-muted-foreground">Apply target-specific escaping (shell for terminal, plain for clipboard)</p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Large Plan Chunking</h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Plans exceeding 100KB are automatically chunked into sequential segments with clear boundaries to avoid
              overloading terminal buffers or clipboard limits. Each chunk is prefixed with its position (e.g., "[Part 1/3]").
            </p>
          </div>
        </GlassCard>
      </section>

      {/* PTY Terminal Handoff Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">PTY Terminal Handoff</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Buttons configured for terminal handoff write directly to the PTY session input buffer. The resolved template
            appears as if typed by the user, triggering agent execution immediately.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`// Terminal handoff implementation
async fn handoff_to_terminal(
    session_id: &str,
    content: &str,
    template_id: &str,
) -> Result<HandoffResult> {
    // Get PTY writer for session
    let writer = terminal_manager.get_writer(session_id)?;

    // Write content to PTY input buffer
    writer.write_all(content.as_bytes()).await?;

    // Log the action for audit
    copy_button_actions.insert(CopyButtonAction {
        session_id: session_id.to_string(),
        template_id: template_id.to_string(),
        content_hash: sha256(content),
        created_at: Utc::now(),
    })?;

    Ok(HandoffResult::Terminal { session_id })
}`}</code></pre>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Handoff Details</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Content written via <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">master.take_writer()</code></li>
              <li>• Supports multi-line input and escape sequences</li>
              <li>• UI displays first 100 characters as confirmation preview</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Clipboard Handoff Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Clipboard Handoff</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Buttons configured for clipboard copy the resolved template to the system clipboard using the Tauri clipboard API.
            This enables handoff to external tools like IDE terminals or web-based agents.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Cross-Platform API</h4>
              <p className="text-sm text-muted-foreground">
                Uses <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">tauri::api::clipboard::set_text()</code> for
                consistent clipboard access across macOS, Windows, and Linux.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">User Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Toast notification confirms the copy with a preview of the content and token count estimate for the target model.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Job Metadata and Audit Trail Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Job Metadata and Audit Trail</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every copy button action is linked to job metadata for complete traceability. The audit record includes the source plan,
            target session, resolved content hash, and user context.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm"><code>{`-- copy_button_actions table schema
CREATE TABLE copy_button_actions (
    action_id    TEXT PRIMARY KEY,
    plan_id      TEXT NOT NULL REFERENCES implementation_plans(id),
    job_id       TEXT REFERENCES background_jobs(id),
    session_id   TEXT REFERENCES terminal_sessions(session_id),
    template_id  TEXT NOT NULL,
    content_hash TEXT NOT NULL,  -- SHA-256 for integrity verification
    created_at   TEXT NOT NULL
);

-- Query to trace plan handoffs
SELECT * FROM copy_button_actions
WHERE plan_id = ?
ORDER BY created_at DESC;`}</code></pre>
          </div>
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-3">Audit Record Fields</h4>
            <div className="grid gap-2">
              {auditFields.map((item) => (
                <div key={item.field} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                  <code className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold">
                    {item.field}
                  </code>
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <strong>Retention:</strong> Audit records are retained for 90 days by default, configurable in project settings.
          </p>
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
            Copy buttons can be customized at multiple levels: global defaults, project-level overrides, and per-task configurations.
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
                in SQLite and merged with server defaults at runtime.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Task-Level Configuration</h4>
              <p className="text-sm text-muted-foreground">
                Individual tasks can have their own copy button configurations. This allows different button sets for
                implementation plans, code reviews, or documentation tasks.
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
            Copy buttons appear in plan viewers and terminal headers. Each button shows a preview popover with the resolved
            content and token estimate before execution.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Token Estimation</h4>
              <p className="text-sm text-muted-foreground">
                Token estimates help reviewers validate that the prompt fits within the target model's context window before handoff.
                Displayed alongside the preview.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Full Preview Modal</h4>
              <p className="text-sm text-muted-foreground">
                Clicking the preview icon opens a modal with the full resolved template, syntax highlighting, and diff view
                if the template has changed since last use.
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
            Terminal sessions show where copy button output lands and how it is logged.
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
