import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Voice transcription - PlanToCode',
  description: 'How PlanToCode records audio, streams real-time transcripts using gpt-4o-transcribe, manages permissions, project settings.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/voice-transcription',
    languages: {
      'en-US': 'https://www.plantocode.com/docs/voice-transcription',
      'en': 'https://www.plantocode.com/docs/voice-transcription',
    },
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Voice transcription - PlanToCode',
    description: 'Learn how the recording hook manages devices, permissions, and streaming text.',
    url: 'https://www.plantocode.com/docs/voice-transcription',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

export default function VoiceTranscriptionDocPage() {
  return (
    <DocsArticle
      title="Voice Transcription"
      description="Recording lifecycle, device management, and streaming behaviour for voice-driven prompts."
      date="2025-09-22"
      readTime="5 min"
      category="Product Guide"
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        Voice transcription is available anywhere the desktop app exposes dictation controls, including the plan terminal and
        prompt editors. The feature records audio locally, sends chunks to the transcription service, and inserts recognised
        text into the active input field without blocking manual typing.
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Recording workflow</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            The recording hook keeps a state machine with idle, recording, processing, and error states. It tracks duration,
            manages silence detection, and ensures recordings stop automatically after ten minutes. Chunks are buffered and
            forwarded to the transcription action, which returns recognised text for insertion.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Project-aware settings</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            When a recording session starts, the hook looks up the active project's transcription configuration. Language codes,
            preferred models, and other settings are retrieved before capturing audio so recordings follow the project's
            preferences.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Device management</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            The feature requests microphone permission, enumerates available audio inputs, and lets users switch devices during
            a session. Audio levels are monitored live so the UI can surface silence warnings if the microphone is muted or
            disconnected.
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
