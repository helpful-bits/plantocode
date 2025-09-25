import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LinkWithArrowProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}

export function LinkWithArrow({ href, children, className, external = false }: LinkWithArrowProps) {
  const Component = external ? 'a' : Link;
  const extraProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <Component
      href={href}
      {...extraProps}
      className={cn(
        "inline-flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded",
        className
      )}
    >
      <span>{children}</span>
      <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">→</span>
    </Component>
  );
}