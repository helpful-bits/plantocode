import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';

export const metadata: Metadata = {
  title: 'Model Configuration and Guardrails',
  description: 'How Vibe Manager lets you pick allowed models per task and keeps prompts within the active context window.',
  alternates: {
    canonical: 'https://www.vibemanager.app/docs/model-configuration',
  },
  openGraph: {
    title: 'Model Configuration and Guardrails',
    description: 'Learn how task-level model settings, selector toggles, and token estimates work together.',
    url: 'https://www.vibemanager.app/docs/model-configuration',
    type: 'article',
  },
};

export default function ModelConfigurationDocPage() {
  return (
    <DocsArticle
      title="Model Configuration"
      description="Task-level model lists, selector controls, and token guardrails in the desktop client."
      date="2025-09-20"
      readTime="5 min"
      category="Product Guide"
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Vibe Manager treats model selection as a task-level decision. Each workflow ships with a default model and an allowed
        list, and the desktop client exposes these options through a toggle that prevents sending prompts that exceed the active
        context window.
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Task-driven defaults</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Default models and allowed alternatives are stored server-side in the application configuration. Each task type - such
            as implementation plans, merges, prompt generation, or voice transcription - defines a preferred model, a list of
            allowed options, and token limits that the desktop app reads at runtime.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Selector toggle in the client</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Implementation Plans panel renders allowed models with the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">ModelSelectorToggle</code>.
            The toggle displays each allowed model, tracks the active selection, and checks whether the estimated prompt plus
            planned output tokens fit within the model&rsquo;s advertised context window before allowing a switch.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If a model cannot support the total token requirement, the toggle disables the button and surfaces a tooltip with the
            computed overage, keeping reviewers within safe limits before they send work to an agent.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Prompt estimation</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            Token counts are calculated through the token estimation command. The panel submits the session id, task description,
            relevant files, and the selected model so the backend can return system, user, and total token values. These numbers
            feed directly into the selector guardrails and let teams spot over-limit prompts before copying them into another
            tool.
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
