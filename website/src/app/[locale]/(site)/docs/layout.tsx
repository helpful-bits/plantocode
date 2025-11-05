import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { DocsLayoutWrapper } from '@/components/docs/DocsLayoutWrapper';
import { DocsLayoutJsonLd } from '@/components/docs/DocsLayoutJsonLd';
import '@/styles/docs-a11y.css';
import '@/styles/docs-theme.css';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Documentation - PlanToCode',
  description: 'Learn how to plan and ship code changes with PlanToCode: file discovery, implementation plans, terminal sessions, model guardrails, and voice.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.plantocode.com/docs',
    title: 'Documentation - PlanToCode',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <>
      <DocsLayoutJsonLd />
      
      {/* Skip link */}
      <a href="#main-content" className="skip-link" data-skip-link>
        Skip to main content
      </a>
      
      {/* Background gradient consistent with main site */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      
      {/* Main content */}
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        
        <DocsLayoutWrapper>{children}</DocsLayoutWrapper>
      </div>
    </>
  );
}