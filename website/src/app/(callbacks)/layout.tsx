import { InteractiveBackground } from '@/components/landing/InteractiveBackground';

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
        <InteractiveBackground />
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </>
  );
}