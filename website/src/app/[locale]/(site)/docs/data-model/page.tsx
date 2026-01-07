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
    slug: '/docs/data-model',
    title: t['dataModel.meta.title'],
    description: t['dataModel.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function DataModelDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['dataModel.title']}
      description={t['dataModel.description']}
      date={t['dataModel.date']}
      readTime={t['dataModel.readTime']}
      category={t['dataModel.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['dataModel.intro']}
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.sqlite.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.sqlite.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['dataModel.sqlite.migrations']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.entities.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['dataModel.entities.items'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['dataModel.visuals.schema.title']}
        description={t['dataModel.visuals.schema.description']}
        imageSrc={t['dataModel.visuals.schema.imageSrc']}
        imageAlt={t['dataModel.visuals.schema.imageAlt']}
        caption={t['dataModel.visuals.schema.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Schema details</h2>
        <GlassCard className="p-6">
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">sessions table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>id TEXT PRIMARY KEY</p>
                <p>name, project_directory, project_hash</p>
                <p>task_description, search_term, model_used</p>
                <p>search_selected_files_only INTEGER (0/1)</p>
                <p>video_analysis_prompt, merge_instructions</p>
                <p>included_files, force_excluded_files (JSON)</p>
                <p>task_history_version, file_history_version</p>
                <p>task_history_current_index, file_history_current_index</p>
                <p>created_at, updated_at (Unix timestamps)</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">background_jobs table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>id TEXT PRIMARY KEY, session_id FK</p>
                <p>task_type, status (with CHECK constraint)</p>
                <p>prompt TEXT, response TEXT, error_message TEXT</p>
                <p>tokens_sent, tokens_received, cache_*_tokens</p>
                <p>model_used, actual_cost REAL</p>
                <p>metadata JSON, system_prompt_template</p>
                <p>is_finalized INTEGER (0/1 flag)</p>
                <p>start_time, end_time, server_request_id</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">terminal_sessions table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>id TEXT PRIMARY KEY, job_id FK (optional)</p>
                <p>session_id TEXT UNIQUE</p>
                <p>status: idle, starting, initializing, running, completed, failed, agent_requires_attention, recovering, disconnected, stuck, restored</p>
                <p>process_pid, exit_code</p>
                <p>working_directory, environment_vars JSON</p>
                <p>output_log TEXT (accumulated PTY output)</p>
                <p>last_output_at, started_at, ended_at</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">migrations table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>id INTEGER PRIMARY KEY AUTOINCREMENT</p>
                <p>name TEXT NOT NULL</p>
                <p>applied_at INTEGER (Unix timestamp)</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">db_diagnostic_logs table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>id INTEGER PRIMARY KEY AUTOINCREMENT</p>
                <p>timestamp INTEGER, error_type TEXT</p>
                <p>error_message TEXT, additional_info TEXT</p>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">app_settings table</h4>
              <div className="p-3 bg-muted/50 rounded-lg font-mono text-xs text-muted-foreground">
                <p>key TEXT PRIMARY KEY</p>
                <p>value TEXT NOT NULL, description TEXT</p>
                <p>created_at, updated_at (Unix timestamps)</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.relationships.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.relationships.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['dataModel.relationships.links'] as string[]).map((link, index) => (
              <li key={index}>{link}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.repositories.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.repositories.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['dataModel.repositories.examples'] as string[]).map((example, index) => (
              <li key={index}>{example}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.rehydration.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.rehydration.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['dataModel.rehydration.sessions']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['dataModel.retention.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.retention.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['dataModel.retention.exports']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Key source files</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 font-mono text-sm text-muted-foreground ml-6 list-disc">
            <li>desktop/src-tauri/migrations/consolidated_schema.sql - Full schema</li>
            <li>desktop/src-tauri/src/db_utils/mod.rs - Repository exports</li>
            <li>desktop/src-tauri/src/db_utils/background_job_repository/ - Job CRUD (directory with base.rs, worker.rs, metadata.rs, cleanup.rs)</li>
            <li>desktop/src-tauri/src/db_utils/session_repository.rs - Session management</li>
            <li>desktop/src-tauri/src/db_utils/terminal_repository.rs - Terminal persistence</li>
            <li>desktop/src-tauri/src/db_utils/settings_repository.rs - App settings</li>
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['dataModel.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['dataModel.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/background-jobs">{t['dataModel.cta.links.jobs']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/terminal-sessions">{t['dataModel.cta.links.terminals']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
