'use client';

import React from 'react';

interface ObfuscatedEmailProps {
  user: string;
  domain: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Email component that avoids Cloudflare auto-obfuscation while protecting from scrapers
 * Renders email dynamically on client-side to avoid crawl issues
 */
export function ObfuscatedEmail({ user, domain, className = '', children }: ObfuscatedEmailProps) {
  const [email, setEmail] = React.useState('');

  React.useEffect(() => {
    // Construct email on client-side only
    setEmail(`${user}@${domain}`);
  }, [user, domain]);

  if (!email) {
    // Server-side render: show placeholder
    return <span className={className}>{children || 'Email'}</span>;
  }

  return (
    <a
      href={`mailto:${email}`}
      className={className}
      onClick={() => {
        // Allow default mailto behavior
        window.location.href = `mailto:${email}`;
      }}
    >
      {children || email}
    </a>
  );
}
