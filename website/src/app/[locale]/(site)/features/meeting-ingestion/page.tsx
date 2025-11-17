import { Metadata } from 'next';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { FAQ } from '@/components/landing/FAQ';
import { Video, CheckCircle, Users, Mic, Eye } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'home']);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/meeting-ingestion',
      title: t['meetings.meta.title'] || 'Meeting & Recording Ingestion - PlanToCode',
      description: t['meetings.meta.description'] || 'Transform Microsoft Teams meetings and screen recordings into actionable implementation requirements with multimodal AI analysis.',
    }),
    keywords: mergeKeywords(
      [
        'meeting analysis',
        'teams meeting capture',
        'multimodal analysis',
        'requirements extraction',
        'corporate meeting analysis',
        'visual content analysis',
        'speaker identification',
        'action items extraction',
        'meeting insights',
        'recording ingestion',
      ],
      COMMON_KEYWORDS.core
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function MeetingIngestionPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'home']);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          {/* Hero Section */}
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Video className="w-4 h-4" />
                  <span>{t['meetings.badge'] || 'Meeting Analysis'}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
                  {t['meetings.title'] || 'Meeting & Recording Ingestion'}
                </h1>
                <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto mb-8">
                  {t['meetings.subtitle'] || 'Transform Microsoft Teams meetings and screen recordings into actionable implementation requirements.'}
                </p>
              </div>
            </div>
          </section>

          {/* Main Features Grid */}
          <section className="py-12 px-4">
            <div className="container mx-auto max-w-6xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {/* Multimodal Analysis Card */}
                <GlassCard className="p-8">
                  <Video className="w-12 h-12 text-primary mb-4" />
                  <h2 className="text-2xl font-semibold mb-4">
                    {t['meetings.cards.multimodal.title'] || 'Multimodal Analysis'}
                  </h2>
                  <p className="text-foreground/80 mb-6 leading-relaxed">
                    {t['meetings.cards.multimodal.description'] || 'Upload Microsoft Teams meetings or screen recordings. Advanced multimodal models analyze both audio transcripts (with speaker identification) and relevant visual content (shared screens, presented documents, key moments) to extract specification requirements.'}
                  </p>
                  <LinkWithArrow href="/features/video-analysis">
                    {t['meetings.cards.multimodal.link'] || 'Learn more about video analysis'}
                  </LinkWithArrow>
                </GlassCard>

                {/* Review & Incorporate Insights Card */}
                <GlassCard className="p-8">
                  <CheckCircle className="w-12 h-12 text-primary mb-4" />
                  <h2 className="text-2xl font-semibold mb-4">
                    {t['meetings.cards.insights.title'] || 'Review & Incorporate Insights'}
                  </h2>
                  <p className="text-foreground/80 mb-6 leading-relaxed">
                    {t['meetings.cards.insights.description'] || 'Extracted insights - summarized decisions, action items, and key discussion points - are presented in an intuitive interface where team leads can review, select, and incorporate them into actionable implementation plans.'}
                  </p>
                  <LinkWithArrow href="/features/text-improvement">
                    {t['meetings.cards.insights.link'] || 'Learn more about text improvement'}
                  </LinkWithArrow>
                </GlassCard>
              </div>
            </div>
          </section>

          {/* Key Benefits */}
          <section className="py-12 px-4 bg-gradient-to-br from-background via-background to-accent/5">
            <div className="container mx-auto max-w-6xl">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t['meetings.benefits.title'] || 'Key Benefits'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <GlassCard className="p-6 text-center">
                  <Users className="w-10 h-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.benefits.collaboration.title'] || 'Team Collaboration'}
                  </h3>
                  <p className="text-sm text-foreground/70">
                    {t['meetings.benefits.collaboration.description'] || 'Capture decisions and action items from team meetings automatically'}
                  </p>
                </GlassCard>

                <GlassCard className="p-6 text-center">
                  <Mic className="w-10 h-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.benefits.transcription.title'] || 'Speaker Identification'}
                  </h3>
                  <p className="text-sm text-foreground/70">
                    {t['meetings.benefits.transcription.description'] || 'Know who said what with accurate speaker diarization'}
                  </p>
                </GlassCard>

                <GlassCard className="p-6 text-center">
                  <Eye className="w-10 h-10 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.benefits.visual.title'] || 'Visual Context'}
                  </h3>
                  <p className="text-sm text-foreground/70">
                    {t['meetings.benefits.visual.description'] || 'Analyze shared screens, documents, and key visual moments'}
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-4xl">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t['meetings.howItWorks.title'] || 'How It Works'}
              </h2>
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      1
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t['meetings.howItWorks.step1.title'] || 'Upload Meeting Recording'}
                    </h3>
                    <p className="text-foreground/70">
                      {t['meetings.howItWorks.step1.description'] || 'Upload your Microsoft Teams meeting recording or screen capture directly into PlanToCode.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      2
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t['meetings.howItWorks.step2.title'] || 'Multimodal AI Analysis'}
                    </h3>
                    <p className="text-foreground/70">
                      {t['meetings.howItWorks.step2.description'] || 'Advanced AI models process both audio (with speaker identification) and visual content to extract key insights.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      3
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      {t['meetings.howItWorks.step3.title'] || 'Review & Incorporate'}
                    </h3>
                    <p className="text-foreground/70">
                      {t['meetings.howItWorks.step3.description'] || 'Review extracted insights, decisions, and action items. Select what matters and incorporate into your implementation plans.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Related Features */}
          <section className="py-12 px-4 bg-gradient-to-br from-background via-background to-accent/5">
            <div className="container mx-auto max-w-6xl">
              <h2 className="text-3xl font-bold text-center mb-8">
                {t['meetings.relatedFeatures.title'] || 'Related Features'}
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.relatedFeatures.videoAnalysis.title'] || 'Video Analysis'}
                  </h3>
                  <p className="text-sm text-foreground/70 mb-4">
                    {t['meetings.relatedFeatures.videoAnalysis.description'] || 'Analyze screen recordings and capture technical details'}
                  </p>
                  <LinkWithArrow href="/features/video-analysis">
                    {t['meetings.relatedFeatures.learnMore'] || 'Learn more'}
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.relatedFeatures.voiceTranscription.title'] || 'Voice Transcription'}
                  </h3>
                  <p className="text-sm text-foreground/70 mb-4">
                    {t['meetings.relatedFeatures.voiceTranscription.description'] || 'Speak your requirements and have them transcribed'}
                  </p>
                  <LinkWithArrow href="/features/voice-transcription">
                    {t['meetings.relatedFeatures.learnMore'] || 'Learn more'}
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-2">
                    {t['meetings.relatedFeatures.textImprovement.title'] || 'Text Improvement'}
                  </h3>
                  <p className="text-sm text-foreground/70 mb-4">
                    {t['meetings.relatedFeatures.textImprovement.description'] || 'Refine and enhance task descriptions with AI'}
                  </p>
                  <LinkWithArrow href="/features/text-improvement">
                    {t['meetings.relatedFeatures.learnMore'] || 'Learn more'}
                  </LinkWithArrow>
                </GlassCard>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-4xl">
              <PlatformDownloadSection />
            </div>
          </section>

          {/* FAQ Section */}
          <section className="py-12 px-4">
            <div className="container mx-auto max-w-4xl">
              <FAQ />
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
