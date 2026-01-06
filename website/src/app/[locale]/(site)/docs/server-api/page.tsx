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
    slug: '/docs/server-api',
    title: t['serverApi.meta.title'],
    description: t['serverApi.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ServerApiDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['serverApi.title']}
      description={t['serverApi.description']}
      date={t['serverApi.date']}
      readTime={t['serverApi.readTime']}
      category={t['serverApi.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['serverApi.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['serverApi.visuals.flow.title']}
        description={t['serverApi.visuals.flow.description']}
        imageSrc={t['serverApi.visuals.flow.imageSrc']}
        imageAlt={t['serverApi.visuals.flow.imageAlt']}
        caption={t['serverApi.visuals.flow.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.auth.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.auth.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Auth endpoints:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/auth/auth0/initiate-login - Start Auth0 PKCE flow</li>
              <li>/auth0/poll-status - Poll for login completion</li>
              <li>/auth0/finalize-login - Exchange code for tokens</li>
              <li>/api/auth/userinfo - Get authenticated user info</li>
              <li>/api/auth/logout - Invalidate session</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.llmProxy.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.llmProxy.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">LLM proxy routes:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/api/llm/chat/completions - Text completions (streaming)</li>
              <li>/api/llm/video/analyze - Multimodal video analysis</li>
              <li>/api/audio/transcriptions - Voice transcription</li>
            </ul>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Supported providers:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>OpenAI (GPT-4, GPT-4o, Whisper)</li>
              <li>Anthropic (Claude 3.5/4)</li>
              <li>Google (Gemini 2.0/2.5)</li>
              <li>X.AI (Grok)</li>
              <li>OpenRouter (aggregated providers)</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.config.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.config.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Configuration endpoints:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/api/config/runtime - Runtime AI configuration</li>
              <li>/api/providers - Provider list and status</li>
              <li>/api/models - Model metadata and context windows</li>
              <li>/api/system-prompts - System prompt templates</li>
              <li>/config/regions - Available server regions</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.devices.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.devices.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Device endpoints:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/api/devices - Device registration and listing</li>
              <li>/api/devices/heartbeat - Device health checks</li>
              <li>/api/devices/push-token - Push notification registration</li>
              <li>/api/notifications - Notification delivery</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.websockets.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.websockets.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">WebSocket routes:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>/ws/device-link - Desktop/mobile relay channel</li>
              <li>/ws/events - Real-time event streaming</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['serverApi.storage.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['serverApi.storage.description']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Server-side storage:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>PostgreSQL - Users, billing, audit logs, settings</li>
              <li>Redis - Rate limiting, pending charges, sessions</li>
              <li>RLS policies - Row-level security per user</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Key source files</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 font-mono text-sm text-muted-foreground ml-6 list-disc">
            <li>server/src/main.rs - Application entry and route configuration</li>
            <li>server/src/routes.rs - Route definitions</li>
            <li>server/src/handlers/proxy/ - LLM proxy handlers</li>
            <li>server/src/handlers/auth/ - Authentication handlers</li>
            <li>server/src/clients/ - Provider client implementations</li>
            <li>server/src/streaming/ - SSE streaming adapters</li>
            <li>server/src/middleware/ - Auth and rate limiting</li>
            <li>server/src/services/ - Business logic services</li>
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Continue learning</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Understand how the server integrates with the desktop app and manages LLM provider routing.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/provider-routing">Provider routing</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/model-configuration">Model configuration</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <Link href="/docs/server-setup">Server setup</Link>
            <Link href="/docs/mobile-ios">iOS client</Link>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
