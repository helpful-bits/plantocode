import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Sparkles, Workflow, FileText, Mic, Video, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Text improvement workspace - Vibe Manager',
  description:
    'Highlight text anywhere in the desktop app to rewrite it with the configured text-improvement models. Works with Monaco editors, task inputs, voice dictation, and video recordings.',
  keywords: [
    'text improvement',
    'prompt rewriting',
    'claude text refinement',
    'monaco editor improvements',
    'voice prompt cleanup',
  ],
  openGraph: {
    title: 'Text improvement workspace',
    description:
      'Inline text rewriting that honours formatting, respects per-project model settings, and plays nicely with voice and video capture.',
    url: 'https://www.vibemanager.app/features/text-improvement',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/text-improvement',
  },
};

export default function TextImprovementFeaturePage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Sparkles className="w-4 h-4" />
                  <span>Selection-based prompt rewriting</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Text improvement that stays grounded in your workspace
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Highlight any copy in Vibe Manager to clean it up with the configured text-improvement models. The rewrite
                  preserves formatting, records token usage, and drops straight back into the Monaco editors, task descriptions,
                  or terminal dictation buffers you were already using.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Workflow className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Popover-driven workflow</h2>
                      <p className="text-foreground/80 mb-4">
                        The text improvement provider listens for selections in Monaco editors and standard inputs. When text is
                        highlighted it opens a floating Sparkles button beside the cursor, queues a background job with the
                        selected range, and swaps in the improved content once the job completes.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Works in the plan viewer, merge instructions, and plan terminal input</li>
                        <li>Skips replacement if you edit the selection while a job is running</li>
                        <li>Background jobs sidebar shows the original and improved snippets</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Model configuration you control</h2>
                      <p className="text-foreground/80 mb-4">
                        Improvement jobs call the text-improvement task type defined in the AI settings. By default the workspace
                        uses Claude Sonnet 4 with Gemini 2.5 Flash as the fallback, a 4,096 token ceiling, and a temperature of
                        0.7, but you can change the allowed models or overrides in configuration files.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>System prompt keeps the original language and formatting intact</li>
                        <li>Non-streaming LLM requests expose prompt and completion token totals</li>
                        <li>Project-aware settings come from the same resolver as other AI jobs</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Mic className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Voice dictation stays editable</h2>
                      <p className="text-foreground/80 mb-4">
                        Voice transcripts land directly in your task description or terminal buffer with project-specific language
                        defaults. You can highlight the dictated text immediately and run the same improvement button without
                        leaving the flow.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Project-level transcription settings include model, language, and temperature</li>
                        <li>Audio level monitoring warns about silence before you waste a take</li>
                        <li>Improvement payloads keep a reference to the source transcription job</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Video className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Video analysis feeds better prompts</h2>
                      <p className="text-foreground/80 mb-4">
                        Screen recordings bundle your current task description with optional attention prompts and pass them to the
                        Gemini video analysis pipeline. The resulting notes appear alongside text improvement jobs so you can
                        refine summaries before generating plans.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Frame-rate slider keeps uploads within the model’s token limits</li>
                        <li>Optional microphone capture adds transcripts to the analysis output</li>
                        <li>Cost estimates come back with every video run</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8 md:col-span-2">
                  <div className="flex items-start gap-4">
                    <ShieldCheck className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Guardrails built into the job system</h2>
                      <p className="text-foreground/80 mb-4">
                        Every improvement request runs through the same job queue and error handling that powers the rest of Vibe
                        Manager. If authentication, network, or provider issues crop up, the UI surfaces the failure and leaves the
                        original text untouched.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Automatic retries respect the configured max concurrency</li>
                        <li>Token usage and system prompt template are stored with the job</li>
                        <li>Improved text is only applied when the response is complete</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div className="mt-16">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Experience Contextual Text Enhancement</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From selection to perfection, workspace-aware improvements at your fingertips.
                    This is how text improvement should work - grounded, integrated, effortless.
                  </p>
                  <PlatformDownloadSection location="text_improvement_feature" redirectToDownloadPage />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/voice-transcription">
                      Explore voice dictation
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/plan-mode">
                      See prompt generation
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
