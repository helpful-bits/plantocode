import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { FAQ } from '@/components/landing/FAQ';
import { Video, Upload, Eye, Settings, Zap, Target, CheckCircle2, Clock, Sparkles, FileText, Users, Mic } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Meeting & recording analysis - multimodal AI extraction | PlanToCode',
  description: 'Capture Microsoft Teams meetings and screen recordings. Multimodal AI analyzes audio transcripts and visual content to extract actionable requirements. Used by corporate teams for requirements gathering.',
  keywords: [
    'meeting analysis',
    'teams meeting capture',
    'multimodal analysis',
    'requirements extraction',
    'corporate meeting analysis',
    'visual content analysis',
  ],
  openGraph: {
    title: 'AI Meeting & Recording Analysis: Requirements Extraction',
    description: 'Capture Microsoft Teams meetings and screen recordings. Multimodal AI analyzes audio transcripts and visual content to extract actionable requirements for corporate teams.',
    url: 'https://www.plantocode.com/features/video-analysis',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/video-analysis',
    languages: {
      'en-US': 'https://www.plantocode.com/features/video-analysis',
      'en': 'https://www.plantocode.com/features/video-analysis',
    },
  },
};

export default function VideoAnalysisPage() {
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Use AI Video Analysis for Bug Capture",
    "description": "Step-by-step guide to recording and analyzing screen videos with Gemini Vision AI",
    "step": [
      {
        "@type": "HowToStep",
        "name": "Record or Upload Video",
        "text": "Start screen recording directly in the app or upload an existing video file. Supported formats include MP4, WebM, MOV, and AVI.",
        "position": 1
      },
      {
        "@type": "HowToStep",
        "name": "Configure FPS Settings",
        "text": "Adjust frame extraction rate between 1-10 FPS based on your analysis needs. Higher FPS for detailed UI interactions, lower FPS for cost optimization.",
        "position": 2
      },
      {
        "@type": "HowToStep",
        "name": "AI Analysis with Gemini Vision",
        "text": "Gemini 2.5 Pro or Flash analyzes extracted frames to identify errors, UI states, patterns, and provides actionable suggestions.",
        "position": 3
      },
      {
        "@type": "HowToStep",
        "name": "Auto-Attach to Tasks",
        "text": "Analysis results are automatically formatted and attached to your task descriptions for immediate use in development workflow.",
        "position": 4
      }
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Which video formats are supported?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "PlanToCode supports MP4, WebM, MOV, and AVI video formats. Videos are processed locally and frames are extracted based on your FPS settings before being sent to Gemini Vision for analysis."
        }
      },
      {
        "@type": "Question",
        "name": "Which AI model is used for video analysis?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Video analysis uses Google Gemini 2.5 Pro for comprehensive analysis or Gemini 2.5 Flash for faster, cost-optimized processing. Both models support advanced vision capabilities to extract errors, UI states, and patterns from video frames."
        }
      },
      {
        "@type": "Question",
        "name": "What FPS settings should I use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "For detailed UI interactions and rapid state changes, use 5-10 FPS. For general bug capture and documentation, 2-3 FPS is sufficient. For cost optimization on longer videos, use 1 FPS. Higher FPS provides more context but increases API costs."
        }
      },
      {
        "@type": "Question",
        "name": "How can I optimize analysis costs?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "To optimize costs: use lower FPS settings (1-2 FPS), choose Gemini Flash over Pro for simpler analysis, trim videos to relevant sections only, and use screen recording to capture only the necessary interaction rather than uploading long recordings."
        }
      }
    ]
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "PlanToCode Video Analysis",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Windows, macOS, Linux",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "featureList": [
      "Screen recording with built-in capture",
      "Video file upload (MP4, WebM, MOV, AVI)",
      "Gemini Vision AI analysis (2.5 Pro/Flash)",
      "Configurable FPS control (1-10 FPS)",
      "Automatic error extraction",
      "UI state detection",
      "Pattern recognition",
      "Auto-attach results to task descriptions",
      "Cost optimization controls",
      "Development workflow integration"
    ]
  };

  return (
    <React.Fragment>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />

      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Video className="w-4 h-4" />
                  <span>Multimodal Meeting & Recording Analysis</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Meeting & Presentation Capture for Requirements Extraction
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Record Microsoft Teams meetings or capture screen presentations. Multimodal AI analyzes audio transcripts and visual content to extract actionable requirements and decisions.
                </p>
              </div>

              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Meeting Analysis Matters for Corporate Teams</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="text-red-500 mb-3">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Requirements Get Lost in Meetings</h3>
                    <p className="text-foreground/80 text-sm">
                      Critical decisions and requirements discussed in meetings are forgotten or misinterpreted. Manual note-taking misses context, speaker intent, and visual references.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-yellow-500 mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Manual Meeting Notes Are Incomplete</h3>
                    <p className="text-foreground/80 text-sm">
                      Note-takers can't capture everything—who said what, what was shown on screen, subtle requirement changes. Important context gets lost between meetings and implementation.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-orange-500 mb-3">
                      <Clock className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Review Time Wastes Team Resources</h3>
                    <p className="text-foreground/80 text-sm">
                      Teams spend hours reviewing meeting recordings manually to extract key decisions. Requirements buried in hour-long calls are hard to find and document.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Multimodal Analysis */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Multimodal Analysis of Meetings</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Audio Transcript Analysis</h3>
                        <p className="text-foreground/80 mb-4">
                          Complete audio transcription of meeting discussions. Extract key requirements, decisions, and action items from meeting audio.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Complete audio transcription</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Decision point extraction</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Action item identification</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Eye className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Visual Content Analysis</h3>
                        <p className="text-foreground/80 mb-4">
                          AI analyzes shared screens, presented documents, and key visual moments. Captures UI mockups, architecture diagrams, and other visual context critical for requirements.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Screen share content extraction</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Document and diagram analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Key moment identification</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Extracting Actionable Insights */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Extracting Actionable Insights</h2>
                <GlassCard className="p-8 max-w-4xl mx-auto">
                  <p className="text-foreground/80 mb-6">
                    After processing your meeting recording, the system analyzes both audio transcripts and visual content (shared screens, documents, key moments) to extract actionable insights. The extracted insights - summarized decisions, action items, and key discussion points - are presented in an intuitive interface where team leads can review, select, and incorporate them into actionable implementation plans.
                  </p>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">Summarized Decisions</h4>
                      <p className="text-sm text-foreground/70">
                        Key decisions extracted with context and attributed to specific speakers
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">Action Items</h4>
                      <p className="text-sm text-foreground/70">
                        Concrete action items with owners and implicit dependencies identified
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">Discussion Points</h4>
                      <p className="text-sm text-foreground/70">
                        Important context, concerns raised, and alternative approaches discussed
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How Meeting Analysis Works</h2>

                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Record or Upload Meeting</h3>
                        <p className="text-foreground/80">
                          Capture Microsoft Teams meetings, record screen presentations while presenting tasks from Jira or similar corporate tools, or upload existing recordings. Supports MP4, WebM, MOV, and AVI formats for maximum compatibility with corporate meeting tools.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Gemini Vision Analyzes Frames</h3>
                        <p className="text-foreground/80">
                          Video is processed at your chosen FPS (1-10), and frames are analyzed by Gemini 2.5 Pro or Flash. AI identifies errors, UI states, user interactions, and visual patterns.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Extract Actionable Details</h3>
                        <p className="text-foreground/80">
                          AI extracts error messages, UI state transitions, interaction patterns, and generates improvement suggestions with timestamps.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Auto-Attach to Task Description</h3>
                        <p className="text-foreground/80">
                          Complete analysis is formatted and automatically attached to your task description, ready for implementation planning or bug fixing.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Key Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Powerful Analysis Capabilities</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Video className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Screen Recording Built-In</h3>
                        <p className="text-foreground/80 mb-4">
                          Capture bugs, UI interactions, or demo flows directly in the app. No need for external recording tools or switching contexts.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>One-click screen capture</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Record full screen or specific windows</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Automatic format optimization</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">File Upload Support</h3>
                        <p className="text-foreground/80 mb-4">
                          Upload existing recordings, customer bug reports, or demo videos. Supports all common video formats.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>MP4, WebM, MOV, AVI formats</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Drag-and-drop interface</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Batch upload for multiple videos</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Settings className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">FPS Control (1-10 FPS)</h3>
                        <p className="text-foreground/80 mb-4">
                          Adjust frame extraction rate to balance analysis detail with cost. Higher FPS for detailed interactions, lower for cost optimization.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>1-2 FPS: Cost-effective overview</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>3-5 FPS: Balanced analysis</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>6-10 FPS: Detailed UI state capture</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Eye className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Gemini Vision Analysis</h3>
                        <p className="text-foreground/80 mb-4">
                          Powered by Google Gemini 2.5 Pro or Flash for advanced vision understanding. Extracts errors, patterns, and provides suggestions.
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Error message extraction</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>UI state detection and transitions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Pattern recognition and suggestions</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Real-World Use Cases</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">Bug Capture with Full Context</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Record the bug as it happens. AI extracts error messages, identifies UI states before and after the issue, and captures interaction patterns leading to the bug.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Record interaction flow</div>
                      <div className="text-yellow-400">AI identifies error state</div>
                      <div className="text-red-400">Extracts error messages</div>
                      <div className="text-cyan-400">Suggests potential fixes</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">UI Demo Analysis</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Analyze customer demos, user session recordings, or design walkthroughs. Extract UI patterns, user behavior insights, and improvement opportunities.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Upload demo recording</div>
                      <div className="text-yellow-400">Track UI state changes</div>
                      <div className="text-purple-400">Identify user patterns</div>
                      <div className="text-cyan-400">Extract UX insights</div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">Onboarding Documentation</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      Record feature walkthroughs and generate automatic documentation. AI creates step-by-step guides with screenshots and descriptions from your recordings.
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Record feature walkthrough</div>
                      <div className="text-yellow-400">Extract key steps</div>
                      <div className="text-orange-400">Generate descriptions</div>
                      <div className="text-cyan-400">Create documentation</div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Model Selection */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Choose Your Analysis Model</h2>

                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Zap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Gemini 2.5 Flash</h3>
                        <p className="text-foreground/80 mb-4">
                          Fast, cost-effective analysis for straightforward bug captures and documentation. Ideal for high-volume usage.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Lower cost per frame</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Faster processing time</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Good for simple UI analysis</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Gemini 2.5 Pro</h3>
                        <p className="text-foreground/80 mb-4">
                          Comprehensive analysis with deeper insights. Best for complex UI issues, detailed pattern recognition, and advanced debugging.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Advanced pattern recognition</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Deeper contextual understanding</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Better for complex UI flows</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* FAQ */}
              <FAQ items={[
                {
                  question: 'Which video formats are supported?',
                  answer: 'PlanToCode supports MP4, WebM, MOV, and AVI video formats. Videos are processed locally and frames are extracted based on your FPS settings before being sent to Gemini Vision for analysis. Most screen recording tools output compatible formats by default.',
                },
                {
                  question: 'Which AI model should I choose?',
                  answer: 'Use Gemini 2.5 Flash for straightforward bug captures, quick UI demos, and documentation where speed and cost matter. Choose Gemini 2.5 Pro for complex UI issues, detailed pattern analysis, and when you need deeper contextual understanding. Pro provides more nuanced insights but costs more per frame.',
                },
                {
                  question: 'What FPS settings should I use?',
                  answer: 'FPS recommendations based on use case: 1-2 FPS for general bug reports, long recordings, and cost optimization - captures key moments without excessive frames. 3-5 FPS for balanced analysis for most use cases - good for UI walkthroughs and standard bug captures. 6-10 FPS for detailed UI interactions, animation issues, and rapid state changes - higher cost but more comprehensive.',
                },
                {
                  question: 'How can I optimize analysis costs?',
                  answer: 'Cost optimization strategies: Use lower FPS settings (1-2 FPS) for longer videos or simple analysis. Choose Gemini Flash over Pro when detailed analysis isn\'t critical. Trim videos to relevant sections only before uploading. Use screen recording to capture only necessary interactions rather than uploading long recordings.',
                },
              ]} />

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Meeting Notes into Actionable Requirements</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From Teams meetings to implementation plans. Stop losing requirements in hour-long calls.
                    Let multimodal AI extract every decision, action item, and visual context automatically.
                  </p>

                  <PlatformDownloadSection location="features_video_analysis" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/deep-research">
                      See AI research capabilities
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/file-discovery">
                      Explore file discovery
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}
