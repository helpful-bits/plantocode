'use client';

import { Header } from '@/components/landing/Header';
import { ErrorBoundary } from '@/components/interactive-demo/ErrorBoundary';
import { HowItWorksInteractive } from '@/components/interactive-demo/HowItWorksInteractive';
import { ScreenshotGallery } from '@/components/demo/ScreenshotGallery';

export default function DemoPage() {
  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      
      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-hero-title">
                  Interactive Demo
                </h1>
                <p className="text-lg sm:text-xl text-description-muted max-w-3xl mx-auto">
                  Experience the complete Vibe Manager workflow - from capturing your intent to generating implementation plans.
                </p>
              </div>
            </div>
          </section>

          <ErrorBoundary>
            <HowItWorksInteractive />
          </ErrorBoundary>

          {/* Screenshot Gallery Section */}
          <ScreenshotGallery />
        </main>
      </div>
    </>
  );
}