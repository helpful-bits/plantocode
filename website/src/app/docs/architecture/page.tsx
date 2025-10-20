import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';

export const metadata: Metadata = {
  title: 'PlanToCode architecture overview',
  description: 'Desktop, orchestration, and persistence layers that power implementation plans, workflows, and terminal sessions.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/vibe-manager-architecture',
  },
  openGraph: {
    title: 'PlanToCode architecture overview',
    description: 'Learn how the React front end, Tauri commands, and background services cooperate inside the desktop app.',
    url: 'https://www.plantocode.com/docs/vibe-manager-architecture',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

export default function VibeManagerArchitecturePage() {
  return (
    <DocsArticle
      title="PlanToCode Architecture"
      description="How the desktop shell, background workflows, and shared services are organised."
      date="2025-09-19"
      readTime="7 min"
      category="Architecture"
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        PlanToCode is a Tauri desktop application with a React front end. The UI renders implementation plans, terminals, and
        configuration controls, while the Rust backend exposes commands for workflows, token estimation, and persistent terminal
        sessions. This overview summarises how those pieces fit together.
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Frontend surface</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The desktop UI is built with React components. Implementation plan content is displayed through a Monaco-based
            viewer that virtualises large plans, detects languages, and supports copy actions so reviewers can examine plan text
            without performance issues. Terminal sessions render inside a buffered view that attaches to PTY output and shows
            connection status updates.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Shared providers handle notifications, runtime configuration, and plan state. The Implementation Plans panel keeps
            plan metadata, manages modal visibility, and requests token estimates or prompt content as needed.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Tauri commands and services</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Rust side of the application exposes commands for workflows, terminal sessions, and model tooling. The workflow
            commands start background jobs through the Workflow Orchestrator, validating inputs and emitting progress events as
            the file discovery pipeline runs. Token estimation commands calculate prompt sizes for the currently selected model.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Terminal commands manage PTY processes, track remote clients, and verify whether supported CLI binaries are
            available before launching a session. Health checks combine PTY status with database records to report whether a
            session is still alive.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Persistence and configuration</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Terminal output and session metadata are stored in SQLite via the terminal sessions repository. Each record includes
            identifiers, timestamps, working directories, environment variables, and the accumulated log so that restarts can
            recover prior output. The same repository emits events when session state changes.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Model defaults live in the application configuration table. Each task defines a default model, a list of allowed
            alternatives, token budgets, and optional copy-button presets. The React layer reads these settings to populate the
            model selector and guardrails.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Voice transcription pipeline</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            Voice transcription is implemented as a React hook that coordinates media permissions, microphone selection, and
            streaming transcription requests. The hook integrates with the plan terminal and prompt editors, inserting recognised
            text directly into the active component and surfacing notifications if transcription fails.
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
