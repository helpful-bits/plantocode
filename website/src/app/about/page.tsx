import { Metadata } from 'next';
import GlassCard from '@/components/ui/GlassCard';
import { Building, Globe, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Vibe Manager, the AI coding assistant that acts as a middle-manager for your LLMs, curating perfect context from your codebase.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/about',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-2xl w-full p-8 sm:p-10">
        <div className="space-y-8">
          <header className="text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">About Vibe Manager</h1>
            <p className="text-lg text-muted-foreground">
              The AI coding assistant that acts as a middle-manager for your LLMs
            </p>
          </header>

          <div className="space-y-6">
            <section className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                Vibe Manager acts as the competent middle manager your AI agents need. We curate the perfect context from your codebase, ensuring your agents have exactly what they need to understand your project and build correctly from the start.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We believe your code should remain yours. Vibe Manager operates with a local-first architecture, meaning your codebase and project files stay on your machine. Only the specific context you choose to share is transmitted to AI providers when needed.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">Company Information</h2>
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className="text-foreground font-medium">helpful bits GmbH</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Jurisdiction</p>
                    <p className="text-foreground font-medium">Germany</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contact</p>
                    <a href="mailto:support@vibemanager.app" className="text-primary hover:underline font-medium">
                      support@vibemanager.app
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}