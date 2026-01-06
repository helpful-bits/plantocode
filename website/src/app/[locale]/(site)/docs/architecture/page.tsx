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
    slug: '/docs/architecture',
    title: t['architecture.meta.title'],
    description: t['architecture.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function PlanToCodeArchitecturePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['architecture.title']}
      description={t['architecture.description']}
      date={t['architecture.date']}
      readTime={t['architecture.readTime']}
      category={t['architecture.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['architecture.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['architecture.visuals.systemMap.title']}
        description={t['architecture.visuals.systemMap.description']}
        imageSrc={t['architecture.visuals.systemMap.imageSrc']}
        imageAlt={t['architecture.visuals.systemMap.imageAlt']}
        caption={t['architecture.visuals.systemMap.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.frontend.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.frontend.ui']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.frontend.providers']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Key React components:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>ImplementationPlansProvider - Plan state and modal management</li>
              <li>PlanViewer (Monaco) - Virtualized plan rendering</li>
              <li>TerminalSurface - PTY output streaming</li>
              <li>TaskDescriptionEditor - Task input with voice integration</li>
              <li>WorkflowTracker - Job progress visualization</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.tauriCommands.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.tauriCommands.commands']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.tauriCommands.terminal']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Command categories (35+ modules):</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>workflow_commands, job_commands - Orchestration</li>
              <li>session_commands, terminal_commands - State management</li>
              <li>implementation_plan_commands - Plan generation</li>
              <li>audio_commands, video_analysis_commands - Media processing</li>
              <li>device_commands, auth0_commands - Connectivity</li>
              <li>config_commands, settings_commands - Configuration</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section id="ipc-bridge" className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.ipcBridge.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.ipcBridge.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.ipcBridge.details']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">IPC event types:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>job:status-changed, job:stream-progress - Job updates</li>
              <li>workflow-status, workflow-stage - Workflow progress</li>
              <li>terminal:output, terminal:status - PTY streaming</li>
              <li>session:updated - Session state changes</li>
              <li>orchestrator:initialized - System ready</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section id="workflow-orchestrator" className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.workflowOrchestrator.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.workflowOrchestrator.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.workflowOrchestrator.details']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Workflow definitions:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>file_finder_workflow.json - 4-stage file discovery</li>
              <li>web_search_workflow.json - 2-stage research</li>
              <li>Embedded via embedded_workflows.rs</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.persistence.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.persistence.database']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.persistence.modelConfig']}
          </p>
        </GlassCard>
      </section>

      <section id="state-synchronization" className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.stateSync.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.stateSync.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.stateSync.details']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.voicePipeline.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.voicePipeline.description']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.server.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.server.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Server components:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>Actix-Web framework with PostgreSQL + Redis</li>
              <li>JWT + API Key authentication with RLS</li>
              <li>LLM proxy: OpenAI, Anthropic, Google, X.AI, OpenRouter</li>
              <li>WebSocket relay for desktop/mobile device linking</li>
              <li>Stripe billing with credit-based usage tracking</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.dataFlows.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.dataFlows.description']}
          </p>
        </GlassCard>
      </section>

      <section id="llm-routing" className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['architecture.llmRouting.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['architecture.llmRouting.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['architecture.llmRouting.details']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Key source directories</h2>
        <GlassCard className="p-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">Desktop (Tauri + React)</h4>
              <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                <li>desktop/src - React UI</li>
                <li>desktop/src-tauri/src/commands - IPC commands</li>
                <li>desktop/src-tauri/src/jobs - Job processors</li>
                <li>desktop/src-tauri/src/db_utils - Repositories</li>
                <li>desktop/src-tauri/migrations - SQLite schema</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2 text-foreground">Server (Actix-Web)</h4>
              <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                <li>server/src/handlers - Request handlers</li>
                <li>server/src/clients - Provider clients</li>
                <li>server/src/services - Business logic</li>
                <li>server/src/db - PostgreSQL access</li>
                <li>server/src/streaming - SSE adapters</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Explore specific subsystems</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Dive into the desktop internals, server API, or background jobs to understand each layer in detail.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/desktop-app">Desktop internals</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/server-api">Server API</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <Link href="/docs/background-jobs">Background jobs</Link>
            <Link href="/docs/data-model">Data model</Link>
            <Link href="/docs/provider-routing">Provider routing</Link>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
