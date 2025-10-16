import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Video, Upload, Eye, Settings, Zap, FileVideo, Target, CheckCircle2, Clock, DollarSign, Sparkles, AlertCircle, FileText, Camera } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AI Video Analysis: Screen Record → Instant Context | Vibe Manager',
  description: 'Record screen, AI analyzes with Gemini Vision. Extract errors, UI states, patterns. Auto-attach to tasks. Used by teams who debug fast.',
  keywords: [
    'video analysis',
    'screen recording',
    'gemini vision',
    'ai video processing',
    'bug capture',
    'visual debugging',
    'fps control',
    'error extraction',
    'ui analysis',
    'automated documentation',
  ],
  openGraph: {
    title: 'AI Video Analysis: Screen Record → Instant Context',
    description: 'Screen recording with Gemini Vision AI analysis. Automatically extract errors, UI states, and patterns from videos. Perfect for bug reports and documentation.',
    url: 'https://www.vibemanager.app/features/video-analysis',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/video-analysis',
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
          "text": "Vibe Manager supports MP4, WebM, MOV, and AVI video formats. Videos are processed locally and frames are extracted based on your FPS settings before being sent to Gemini Vision for analysis."
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
    "name": "Vibe Manager Video Analysis",
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
                  <span>Gemini Vision-Powered Video Analysis</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Screen Record. AI Analyzes. Instant Context.
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Record your screen or upload videos, and let Gemini Vision AI extract errors, UI states, patterns, and suggestions. Auto-attach comprehensive analysis to your task descriptions for faster debugging and documentation.
                </p>
              </div>

              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">The Problem with Visual Debugging</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="text-red-500 mb-3">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Hard to Explain Visual Bugs</h3>
                    <p className="text-foreground/80 text-sm">
                      Complex UI issues are difficult to describe in text. Screenshots miss the interaction flow and temporal context needed to reproduce bugs.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-yellow-500 mb-3">
                      <Camera className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Screenshots Miss Context</h3>
                    <p className="text-foreground/80 text-sm">
                      Static images can't capture animation glitches, timing issues, or multi-step interactions. Context is lost between screenshots.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <div className="text-orange-500 mb-3">
                      <Clock className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Manual Bug Reports Are Slow</h3>
                    <p className="text-foreground/80 text-sm">
                      Writing detailed bug reports takes time. Reviewing videos manually to extract key moments is tedious and error-prone.
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How Video Analysis Works</h2>

                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Record or Upload Video</h3>
                        <p className="text-foreground/80">
                          Use built-in screen recording to capture bugs as they happen, or upload existing video files. Supports MP4, WebM, MOV, and AVI formats.
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
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>

                <div className="space-y-6 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-start gap-3">
                      <FileVideo className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      Which video formats are supported?
                    </h3>
                    <p className="text-foreground/80">
                      Vibe Manager supports MP4, WebM, MOV, and AVI video formats. Videos are processed locally and frames are extracted based on your FPS settings before being sent to Gemini Vision for analysis. Most screen recording tools output compatible formats by default.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-start gap-3">
                      <Eye className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      Which AI model should I choose?
                    </h3>
                    <p className="text-foreground/80">
                      Use Gemini 2.5 Flash for straightforward bug captures, quick UI demos, and documentation where speed and cost matter. Choose Gemini 2.5 Pro for complex UI issues, detailed pattern analysis, and when you need deeper contextual understanding. Pro provides more nuanced insights but costs more per frame.
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-start gap-3">
                      <Settings className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      What FPS settings should I use?
                    </h3>
                    <p className="text-foreground/80 mb-3">
                      FPS recommendations based on use case:
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-primary">1-2 FPS:</span>
                        <span>General bug reports, long recordings, cost optimization. Captures key moments without excessive frames.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-primary">3-5 FPS:</span>
                        <span>Balanced analysis for most use cases. Good for UI walkthroughs and standard bug captures.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-primary">6-10 FPS:</span>
                        <span>Detailed UI interactions, animation issues, rapid state changes. Higher cost but more comprehensive.</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-start gap-3">
                      <DollarSign className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      How can I optimize analysis costs?
                    </h3>
                    <p className="text-foreground/80 mb-3">
                      Cost optimization strategies:
                    </p>
                    <ul className="space-y-2 text-foreground/70 text-sm">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Use lower FPS settings (1-2 FPS) for longer videos or simple analysis</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Choose Gemini Flash over Pro when detailed analysis isn't critical</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Trim videos to relevant sections only before uploading</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Use screen recording to capture only necessary interactions rather than uploading long recordings</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Transform Visual Debugging</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From screen recording to AI-powered insights. Stop writing manual bug reports.
                    Let Gemini Vision extract every detail automatically.
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
