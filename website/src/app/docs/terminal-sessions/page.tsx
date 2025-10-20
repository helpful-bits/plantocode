import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';

export const metadata: Metadata = {
  title: 'Terminal sessions - PlanToCode',
  description: 'How the PTY terminal runs inside PlanToCode, detects agent inactivity, and manages session persistence.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/terminal-sessions',
  },
  openGraph: {
    title: 'Terminal sessions - PlanToCode',
    description: 'Understand session persistence, agent attention detection, and recovery in the plan terminal.',
    url: 'https://www.plantocode.com/docs/terminal-sessions',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

export default function TerminalSessionsDocPage() {
  return (
    <DocsArticle
      title="Terminal Sessions"
      description="Persistent PTY sessions, agent attention detection, and recovery behaviour in the Implementation Plans terminal."
      date="2025-09-22"
      readTime="6 min"
      category="Product Guide"
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Run commands in a persistent PTY with health checks and logging. Voice transcription is available when you need it.
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Session lifecycle</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            When a terminal opens, the UI component creates a PTY session and streams output through a buffered view. The
            component shows immediate connection status, forwards keystrokes to the PTY, and automatically retries if the session
            fails. Session metadata is stored in SQLite with timestamps, exit codes, working directories, and the full output
            log so that restarts can resume previous context.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Dependency checks</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            Before launching commands, the terminal checks for the presence of supported CLI tools such as claude, cursor, codex,
            and gemini. The same command also reports the default shell so users know which environment will run. This prevents
            launching into a session that cannot find the required binary.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Agent attention detection</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The terminal monitors agent activity through a two-level inactivity detection system. When an agent stops producing
            output, the system progressively alerts you to check what has happened:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li><strong>Level 1 (30 seconds):</strong> "Agent idle - may have completed task" with yellow indicator</li>
            <li><strong>Level 2 (2 minutes):</strong> "Agent requires attention - check terminal" with red indicator and desktop notification</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            This approach helps you track when agents have finished tasks or need guidance, without trying to guess why they
            stopped. Attention indicators clear automatically when new output is received.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Voice transcription and recovery</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Inside the terminal modal, voice transcription can capture speech and paste it into the terminal input area. The
            recording hook looks up project-level transcription settings, keeps track of recording state, and streams recognised
            text into the active plan session.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If a PTY session disconnects, the terminal surface displays recovery controls and retries the connection with
            exponential backoff. Health checks continue monitoring session state and provide automatic recovery actions when
            connection issues are detected.
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
