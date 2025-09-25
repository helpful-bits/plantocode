import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Mic, Settings, Terminal, AudioWaveform, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Voice transcription workspace - Vibe Manager',
  description: 'Dictate task descriptions or terminal commands with the built-in transcription pipeline. Configure language defaults per project and send transcripts straight to the Monaco editor or integrated terminal.',
  keywords: [
    'voice transcription',
    'ai coding voice input',
    'terminal voice dictation',
    'transcription settings',
    'monaco editor voice',
  ],
  openGraph: {
    title: 'Voice transcription workspace',
    description: 'Capture ideas hands-free with Vibe Manager. Dictate tasks, configure transcription models, and send the output directly to plans or the integrated terminal.',
    url: 'https://www.vibemanager.app/features/voice-transcription',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/voice-transcription',
  },
};

export default function VoiceTranscriptionFeaturePage() {
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
                  <Mic className="w-4 h-4" />
                  <span>Hands-free input for planning and execution</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Voice transcription that stays in sync with your plans
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Record audio snippets while you plan, capture terminal commands, and configure transcription defaults per project. Everything routes through the same Monaco editor and terminal sessions used elsewhere in the app.
                </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <AudioWaveform className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Capture task intent in context</h2>
                      <p className="text-foreground/80 mb-4">
                        Start recording from the task description panel. Audio is streamed through the <code>useVoiceTranscription</code> hook and saved straight into the Monaco editor so you can refine the text before generating plans. Highlight the transcript and use the text improvement popover if you need to tighten wording before moving on.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Real-time feedback while recording</li>
                        <li>Automatic retries with helpful error messages</li>
                        <li>Language, temperature, and model defaults stored per project</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Terminal className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Dictate terminal commands safely</h2>
                      <p className="text-foreground/80 mb-4">
                        The plan terminal modal exposes the same transcription controls. Dictated text is appended to your active PTY session using backpressure-aware writes so long commands land exactly once.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Start and stop recording without leaving the terminal</li>
                        <li>Chunked writes prevent partial commands</li>
                        <li>Compatibility with claude, cursor, codex, and gemini sessions</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Settings className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Fine-grained configuration</h2>
                      <p className="text-foreground/80 mb-4">
                        Adjust the transcription model, temperature, and language for each project. Settings are persisted via the project task settings API so team members share the same defaults.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Use OpenAI GPT-4o Transcribe or GPT-4o Mini Transcribe</li>
                        <li>Apply separate defaults for task descriptions and terminal usage</li>
                        <li>Project-level overrides layered on top of server defaults</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-8">
                  <div className="flex items-start gap-4">
                    <Shield className="w-8 h-8 text-primary flex-shrink-0" />
                    <div>
                      <h2 className="text-xl font-bold mb-3">Robust error handling</h2>
                      <p className="text-foreground/80 mb-4">
                        The transcription client surfaces clear messages for authentication, network, and provider errors. Logs are persisted so you can review what was sent before retrying.
                      </p>
                      <ul className="space-y-2 text-foreground/70 text-sm">
                        <li>Friendly guidance for microphone or auth issues</li>
                        <li>Structured error messages mapped from server responses</li>
                        <li>Local audit trail alongside plan drafts and terminal logs</li>
                      </ul>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div className="mt-16">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Unlock Hands-Free Development</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From voice to code, seamlessly capture ideas and execute commands.
                    This is how voice input should work - natural, integrated, powerful.
                  </p>
                  <PlatformDownloadSection location="voice_transcription_feature" redirectToDownloadPage />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/integrated-terminal">
                      See terminal integration
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/text-improvement">
                      Explore text enhancement
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
