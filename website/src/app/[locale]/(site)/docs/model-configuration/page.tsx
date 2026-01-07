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
    slug: '/docs/model-configuration',
    title: t['modelConfiguration.meta.title'] || 'Model Configuration and Guardrails - PlanToCode',
    description: t['modelConfiguration.meta.description'] || 'How PlanToCode configures per-task model lists, enforces token guardrails, and fetches runtime config from the server.',
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ModelConfigurationDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  // Task types with their model configurations (from server/migrations/data_app_configs.sql)
  const taskConfigs = [
    { task: 'implementation_plan', defaultModel: 'openai/gpt-5.2-2025-12-11', maxOutput: 23000 },
    { task: 'implementation_plan_merge', defaultModel: 'openai/gpt-5.2-2025-12-11', maxOutput: 35000 },
    { task: 'task_refinement', defaultModel: 'anthropic/claude-opus-4-5-20251101', maxOutput: 16384 },
    { task: 'text_improvement', defaultModel: 'anthropic/claude-opus-4-5-20251101', maxOutput: 4096 },
    { task: 'voice_transcription', defaultModel: 'openai/gpt-4o-transcribe', maxOutput: 4096 },
    { task: 'regex_file_filter', defaultModel: 'anthropic/claude-sonnet-4-5-20250929', maxOutput: 35000 },
    { task: 'file_relevance_assessment', defaultModel: 'openai/gpt-5-mini', maxOutput: 24000 },
    { task: 'extended_path_finder', defaultModel: 'openai/gpt-5-mini', maxOutput: 8192 },
    { task: 'web_search_prompts_generation', defaultModel: 'openai/gpt-5.2-2025-12-11', maxOutput: 30000 },
    { task: 'video_analysis', defaultModel: 'google/gemini-2.5-pro', maxOutput: 50000 },
  ];

  // Guardrail checks
  const guardrailChecks = [
    { check: 'Context Window', description: 'Prompt + max_output must fit within model context limit' },
    { check: 'Output Budget', description: 'Requested output tokens cannot exceed model max_output' },
  ];

  return (
    <DocsArticle
      title={t['modelConfiguration.title'] || 'Model Configuration and Guardrails'}
      description={t['modelConfiguration.description'] || 'Per-task model settings, token guardrails, and runtime configuration from the server.'}
      date={t['modelConfiguration.date'] || '2025-09-20'}
      readTime={t['modelConfiguration.readTime'] || '8 min'}
      category={t['modelConfiguration.category'] || 'Research & Models'}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        PlanToCode treats model selection as a task-level decision. Each workflow ships with a default model and an allowed list,
        and the desktop client exposes these options through a toggle that prevents sending prompts that exceed the active context window.
        Configuration is fetched from <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/config/desktop-runtime-config</code> at
        startup and can be overridden per project in SQLite.
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['modelConfiguration.visuals.selector.title'] || 'Model selector toggle'}
        description={t['modelConfiguration.visuals.selector.description'] || 'How the model selector shows allowed models with token guardrails.'}
        imageSrc={t['modelConfiguration.visuals.selector.imageSrc'] || '/images/docs/model-configuration/selector.png'}
        imageAlt={t['modelConfiguration.visuals.selector.imageAlt'] || 'Model selector toggle with token estimates and guardrails'}
        caption={t['modelConfiguration.visuals.selector.caption']}
      />

      {/* Per-Task Allowed Models Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Per-Task Allowed Models and Defaults</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Each task type defines a default model, a list of allowed alternatives, token limits, and optional features like vision support.
            The desktop client reads these settings at runtime to populate the model selector.
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold">Task Type</th>
                  <th className="text-left py-3 px-4 font-semibold">Default Model</th>
                  <th className="text-left py-3 px-4 font-semibold">Max Output</th>
                </tr>
              </thead>
              <tbody>
                {taskConfigs.map((config) => (
                  <tr key={config.task} className="border-b border-border/50">
                    <td className="py-3 px-4">
                      <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{config.task}</code>
                    </td>
                    <td className="py-3 px-4 font-medium">{config.defaultModel}</td>
                    <td className="py-3 px-4 text-muted-foreground">{config.maxOutput.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Allowed alternatives are specified per task. For example, <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">implementation_plan</code> allows
            switching between Claude, GPT-4o, and Gemini models.
          </p>
        </GlassCard>
      </section>

      {/* Token Guardrails Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Token Guardrails (Context Window Checks)</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Before sending any request, the system validates that the prompt plus planned output tokens fit within the model's
            advertised context window. Violations prevent the request from being sent.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Token guardrail validation
interface TokenGuardrail {
  model: string;
  context_window: number;
  max_output: number;
}

function validateRequest(
  prompt_tokens: number,
  requested_output: number,
  guardrail: TokenGuardrail
): ValidationResult {
  const total = prompt_tokens + requested_output;

  if (total > guardrail.context_window) {
    return {
      valid: false,
      error: \`Request requires \${total} tokens but model supports \${guardrail.context_window}\`,
      overage: total - guardrail.context_window
    };
  }

  if (requested_output > guardrail.max_output) {
    return {
      valid: false,
      error: \`Requested \${requested_output} output tokens but model max is \${guardrail.max_output}\`
    };
  }

  return { valid: true };
}`}</code></pre>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            {guardrailChecks.map((item) => (
              <div key={item.check} className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-1">{item.check}</h4>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      {/* Runtime Config Endpoint Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Runtime Config from /api/config/desktop-runtime-config</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The desktop client fetches runtime configuration at startup from the server. This includes task model configs,
            provider information with model details, and concurrency limits.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// DesktopRuntimeAIConfig response structure
{
  "tasks": {
    "implementation_plan": {
      "model": "openai/gpt-5.2-2025-12-11",
      "allowedModels": [
        "openai/gpt-5.2-2025-12-11",
        "google/gemini-3-pro-preview",
        "google/gemini-2.5-pro",
        "anthropic/claude-opus-4-5-20251101",
        "deepseek/deepseek-r1-0528"
      ],
      "maxTokens": 23000,
      "temperature": 0.7,
      "copyButtons": [...]
    }
    // ... other task configs
  },
  "providers": [
    {
      "provider": { "code": "openai", "name": "OpenAI" },
      "models": [
        {
          "id": "openai/gpt-5.2-2025-12-11",
          "name": "GPT-5.2",
          "contextWindow": 200000,
          "priceInputPerMillion": "2.50",
          "priceOutputPerMillion": "10.00"
        }
      ]
    }
  ],
  "maxConcurrentJobs": 20
}`}</code></pre>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Config Lifecycle</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Fetched once at app startup</li>
              <li>• Cached in React context for component access</li>
              <li>• Auto-refreshed every 30 seconds via background sync</li>
              <li>• Merged with project-level overrides</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Project-Level Overrides Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Project-Level Overrides in SQLite</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Teams can override server defaults at the project level. These overrides are stored in the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">key_value_store</code> table
            using a structured key pattern and merged with the runtime config when tasks are executed.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`-- Project task settings use key_value_store with structured keys
-- Key pattern: project_task_settings:{project_hash}:{task_type}:{field}

-- Example: Override model for implementation_plan in a specific project
INSERT INTO key_value_store (key, value, updated_at) VALUES (
    'project_task_settings:abc123hash:implementation_plan:model',
    'anthropic/claude-opus-4-5-20251101',
    strftime('%s', 'now')
);

-- Example: Override temperature
INSERT INTO key_value_store (key, value, updated_at) VALUES (
    'project_task_settings:abc123hash:implementation_plan:temperature',
    '0.5',
    strftime('%s', 'now')
);

-- Retrieve all settings for a project
SELECT key, value FROM key_value_store
WHERE key LIKE 'project_task_settings:abc123hash:%';`}</code></pre>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Merge Behavior</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Project overrides take precedence over server defaults. Settings are retrieved using the <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-xs font-mono">get_all_project_task_settings</code> method
              which queries all keys matching the project hash prefix.
            </p>
          </div>
        </GlassCard>
      </section>

      {/* Model Selector Toggle Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Selector Toggle in the Client</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Implementation Plans panel renders allowed models through a <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">ModelSelectorToggle</code> component.
            The toggle displays each allowed model, tracks the active selection, and checks whether the estimated prompt plus planned output tokens fit within the model's
            context window before allowing a switch.
          </p>
          <div className="space-y-4 mt-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
              <div>
                <h4 className="font-semibold">Load Allowed Models</h4>
                <p className="text-sm text-muted-foreground">Component reads task config from context, filters to allowed models</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
              <div>
                <h4 className="font-semibold">Estimate Tokens</h4>
                <p className="text-sm text-muted-foreground">Call token estimation command with current prompt and selected model</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
              <div>
                <h4 className="font-semibold">Apply Guardrails</h4>
                <p className="text-sm text-muted-foreground">Disable models that cannot fit the prompt, show overage in tooltip</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">4</div>
              <div>
                <h4 className="font-semibold">Allow Selection</h4>
                <p className="text-sm text-muted-foreground">User can switch between enabled models, selection persists to session</p>
              </div>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Overage Warning</h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              If a model cannot support the total token requirement, the toggle disables the button and surfaces a tooltip with
              the computed overage, keeping reviewers within safe limits before sending work to an agent.
            </p>
          </div>
        </GlassCard>
      </section>

      {/* Prompt Estimation Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Prompt Estimation</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Token counts are calculated through the token estimation command. The panel submits the session ID, task description,
            relevant files, and selected model so the backend can return system, user, and total token values.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Token estimation request/response
interface TokenEstimationRequest {
  session_id: string;
  task_description: string;
  selected_files: string[];
  model: string;
}

interface TokenEstimationResponse {
  system_tokens: number;
  user_tokens: number;
  total_tokens: number;
  model_context_window: number;
  model_max_output: number;
  remaining_capacity: number;
  estimated_cost: number;
}`}</code></pre>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Estimation Sources</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• tiktoken for GPT models</li>
                <li>• Anthropic tokenizer for Claude</li>
                <li>• Character heuristics for others</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Display in UI</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Token count badge on model selector</li>
                <li>• Cost estimate in tooltip</li>
                <li>• Progress bar for context usage</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Extended Configuration Options Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Extended Configuration Options</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Beyond model selection, task configs can specify additional parameters that affect generation behavior.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Temperature</h4>
              <p className="text-sm text-muted-foreground">
                Controls randomness in generation. Lower values (0.1-0.3) for deterministic tasks like code generation,
                higher values (0.7-0.9) for creative tasks.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Top-P (Nucleus Sampling)</h4>
              <p className="text-sm text-muted-foreground">
                Alternative to temperature. Limits sampling to tokens comprising the top P probability mass.
                Typically set to 0.9-0.95.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Stop Sequences</h4>
              <p className="text-sm text-muted-foreground">
                Strings that terminate generation when encountered. Used to stop at specific markers like
                {"</plan>"} or {"[END]"}.
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">System Prompt</h4>
              <p className="text-sm text-muted-foreground">
                Task-specific system prompts that set context and constraints. Can be customized per project.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* CTA Section */}
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">See how routing uses these configs</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Provider routing shows how model configs determine where requests are sent and how usage is tracked.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/provider-routing">Provider routing</Link>
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
