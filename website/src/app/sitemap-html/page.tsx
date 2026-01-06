import { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  FileText,
  BookOpen
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sitemap - All Pages',
  description: 'Sitemap of PlanToCode pages including documentation and technical guides.',
  alternates: {
    canonical: 'https://www.plantocode.com/sitemap-html',
  },
};

export default function HtmlSitemapPage() {
  const mainPages = [
    { href: '/', label: 'Home', description: 'Technical walkthrough and examples' },
    { href: '/architecture', label: 'Architecture', description: 'System overview and component map' },
    { href: '/evolution', label: 'Evolution', description: 'History and tradeoffs log' },
    { href: '/about', label: 'About', description: 'Purpose and scope' },
    { href: '/downloads', label: 'Downloads', description: 'Desktop builds and system requirements' },
    { href: '/support', label: 'Support', description: 'Troubleshooting and help' },
  ];

  const docPages = [
    { href: '/docs', label: 'Documentation Home' },
    { href: '/docs/overview', label: 'System Overview' },
    { href: '/docs/architecture', label: 'Architecture' },
    { href: '/docs/runtime-walkthrough', label: 'Runtime Walkthrough' },
    { href: '/docs/desktop-app', label: 'Desktop App Internals' },
    { href: '/docs/server-api', label: 'Server API & LLM Proxy' },
    { href: '/docs/mobile-ios', label: 'iOS Client Architecture' },
    { href: '/docs/background-jobs', label: 'Background Jobs' },
    { href: '/docs/data-model', label: 'Data Model & Storage' },
    { href: '/docs/decisions-tradeoffs', label: 'Technical Decisions' },
    { href: '/docs/build-your-own', label: 'Build Your Own Pipeline' },
    { href: '/docs/server-setup', label: 'Dedicated Server Setup' },
    { href: '/docs/tauri-v2', label: 'Tauri v2 Development' },
    { href: '/docs/distribution-macos', label: 'macOS Distribution' },
    { href: '/docs/distribution-windows', label: 'Windows Distribution & Store' },
    { href: '/docs/meeting-ingestion', label: 'Meeting Ingestion' },
    { href: '/docs/video-analysis', label: 'Video Analysis' },
    { href: '/docs/file-discovery', label: 'File Discovery' },
    { href: '/docs/implementation-plans', label: 'Implementation Plans' },
    { href: '/docs/merge-instructions', label: 'Merge Instructions' },
    { href: '/docs/prompt-types', label: 'Prompt Types & Templates' },
    { href: '/docs/copy-buttons', label: 'Copy Buttons' },
    { href: '/docs/deep-research', label: 'Deep Research' },
    { href: '/docs/model-configuration', label: 'Model Configuration' },
    { href: '/docs/provider-routing', label: 'Provider Routing' },
    { href: '/docs/terminal-sessions', label: 'Terminal Sessions' },
    { href: '/docs/voice-transcription', label: 'Voice Transcription' },
    { href: '/docs/text-improvement', label: 'Text Improvement' },
  ];


  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Sitemap' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <FileText className="w-4 h-4" />
                  <span>Site Navigation</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  Complete Sitemap
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Browse all pages, documentation, and technical resources.
                </p>
              </header>

              <div className="space-y-12">
                {/* Main Pages */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <FileText className="w-6 h-6 text-primary" />
                    Main Pages
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-2 gap-4">
                      {mainPages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="block hover:text-primary transition-colors">
                            <span className="font-medium">{page.label}</span>
                            {page.description && (
                              <p className="text-sm text-foreground/60">{page.description}</p>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Documentation */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-primary" />
                    Documentation ({docPages.length})
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-3 gap-4">
                      {docPages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="hover:text-primary transition-colors">
                            {page.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Bottom Summary */}
                <GlassCard className="p-8 text-center" highlighted>
                  <h2 className="text-xl font-bold mb-2">Total Pages: {mainPages.length + docPages.length}</h2>
                  <p className="text-foreground/70 mb-6">
                    Documentation-first guide to PlanToCode architecture and data flows
                  </p>
                  <Link href="/" className="text-primary hover:underline">
                    Back to Home
                  </Link>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
