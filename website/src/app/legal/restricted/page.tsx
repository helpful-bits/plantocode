import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Service Not Available - Regional Restriction',
  description: 'This service is not available in your region.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RestrictedRegionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <svg className="w-24 h-24 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-4">Service Not Available in Your Region</h1>
        
        <div className="glass border border-red-500/20 rounded-lg p-6 mb-8">
          <p className="text-lg mb-4">
            Vibe Manager is currently only available in:
          </p>
          <ul className="space-y-2 text-left max-w-xs mx-auto">
            <li className="flex items-center">
              <span className="mr-2">🇪🇺</span>
              <span>European Union / EEA</span>
            </li>
            <li className="flex items-center">
              <span className="mr-2">🇬🇧</span>
              <span>United Kingdom</span>
            </li>
            <li className="flex items-center">
              <span className="mr-2">🇺🇸</span>
              <span>United States</span>
            </li>
          </ul>
        </div>
        
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            We detected that you are accessing from a region where our service is not currently offered.
          </p>
          <p>
            <strong>Error Code:</strong> GEO_RESTRICTION_001
          </p>
          <p>
            If you believe this is an error and you are located in an approved region, please contact support.
          </p>
        </div>
        
        <div className="mt-8 space-y-4">
          <Link 
            href="mailto:legal@vibemanager.app?subject=Regional%20Access%20Issue" 
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Contact Support
          </Link>
          
          <p className="text-xs text-muted-foreground">
            Pro-rata refunds available for eligible users
          </p>
        </div>
      </div>
    </div>
  );
}