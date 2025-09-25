import { Metadata } from 'next';
import { FeatureBaseLink } from '@/components/support/FeatureBaseSSO';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Mail, HelpCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Vibe Manager Support - Get Help, Report Issues, Request Features',
  description: 'Get instant help with Vibe Manager installation and usage. Troubleshooting for Claude Code, Cursor, OpenAI Codex integration. Feature requests welcome. Response within 24h.',
  keywords: [
    'vibe manager support',
    'vibe manager help',
    'claude code help',
    'cursor integration help',
    'installation support',
    'troubleshooting',
    'feature requests',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/support',
  },
};


export default function SupportPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full p-8">
        <div className="space-y-8">
          <header className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <HelpCircle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Support</h1>
            <p className="text-muted-foreground">
              Get help with Vibe Manager
            </p>
          </header>

          <div className="space-y-6">
            <div className="text-center">
              <Button variant="cta" size="lg" asChild className="w-full">
                <a href="mailto:support@vibemanager.app" className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Contact Support
                </a>
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                support@vibemanager.app
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground text-center mb-4">FeatureBase Resources</p>
              <div className="grid grid-cols-2 gap-3">
                <FeatureBaseLink 
                  href="help"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  Help Center
                </FeatureBaseLink>
                <FeatureBaseLink 
                  href="feedback"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  Feedback
                </FeatureBaseLink>
                <FeatureBaseLink 
                  href="roadmap"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  Roadmap
                </FeatureBaseLink>
                <FeatureBaseLink 
                  href="changelog"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  Changelog
                </FeatureBaseLink>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}