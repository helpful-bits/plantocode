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

  // Supported providers
  const providers = [
    { name: 'OpenAI', endpoint: '/api/llm/openai', models: 'GPT-4o, GPT-4o-mini, o1, o1-mini, o3-mini' },
    { name: 'Anthropic', endpoint: '/api/llm/anthropic', models: 'Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku' },
    { name: 'Google', endpoint: '/api/llm/google', models: 'Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash' },
    { name: 'X.AI', endpoint: '/api/llm/xai', models: 'Grok-2, Grok-2-vision' },
    { name: 'DeepSeek', endpoint: '/api/llm/deepseek', models: 'DeepSeek-V3, DeepSeek-R1' },
    { name: 'OpenRouter', endpoint: '/api/llm/openrouter', models: 'Fallback aggregator for all providers' },
  ];

  // Usage tracking fields
  const usageFields = [
    { field: 'tokens_sent', description: 'Prompt tokens consumed by the request' },
    { field: 'tokens_received', description: 'Completion tokens generated in response' },
    { field: 'cache_read', description: 'Tokens served from provider cache (Anthropic)' },
    { field: 'cache_write', description: 'Tokens written to provider cache' },
    { field: 'actual_cost', description: 'Computed cost based on model pricing' },
    { field: 'model_id', description: 'Exact model identifier used for the request' },
    { field: 'provider', description: 'Provider that handled the request' },
    { field: 'request_id', description: 'Provider-assigned request ID for debugging' },
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
        imageSrc={t['providerRouting.visuals.routingMap.imageSrc'] || '/images/docs/provider-routing/routing-map.png'}
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
            The routing layer supports multiple LLM providers with automatic request transformation and response normalization.
            Each provider has dedicated handlers in <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">server/src/handlers/proxy/</code>.
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold">Provider</th>
                  <th className="text-left py-3 px-4 font-semibold">Endpoint</th>
                  <th className="text-left py-3 px-4 font-semibold">Models</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.name} className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">{provider.name}</td>
                    <td className="py-3 px-4">
                      <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">{provider.endpoint}</code>
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
  "model": "claude-3-5-sonnet-latest",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 8192,
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
  "model": "claude-3-5-sonnet-latest",
  "system": "...",
  "messages": [{ "role": "user", "content": "..." }],
  "max_tokens": 8192,
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
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 mt-4">
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
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Usage record stored per job
{
  "tokens_sent": 4521,
  "tokens_received": 2847,
  "cache_read": 1200,      // Anthropic prompt caching
  "cache_write": 0,
  "actual_cost": 0.0234,   // USD based on model pricing
  "model_id": "claude-3-5-sonnet-latest",
  "provider": "anthropic",
  "request_id": "req_abc123..."
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
                <li>• GPT-4o, GPT-4o-mini</li>
                <li>• Claude 3.5 Sonnet, Claude 3 Opus</li>
                <li>• Gemini 2.0 Flash, Gemini 1.5 Pro</li>
                <li>• Grok-2-vision</li>
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
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Rate Limit Errors</h4>
              <p className="text-sm text-red-700 dark:text-red-300">Retry-After header respected, user notified of wait time</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">Authentication Errors</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">API key validation failed, check provider configuration</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4">
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
        <h2 className="text-2xl font-bold">Build a Similar Proxy</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            If you are replicating the architecture, start with a proxy that normalizes payloads, streams responses, and logs usage
            metadata with job identifiers. Keep provider keys off the client, and require explicit user approval before sending file content.
          </p>
          <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
            <pre className="text-slate-100 text-sm overflow-x-auto"><code>{`// Minimal proxy handler structure
pub struct LLMProxy {
    providers: HashMap<String, Box<dyn ProviderClient>>,
    transformer: RequestTransformer,
    stream_handler: ModernStreamHandler,
    usage_tracker: UsageTracker,
}

impl LLMProxy {
    pub async fn handle_request(
        &self,
        req: NormalizedRequest,
    ) -> Result<StreamResponse> {
        // 1. Transform to provider format
        let provider_req = self.transformer.transform(&req)?;

        // 2. Route to appropriate provider
        let provider = self.providers.get(&req.provider)?;
        let response = provider.send(provider_req).await?;

        // 3. Stream response back to client
        let result = self.stream_handler.process(response).await?;

        // 4. Track usage for billing
        self.usage_tracker.record(&req.job_id, &result.usage);

        Ok(result)
    }
}`}</code></pre>
          </div>
        </GlassCard>
      </section>

      {/* CTA Section */}
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">Continue into model configuration</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Model configuration explains how allowed lists and token guardrails are exposed to the UI.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/model-configuration">Model configuration</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/runtime-walkthrough">Runtime walkthrough</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
