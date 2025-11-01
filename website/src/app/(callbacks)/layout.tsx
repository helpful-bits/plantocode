import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
  },
};

export default function CallbacksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="min-h-screen relative">
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </>
  );
}