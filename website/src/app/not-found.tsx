import { Metadata } from 'next';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: '404 - Page Not Found | Vibe Manager',
  description: 'Page not found. Return to Vibe Manager - the multi-model AI planning tool for Claude Code, Cursor, and OpenAI Codex. Get started with intelligent code planning.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return <NotFoundContent />;
}