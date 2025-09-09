import { Metadata } from 'next';
import GlassCard from '@/components/ui/GlassCard';
import { Mail, MessageSquare } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Vibe Manager - Business & Partnership Inquiries',
  description: 'Contact Vibe Manager team for business inquiries, partnerships, or enterprise support. Multi-model AI planning tool for Claude Code, Cursor, and OpenAI Codex.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full p-8">
        <div className="space-y-8">
          <header className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Contact</h1>
            <p className="text-muted-foreground">
              For business, press, and partnership inquiries
            </p>
          </header>

          <div className="space-y-6">
            <div className="text-center">
              <a 
                href="mailto:support@vibemanager.app" 
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors w-full"
              >
                <Mail className="w-5 h-5" />
                Email Us
              </a>
              <p className="text-sm text-muted-foreground mt-2">
                support@vibemanager.app
              </p>
            </div>

            <div className="border-t border-border pt-6 space-y-4">
              <a 
                href="https://vibemanager.featurebase.app" 
                className="flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Visit Support</span>
              </a>

              <a
                href="https://x.com/vibemanagerapp"
                className="flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="text-sm font-medium">Follow us on X</span>
              </a>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}