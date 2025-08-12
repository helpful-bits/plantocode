import { Metadata } from 'next';
import { FeatureBaseLink } from '@/components/support/FeatureBaseSSO';
import GlassCard from '@/components/ui/GlassCard';
import { Mail, HelpCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with Vibe Manager - contact support and access help resources.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/support',
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
              <a 
                href="mailto:support@vibemanager.app" 
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors w-full"
              >
                <Mail className="w-5 h-5" />
                Contact Support
              </a>
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