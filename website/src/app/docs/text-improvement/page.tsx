import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Text improvement - PlanToCode',
  description:
    'How the desktop workspace rewrites highlighted text, preserves formatting, and links the feature to voice and video inputs.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/text-improvement',
    languages: {
      'en-US': 'https://www.plantocode.com/docs/text-improvement',
      'en': 'https://www.plantocode.com/docs/text-improvement',
    },
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Text improvement - PlanToCode',
    description:
      'Understand the selection popover, job queue, model configuration, and integrations that power text improvement.',
    url: 'https://www.plantocode.com/docs/text-improvement',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Text improvement - PlanToCode',
  description:
    'Documentation for the selection-driven text improvement workflow, including model selection, Monaco integration, and voice/video inputs.',
};

export default function TextImprovementDocPage() {
  return (
    <>
      <StructuredData data={structuredData} />

      <DocsArticle
        title="Text Improvement"
        description="How PlanToCode rewrites highlighted text without changing formatting and links the result back to your workspace."
        date="2025-09-21"
        readTime="7 min"
        category="Product Guide"
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          Refine text with AI context. Select text in any editor, trigger a background job, and get improved content that keeps your formatting intact.
        </p>

        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">Selection popover behaviour</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProvider</code> listens for
            selection events on standard inputs and Monaco editors. When you highlight non-empty text it positions a popover near
            the cursor, stores the selected range, and tracks whether the popover should be visible. Clicking the button kicks off
            the job and disables the control until the result returns. When the job completes the provider applies the improved
            text back into the same selection and flushes any pending saves to keep session state in sync.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The popover itself is a minimal component rendered by <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPopover</code>,
            which simply triggers the provider hook and shows a loading indicator while a rewrite is running. Because the provider
            registers global listeners, the popover appears in Monaco plan viewers, the plan terminal dictation field, and any task
            description inputs without extra wiring.
          </p>
        </GlassCard>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">What happens when you trigger an improvement</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Pressing the popover button calls <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">createImproveTextJobAction</code>.
              The action validates the selection, ensures a session identifier exists, and invokes the Rust command
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">improve_text_command</code> via Tauri. The command builds a
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPayload</code> containing the original text and queues
              a background job against the active session.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              On the backend, the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProcessor</code> resolves the
              configured model for the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">text_improvement</code> task, wraps the selection
              in XML tags, and runs the request through the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">LlmTaskRunner</code> without
              streaming. When the model response returns it records token usage, cost, and the system prompt template before
              emitting the improved text back to the UI. The default configuration ships with Claude Sonnet 4 and Gemini 2.5 Flash
              as the approved models, capped at 4,096 tokens with a temperature of 0.7.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The background jobs sidebar records the original text in job metadata, so you can review what was sent alongside the
              rewritten copy. If the selection changes while a job is running, the provider skips replacing the text to avoid
              clobbering manual edits.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Voice transcription integration</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Voice recordings use the <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useVoiceTranscription</code> hook. It loads
              per-project transcription defaults, requests microphone access, and inserts transcripts at the cursor inside the task
              description or terminal dictation buffer. The inserted text can immediately be highlighted and passed through the
              same improvement popover, and the original transcription job identifier is stored with the improvement payload for
              auditing.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Language, model, and temperature preferences persist at the project level, so teams get consistent transcription
              quality before refining the copy. Silence detection warns about bad audio levels, and a ten-minute cap prevents
              oversized recordings from blocking improvement jobs with large payloads.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Video capture and prompt scaffolding</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              Screen recordings pass through the video analysis dialog, which combines your current task description with an
              optional prompt block wrapped in semantic XML tags before sending the request to the Gemini video analysis job. Any
              notes you dictate during the recording are available as text once analysis completes, so you can feed the resulting
              summary back through the improvement popover to tighten the instructions before planning.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Video jobs include frame-rate controls, audio capture toggles, and cost reporting. Results appear in the same
              background jobs sidebar as text improvements, keeping all prompt preparation artefacts in one place.
            </p>
          </GlassCard>
        </section>

        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">Try text improvement in the desktop app</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Download PlanToCode to combine voice capture, video context, and inline rewriting before you generate
              implementation plans.
            </p>
            <PlatformDownloadSection location="docs_text_improvement" />
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
