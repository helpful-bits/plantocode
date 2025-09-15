import { Header } from '@/components/landing/Header';
import { DocsLayoutWrapper } from '@/components/docs/DocsLayoutWrapper';
import { DocsLayoutJsonLd } from '@/components/docs/DocsLayoutJsonLd';
import '@/styles/docs-a11y.css';
import '@/styles/docs-theme.css';

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