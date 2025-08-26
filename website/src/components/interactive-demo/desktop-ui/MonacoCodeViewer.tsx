'use client';

import dynamic from 'next/dynamic';
import { MonacoCodeViewerProps } from './MonacoCodeViewerInner';

const MonacoCodeViewerInner = dynamic(() => import('./MonacoCodeViewerInner').then(mod => ({ default: mod.MonacoCodeViewerInner })), { 
  ssr: false, 
  loading: () => <div className="h-40 rounded-md bg-muted animate-pulse" /> 
});

export default function MonacoCodeViewer(props: MonacoCodeViewerProps) {
  return <MonacoCodeViewerInner {...props} />;
}

export { MonacoCodeViewer };