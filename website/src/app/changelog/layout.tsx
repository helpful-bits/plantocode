import { Header } from '@/components/landing/Header';

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Background gradient consistent with main site */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      
      {/* Main content */}
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow flex flex-col">
          {children}
        </main>
      </div>
    </>
  );
}