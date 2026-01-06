import { Metadata } from 'next';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'Page not found. Return to PlanToCode for the technical planning workspace, file discovery pipelines, and execution handoff.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return <NotFoundContent />;
}
