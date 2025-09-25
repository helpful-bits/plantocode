import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { ScreenshotGallery } from '@/components/demo/ScreenshotGallery';

export const metadata: Metadata = {
  title: 'Screenshots - Vibe Manager in Action',
  description: 'See Vibe Manager in action with real screenshots from actual workflows. File discovery, implementation plans, terminal integration, and more.',
  keywords: [
    'vibe manager screenshots',
    'ai planning interface',
    'implementation plan examples',
    'file discovery workflow',
    'terminal integration demo',
    'monaco editor screenshots',
    'multi-model planning UI',
    'voice transcription interface',
  ],
  openGraph: {
    title: 'Screenshots - See Vibe Manager in Action',
    description: 'Real screenshots from actual workflows showing file discovery, implementation planning, and terminal execution.',
    url: 'https://www.vibemanager.app/screenshots',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/screenshots',
  },
};

export default function ScreenshotsPage() {
  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />

        <main className="flex-grow">
          <section className="pt-20 sm:pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Screenshots
                </h1>
                <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto">
                  Real screenshots from actual workflows - no mockups, no marketing fluff.
                  See exactly how Vibe Manager helps you plan and execute implementation work.
                </p>
              </div>
            </div>
          </section>

          <ScreenshotGallery />
        </main>
      </div>
    </>
  );
}