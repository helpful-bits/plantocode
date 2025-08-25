import { loader } from '@monaco-editor/react';

// Configure Monaco to use CDN for Next.js
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'
  }
});

// Initialize loader
if (typeof window !== 'undefined') {
  loader.init().then(() => {
    console.log('Monaco Editor initialized successfully');
  }).catch((error) => {
    console.error('Failed to initialize Monaco Editor:', error);
  });
}