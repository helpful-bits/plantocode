#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const pages = [
  './src/app/[locale]/(site)/legal/[region]/dpa/page.tsx',
  './src/app/[locale]/(site)/legal/[region]/imprint/page.tsx',
  './src/app/[locale]/(site)/legal/[region]/subprocessors/page.tsx',
  './src/app/[locale]/(site)/legal/[region]/terms/page.tsx',
  './src/app/[locale]/(site)/legal/[region]/withdrawal-policy/page.tsx',
];

const functionToAdd = `
export function generateStaticParams() {
  return locales.flatMap(locale =>
    ['us', 'eu'].map(region => ({ locale, region }))
  );
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

    // Check if it needs the locales import
    const needsImport = !content.includes("from '@/i18n/config'");

    // Add import if needed
    if (needsImport) {
      // Find where to add the import - after type imports, before component imports
      const importMatch = content.match(/(import type { Locale } from ['"]@\/lib\/i18n['"];?\n)/);
      if (importMatch) {
        const insertPos = importMatch.index + importMatch[0].length;
        content = content.slice(0, insertPos) +
                 "import { locales } from '@/i18n/config';\n" +
                 content.slice(insertPos);
      }
    }

    // Find where to insert the function (after generateMetadata, before default export)
    const insertRegex = /(export async function generateMetadata[^}]*}\n)\n(export (?:default )?(?:async )?function)/;
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
