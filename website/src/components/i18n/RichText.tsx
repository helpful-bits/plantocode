import React from 'react';

/**
 * Renders text with safe bold markup.
 * Recognizes ONLY these safe markers: [b]...[/b] (preferred), <strong>...</strong>, <b>...</b>, and **...**
 * Converts them to React <strong className="font-semibold"> elements.
 * Leaves all other content as plain text.
 * Supports multiple non-nested bold segments.
 */
export function renderBold(text: string): React.ReactNode {
  if (!text) return text;

  // Define patterns for safe bold markers (non-nested)
  const patterns = [
    { open: '[b]', close: '[/b]' },
    { open: '<strong>', close: '</strong>' },
    { open: '<b>', close: '</b>' },
    { open: '**', close: '**' },
  ];

  const segments: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliestMatch: {
      pattern: { open: string; close: string };
      openIndex: number;
      closeIndex: number;
    } | null = null;

    // Find the earliest opening marker
    for (const pattern of patterns) {
      const openIndex = remaining.indexOf(pattern.open);
      if (openIndex === -1) continue;

      const searchStart = openIndex + pattern.open.length;
      const closeIndex = remaining.indexOf(pattern.close, searchStart);
      if (closeIndex === -1) continue;

      if (
        earliestMatch === null ||
        openIndex < earliestMatch.openIndex
      ) {
        earliestMatch = { pattern, openIndex, closeIndex };
      }
    }

    if (!earliestMatch) {
      // No more matches, add remaining text
      segments.push(remaining);
      break;
    }

    const { pattern, openIndex, closeIndex } = earliestMatch;

    // Add text before the match
    if (openIndex > 0) {
      segments.push(remaining.substring(0, openIndex));
    }

    // Extract and add the bold content
    const contentStart = openIndex + pattern.open.length;
    const content = remaining.substring(contentStart, closeIndex);
    segments.push(
      <strong
        key={key++}
        className="font-extrabold"
        style={{
          background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-adaptive-accent) 50%, var(--color-primary) 100%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'gradient-shift 3s ease infinite',
          animationDelay: `${key * 0.3}s`,
          filter: 'drop-shadow(0 0 12px color-mix(in oklch, var(--color-primary) 40%, transparent)) drop-shadow(0 0 24px color-mix(in oklch, var(--color-primary) 20%, transparent))'
        }}
      >
        {content}
      </strong>
    );

    // Continue with remaining text
    remaining = remaining.substring(closeIndex + pattern.close.length);
  }

  return <>{segments}</>;
}
