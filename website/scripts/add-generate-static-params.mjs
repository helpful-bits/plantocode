#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const pages = [
  './src/app/[locale]/(site)/about/page.tsx',
  './src/app/[locale]/(site)/all-pages/page.tsx',
  './src/app/[locale]/(site)/blog/ai-code-planning-best-practices/page.tsx',
  './src/app/[locale]/(site)/blog/ai-pair-programming-vs-ai-planning/page.tsx',
  './src/app/[locale]/(site)/blog/best-ai-coding-assistants-2025/page.tsx',
  './src/app/[locale]/(site)/blog/github-copilot-alternatives-2025/page.tsx',
  './src/app/[locale]/(site)/blog/page.tsx',
  './src/app/[locale]/(site)/blog/what-is-ai-code-planning/page.tsx',
  './src/app/[locale]/(site)/changelog/page.tsx',
  './src/app/[locale]/(site)/compare/cursor-vs-windsurf/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-aider/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-claude-code-standalone/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-cursor-agents/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-github-copilot-cli/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-raycast-ai/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-tmux-script-asciinema/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-vscode-tasks/page.tsx',
  './src/app/[locale]/(site)/compare/plantocode-vs-warp-ai-terminal/page.tsx',
  './src/app/[locale]/(site)/comparisons/page.tsx',
  './src/app/[locale]/(site)/cursor-alternative/page.tsx',
  './src/app/[locale]/(site)/docs/architecture/page.tsx',
  './src/app/[locale]/(site)/docs/deep-research/page.tsx',
  './src/app/[locale]/(site)/docs/file-discovery/page.tsx',
  './src/app/[locale]/(site)/docs/implementation-plans/page.tsx',
  './src/app/[locale]/(site)/docs/model-configuration/page.tsx',
  './src/app/[locale]/(site)/docs/terminal-sessions/page.tsx',
  './src/app/[locale]/(site)/docs/text-improvement/page.tsx',
  './src/app/[locale]/(site)/docs/voice-transcription/page.tsx',
  './src/app/[locale]/(site)/downloads/page.tsx',
  './src/app/[locale]/(site)/features/copy-buttons/page.tsx',
  './src/app/[locale]/(site)/features/deep-research/page.tsx',
  './src/app/[locale]/(site)/features/file-discovery/page.tsx',
  './src/app/[locale]/(site)/features/integrated-terminal/page.tsx',
  './src/app/[locale]/(site)/features/merge-instructions/page.tsx',
  './src/app/[locale]/(site)/features/page.tsx',
  './src/app/[locale]/(site)/features/plan-mode/page.tsx',
  './src/app/[locale]/(site)/features/text-improvement/page.tsx',
  './src/app/[locale]/(site)/features/video-analysis/page.tsx',
  './src/app/[locale]/(site)/features/voice-transcription/page.tsx',
  './src/app/[locale]/(site)/how-it-works/page.tsx',
  './src/app/[locale]/(site)/integrations/page.tsx',
  './src/app/[locale]/(site)/legal/page.tsx',
  './src/app/[locale]/(site)/legal/restricted/page.tsx',
  './src/app/[locale]/(site)/plan-mode/claude-code/page.tsx',
  './src/app/[locale]/(site)/plan-mode/codex/page.tsx',
  './src/app/[locale]/(site)/plan-mode/cursor/page.tsx',
  './src/app/[locale]/(site)/plan-mode/page.tsx',
  './src/app/[locale]/(site)/screenshots/page.tsx',
  './src/app/[locale]/(site)/solutions/ai-wrong-paths/page.tsx',
  './src/app/[locale]/(site)/solutions/hard-bugs/page.tsx',
  './src/app/[locale]/(site)/solutions/large-features/page.tsx',
  './src/app/[locale]/(site)/solutions/legacy-code-refactoring/page.tsx',
  './src/app/[locale]/(site)/solutions/library-upgrades/page.tsx',
  './src/app/[locale]/(site)/solutions/maintenance-enhancements/page.tsx',
  './src/app/[locale]/(site)/solutions/page.tsx',
  './src/app/[locale]/(site)/solutions/prevent-duplicate-files/page.tsx',
  './src/app/[locale]/(site)/solutions/safe-refactoring/page.tsx',
  './src/app/[locale]/(site)/stacks/page.tsx',
  './src/app/[locale]/(site)/support/page.tsx',
  './src/app/[locale]/(site)/use-cases/page.tsx',
  './src/app/[locale]/(site)/workflows/page.tsx',
];

const functionToAdd = `
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
`;

let processed = 0;
let skipped = 0;
let errors = 0;

for (const pagePath of pages) {
  try {
    const fullPath = resolve(process.cwd(), pagePath);
    let content = readFileSync(fullPath, 'utf-8');

    // Skip if already has generateStaticParams
    if (content.includes('generateStaticParams')) {
      console.log(`⏭️  Skipped (already has function): ${pagePath}`);
      skipped++;
      continue;
    }

    // Skip client components
    if (content.includes("'use client'") || content.includes('"use client"')) {
      console.log(`⏭️  Skipped (client component): ${pagePath}`);
      skipped++;
      continue;
    }

    // Check if it needs the locales import
    const needsImport = !content.includes("from '@/i18n/config'");

    // Add import if needed
    if (needsImport) {
      // Find a good place to add the import (after other imports)
      const importRegex = /(import .+ from ['"][^'"]+['"];?\n)+/;
      const match = content.match(importRegex);
      if (match) {
        const lastImportEnd = match.index + match[0].length;
        content = content.slice(0, lastImportEnd) +
                 "import { locales } from '@/i18n/config';\n" +
                 content.slice(lastImportEnd);
      }
    }

    // Find where to insert the function (after metadata export, before default export)
    const insertRegex = /(export const metadata[^;]*;[\s\S]*?\n)\n(export (?:default )?(?:async )?function)/;
    const insertMatch = content.match(insertRegex);

    if (insertMatch) {
      content = content.replace(
        insertRegex,
        `$1${functionToAdd}\n$2`
      );

      writeFileSync(fullPath, content, 'utf-8');
      console.log(`✅ Processed: ${pagePath}`);
      processed++;
    } else {
      console.log(`⚠️  Could not find insertion point: ${pagePath}`);
      errors++;
    }
  } catch (error) {
    console.error(`❌ Error processing ${pagePath}:`, error.message);
    errors++;
  }
}

console.log('\n📊 Summary:');
console.log(`   Processed: ${processed}`);
console.log(`   Skipped: ${skipped}`);
console.log(`   Errors: ${errors}`);
console.log(`   Total: ${pages.length}`);
