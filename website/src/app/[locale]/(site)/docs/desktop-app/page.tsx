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
    slug: '/docs/desktop-app',
    title: t['desktopApp.meta.title'],
    description: t['desktopApp.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function DesktopAppDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['desktopApp.title']}
      description={t['desktopApp.description']}
      date={t['desktopApp.date']}
      readTime={t['desktopApp.readTime']}
      category={t['desktopApp.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['desktopApp.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['desktopApp.visuals.shell.title']}
        description={t['desktopApp.visuals.shell.description']}
        imageSrc={t['desktopApp.visuals.shell.imageSrc']}
        imageAlt={t['desktopApp.visuals.shell.imageAlt']}
        caption={t['desktopApp.visuals.shell.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.ui.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['desktopApp.ui.description']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.commands.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['desktopApp.commands.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Key command modules:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>workflow_commands.rs - Workflow orchestration</li>
              <li>job_commands.rs - Job status and management</li>
              <li>terminal_commands.rs - PTY session control</li>
              <li>session_commands.rs - Session CRUD operations</li>
              <li>implementation_plan_commands.rs - Plan generation</li>
              <li>audio_commands.rs - Voice transcription</li>
              <li>video_analysis_commands.rs - Video processing</li>
              <li>device_commands.rs - Mobile device linking</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.jobs.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['desktopApp.jobs.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Job system components:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>queue.rs - Priority queue with 8 concurrent workers</li>
              <li>dispatcher.rs - Job execution dispatcher</li>
              <li>registry.rs - Processor registration</li>
              <li>workflow_orchestrator/ - Multi-stage workflow engine</li>
              <li>processors/ - 12+ job type processors</li>
              <li>streaming_handler.rs - LLM response streaming</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.persistence.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['desktopApp.persistence.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Core tables:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>sessions - Project context and preferences</li>
              <li>background_jobs - Job records with prompts/responses</li>
              <li>terminal_sessions - PTY output logs</li>
              <li>task_description_history - Task version history</li>
              <li>file_selection_history - File selection tracking</li>
              <li>project_system_prompts - Per-project overrides</li>
              <li>key_value_store - Application settings</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.terminal.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['desktopApp.terminal.description']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['desktopApp.inputStability.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['desktopApp.inputStability.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['desktopApp.inputStability.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Explore related internals</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The background jobs and data model docs explain how the desktop app persists and processes work.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/background-jobs">Background jobs</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/data-model">Data model</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <Link href="/docs/terminal-sessions">Terminal sessions</Link>
            <Link href="/docs/tauri-v2">Tauri v2 guide</Link>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
