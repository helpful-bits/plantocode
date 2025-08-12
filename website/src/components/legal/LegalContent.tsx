interface LegalContentProps {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
}

export default function LegalContent({ title, children, subtitle }: LegalContentProps) {
  return (
    <div>
      
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      {subtitle && <p className="text-lg text-muted-foreground mb-8">{subtitle}</p>}
      
      <article className="space-y-6 text-base leading-relaxed">
        {children}
      </article>
    </div>
  );
}