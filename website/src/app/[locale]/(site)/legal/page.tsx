import { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Select Your Region - Legal Documents',
  description: 'Choose your region (EU/UK or United States) to view applicable legal documents including terms of service, privacy policy, and regional compliance requirements.',
  alternates: {
    canonical: 'https://www.plantocode.com/legal',
    languages: {
      'en-US': 'https://www.plantocode.com/legal',
      'en': 'https://www.plantocode.com/legal',
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'PlanToCode',
    title: 'Select Your Region - Legal Documents',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function LegalRegionSelector() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-4">Select Your Region</h1>
        <p className="text-center text-muted-foreground mb-12 text-lg">
          Choose your region to view the applicable legal documents
        </p>
        
        {/* Add this section after the subtitle, before the grid */}
        <div className="glass border border-amber-500/20 rounded-lg p-6 mb-12 max-w-2xl mx-auto">
          <div className="flex items-start space-x-3">
            <svg className="w-6 h-6 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm">
              <p className="font-semibold mb-2">Service Availability Notice</p>
              <p className="text-muted-foreground">
                PlanToCode is <strong>only available</strong> to residents of and users accessing from the European Union/EEA,
                United Kingdom, and United States. Access from all other regions is <strong>restricted</strong>.
                We use IP geolocation, payment verification, and other methods to enforce these restrictions.
                VPN or proxy use to circumvent regional restrictions is prohibited.
              </p>
            </div>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* EU Card */}
          <Link href="/legal/eu/terms" className="group">
            <div className="glass border border-primary/20 rounded-xl p-8 hover:border-primary/40 transition-all hover:scale-105">
              <div className="text-4xl mb-4">🇪🇺</div>
              <h2 className="text-2xl font-semibold mb-3">European Union / UK</h2>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• GDPR data protection rights</li>
                <li>• 14-day withdrawal period</li>
                <li>• German law applies</li>
                <li>• Consumer protections</li>
              </ul>
              <div className="mt-4 pt-4 border-t border-border/20">
                <p className="text-xs text-muted-foreground">
                  Includes: Terms, Privacy, Imprint, Sub-processors, Withdrawal Policy
                </p>
              </div>
            </div>
          </Link>
          
          {/* US Card */}
          <Link href="/legal/us/terms" className="group">
            <div className="glass border border-primary/20 rounded-xl p-8 hover:border-primary/40 transition-all hover:scale-105">
              <div className="text-4xl mb-4">🇺🇸</div>
              <h2 className="text-2xl font-semibold mb-3">United States</h2>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• CCPA/State privacy rights</li>
                <li>• US law applies</li>
                <li>• DMCA process</li>
                <li>• Standard commercial terms</li>
              </ul>
              <div className="mt-4 pt-4 border-t border-border/20">
                <p className="text-xs text-muted-foreground">
                  Includes: Terms of Service, Privacy Policy, Sub-processors
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}