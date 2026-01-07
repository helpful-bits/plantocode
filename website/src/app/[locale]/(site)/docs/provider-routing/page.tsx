import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/provider-routing',
    title: t['providerRouting.meta.title'] || 'Provider Routing and Streaming - PlanToCode',
    description: t['providerRouting.meta.description'] || 'How PlanToCode routes LLM requests through a proxy, normalizes responses, and streams tokens to the desktop client.',
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ProviderRoutingDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  // Supported providers - all routed through single endpoint based on model ID
  const providers = [
    { name: 'OpenAI', routing: 'Direct', models: 'GPT-5.2, GPT-5.2-Pro, GPT-5-mini, o3, GPT-4o-transcribe' },
    { name: 'Anthropic', routing: 'Direct (non-streaming), OpenRouter (streaming)', models: 'Claude Opus 4.5, Claude Sonnet 4.5' },
    { name: 'Google', routing: 'Direct', models: 'Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro' },
    { name: 'X.AI', routing: 'Direct', models: 'Grok-4' },
    { name: 'DeepSeek', routing: 'Via OpenRouter', models: 'DeepSeek-R1' },
    { name: 'OpenRouter', routing: 'Direct', models: 'Fallback aggregator for all providers' },
  ];

  // Usage tracking fields
  const usageFields = [
    { field: 'tokens_input', description: 'Prompt tokens consumed by the request' },
    { field: 'tokens_output', description: 'Completion tokens generated in response' },
    { field: 'cache_read_tokens', description: 'Tokens served from provider cache (Anthropic)' },
    { field: 'cache_write_tokens', description: 'Tokens written to provider cache' },
    { field: 'cost', description: 'Computed cost based on model pricing' },
    { field: 'service_name', description: 'Model identifier used for the request (e.g., anthropic/claude-opus-4-5)' },
    { field: 'request_id', description: 'Server-generated UUID for request tracking' },
  ];

  return (
    <DocsArticle
      title={t['providerRouting.title'] || 'Provider Routing and Streaming'}
      description={t['providerRouting.description'] || 'Routing layer that mediates all external LLM requests with normalization, streaming, and usage tracking.'}
      date={t['providerRouting.date'] || '2025-09-24'}
      readTime={t['providerRouting.readTime'] || '10 min'}
      category={t['providerRouting.category'] || 'Research & Models'}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Planning, analysis, and transcription jobs call external providers through <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/llm</code> and{' '}
        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/audio</code> endpoints. The routing service normalizes requests
        via <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">provider_transformers</code>, streams responses through{' '}
        <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">ModernStreamHandler</code>, and records usage metadata per job.
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['providerRouting.visuals.routingMap.title'] || 'Provider routing map'}
        description={t['providerRouting.visuals.routingMap.description'] || 'Diagram of how requests flow from the desktop app to the proxy and out to providers.'}
        imageSrc={t['providerRouting.visuals.routingMap.imageSrc'] || '/images/docs/provider-routing/routing-map.svg'}
        imageAlt={t['providerRouting.visuals.routingMap.imageAlt'] || 'Diagram of provider routing flow from desktop to external providers'}
        caption={t['providerRouting.visuals.routingMap.caption']}
      />

      {/* Why a Routing Layer Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Why a Routing Layer Exists</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Direct calls from the desktop client would embed provider credentials and require different payloads per provider.
            The routing layer keeps keys on the server, exposes a single request format, and maintains consistent streaming behavior.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Security Benefits</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• API keys never leave the server</li>
                <li>• Per-user rate limiting and quotas</li>
                <li>• Request validation before provider calls</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Operational Benefits</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Single request format for all providers</li>
                <li>• Centralized usage tracking and billing</li>
                <li>• Fallback to OpenRouter on failure</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Supported Providers Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Supported Providers</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            All requests go through a single endpoint: <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">/api/llm/chat/completions</code>.
            The router determines the appropriate provider based on the model ID in the request payload.
            Each provider has dedicated handlers in <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">server/src/handlers/proxy/</code>.
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold">Provider</th>
                  <th className="text-left py-3 px-4 font-semibold">Routing</th>
                  <th className="text-left py-3 px-4 font-semibold">Models</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.name} className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">{provider.name}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">{provider.routing}</span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{provider.models}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </section>

      {/* Request Normalization Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Request Normalization via provider_transformers</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Job processors submit a normalized payload with task ID, job ID, prompt content, and model selection. The
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">provider_transformers</code> module maps that payload
            into provider-specific request shapes.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Normalized request from desktop
{
  "model": "anthropic/claude-opus-4-5-20251101",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 16384,
  "temperature": 0.7,
  "stream": true,
  "metadata": {
    "job_id": "uuid-...",
    "session_id": "uuid-...",
    "task_type": "implementation_plan"
  }
}

// Transformed for Anthropic
{
  "model": "claude-opus-4-5-20251101",
  "system": "...",
  "messages": [{ "role": "user", "content": "..." }],
  "max_tokens": 16384,
  "stream": true
}`}</code></pre>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Transformation Features</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• System message extraction for Anthropic API format</li>
              <li>• Vision payload validation for image models</li>
              <li>• Token limit enforcement based on model context window</li>
              <li>• Provider-specific parameter mapping (top_p, presence_penalty, etc.)</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Streaming via ModernStreamHandler Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Streaming via ModernStreamHandler</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Responses are streamed back to the desktop client through <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">ModernStreamHandler</code>,
            enabling real-time UI updates and progressive plan rendering.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// ModernStreamHandler processing loop
async fn handle_stream(
    response: Response,
    job_id: &str,
) -> Result<StreamResult> {
    let mut stream = response.bytes_stream();
    let mut accumulated = String::new();

    while let Some(chunk) = stream.next().await {
        let text = parse_sse_chunk(&chunk?)?;
        accumulated.push_str(&text);

        // Emit event to desktop client
        emit_stream_event(job_id, StreamEvent::Chunk {
            content: text,
            accumulated_tokens: count_tokens(&accumulated),
        });
    }

    // Final usage from provider response
    let usage = extract_final_usage(&accumulated)?;
    Ok(StreamResult { content: accumulated, usage })
}`}</code></pre>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Chunk Events</h4>
              <p className="text-sm text-muted-foreground">Token/chunk events forwarded to job listeners for live UI updates</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Partial Artifacts</h4>
              <p className="text-sm text-muted-foreground">Partial summaries written to job artifacts during streaming</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Completion Events</h4>
              <p className="text-sm text-muted-foreground">Final events close the job state with usage metadata</p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Fallback to OpenRouter Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Fallback to OpenRouter on Failure</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            When a primary provider fails (rate limit, outage, or error), the routing layer can automatically retry through OpenRouter
            as a fallback aggregator. This provides resilience without requiring user intervention.
          </p>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Fallback Behavior</h4>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <li>• Primary provider failure triggers OpenRouter retry</li>
              <li>• Model mapping ensures equivalent capabilities</li>
              <li>• Usage tracked separately for cost attribution</li>
              <li>• User notified of fallback in job metadata</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Token Counting and Cost Calculation Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Token Counting and Cost Calculation</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every request records usage metadata so teams can audit cost and performance. Token counts come from provider responses
            when available, with fallback to tiktoken-based estimation.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Usage record stored per request
{
  "tokens_input": 4521,
  "tokens_output": 2847,
  "cache_read_tokens": 1200,   // Anthropic prompt caching
  "cache_write_tokens": 0,
  "cost": 0.0234,              // USD based on model pricing
  "service_name": "anthropic/claude-opus-4-5-20251101",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"  // Server-generated UUID
}`}</code></pre>
          </div>
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-3">Tracked Usage Fields</h4>
            <div className="grid gap-2">
              {usageFields.map((item) => (
                <div key={item.field} className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                  <code className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono font-semibold">
                    {item.field}
                  </code>
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Vision Validation Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Vision Validation for Image Models</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            Requests containing images are validated before routing to ensure the selected model supports vision capabilities.
            Invalid requests fail fast with clear error messages.
          </p>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Validation Checks</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Model supports vision (checked against config)</li>
                <li>• Image format is supported (JPEG, PNG, WebP, GIF)</li>
                <li>• Image size within provider limits</li>
                <li>• Base64 encoding is valid</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Vision-Capable Models</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• GPT-5.2, GPT-5-mini</li>
                <li>• Claude Opus 4.5, Claude Sonnet 4.5</li>
                <li>• Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro</li>
                <li>• Grok-4</li>
              </ul>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Error Handling Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Failure Handling</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            If a provider fails or no provider is configured, the job is marked failed and the error payload is stored.
            Users can retry or run the job with another model instead of relying on silent fallbacks.
          </p>
          <div className="space-y-3 mt-4">
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Rate Limit Errors</h4>
              <p className="text-sm text-red-700 dark:text-red-300">Retry-After header respected, user notified of wait time</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Authentication Errors</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">API key validation failed, check provider configuration</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">Context Length Errors</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">Prompt exceeds model limit, suggest smaller context or different model</p>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Security Boundaries Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Security Boundaries</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            API keys stay in the server configuration. The desktop client only receives allowed model lists and never embeds provider credentials.
          </p>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-foreground mb-2">Security Measures</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>• <strong>Key Storage:</strong> Provider keys stored in encrypted vault, never sent to clients</li>
              <li>• <strong>Request Signing:</strong> All proxy requests include server-signed JWT for authentication</li>
              <li>• <strong>Content Filtering:</strong> Optional content moderation before sending to providers</li>
              <li>• <strong>Audit Logging:</strong> All requests logged with user context for compliance</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      {/* Build Your Own Section */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Building a Similar Proxy (Conceptual)</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            If you are building a similar architecture, the key components to implement are:
          </p>
          <div className="bg-muted/30 rounded-lg p-4 mt-4">
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><strong>Model-based routing:</strong> Look up the model ID to determine which provider to use, then route internally</li>
              <li><strong>Request transformation:</strong> Convert normalized requests to provider-specific formats (e.g., extract system messages for Anthropic)</li>
              <li><strong>Streaming handlers:</strong> Process SSE chunks from providers and forward to clients with consistent event format</li>
              <li><strong>Usage tracking:</strong> Record input/output tokens, cache usage, and costs per request with server-generated request IDs</li>
              <li><strong>Fallback routing:</strong> Route certain providers through aggregators (e.g., Anthropic streaming via OpenRouter)</li>
            </ul>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Implementation Note</h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              The actual implementation uses Actix-web handlers with provider-specific modules in <code className="px-1 py-0.5 rounded bg-amber-200/50 dark:bg-amber-800 text-xs">server/src/handlers/proxy/providers/</code>.
              See <code className="px-1 py-0.5 rounded bg-amber-200/50 dark:bg-amber-800 text-xs">router.rs</code> for the main routing logic.
            </p>
          </div>
        </GlassCard>
      </section>

      {/* CTA Section */}
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['providerRouting.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['providerRouting.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 text-sm">
            <Link href="/docs/model-configuration" className="text-primary hover:underline font-medium">
              {t['providerRouting.cta.links.modelConfiguration']} →
            </Link>
            <Link href="/docs/runtime-walkthrough" className="text-primary hover:underline font-medium">
              {t['providerRouting.cta.links.runtimeWalkthrough']} →
            </Link>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
