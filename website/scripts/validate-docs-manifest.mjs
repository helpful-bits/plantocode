#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findPageFiles(dir, basePath = '') {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    if (item.isDirectory()) {
      files.push(...findPageFiles(path.join(dir, item.name), path.join(basePath, item.name)));
    } else if (item.name.match(/^page\.(ts|tsx|jsx|mdx)$/)) {
      files.push(basePath || '.');
    }
  }
  
  return files;
}

async function main() {
  const websiteRoot = path.join(__dirname, '..');
  const docsRoot = path.join(websiteRoot, 'src', 'app', 'docs');
  
  // Find all page files in docs directory
  const pageFiles = findPageFiles(docsRoot);
  
  // Convert file paths to slugs
  const fileSlugs = pageFiles
    .map(file => {
      if (file === '.') return '/docs';
      return `/docs/${file}`;
    })
    .filter(slug => slug !== '/docs'); // Exclude root docs page
  
  
  // Read and parse the manifest file manually
  const manifestPath = path.join(websiteRoot, 'src', 'docs', 'docs-manifest.ts');
  
  let docsManifest;
  try {
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    // Simple regex to extract the manifest array  
    const manifestMatch = manifestContent.match(/export const docsManifest: DocGroup\[\] = (\[[\s\S]*?\]);/);
    if (!manifestMatch) {
      throw new Error('Could not find docsManifest export in file');
    }
    
    // Safely evaluate the manifest array (simplified approach)
    const manifestStr = manifestMatch[1];
    docsManifest = eval(`(${manifestStr})`);
  } catch (error) {
    console.error('❌ Failed to parse docs manifest:', error.message);
    process.exit(1);
  }
  
  // Flatten the manifest to get all slugs
  function flattenManifest(groups) {
    const result = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (item.slug) {
          result.push(item.slug);
        } else if (item.items) {
          result.push(...flattenManifest([item]));
        }
      }
    }
    return result;
  }
  
  const manifestSlugs = flattenManifest(docsManifest);
  
  // Find errors and warnings
  const missingFiles = manifestSlugs.filter(slug => !fileSlugs.includes(slug));
  const orphanedFiles = fileSlugs.filter(slug => !manifestSlugs.includes(slug));
  
  let hasErrors = false;
  
  // Print errors for missing files
  if (missingFiles.length > 0) {
    hasErrors = true;
    console.error('❌ ERRORS: Manifest entries missing corresponding files:');
    missingFiles.forEach(slug => {
      const expectedPath = slug.replace('/docs/', '') + '/page.tsx';
      console.error(`  ${slug} -> Expected: src/app/docs/${expectedPath}`);
    });
    console.error('');
  }
  
  // Print warnings for orphaned files
  if (orphanedFiles.length > 0) {
    console.warn('⚠️  WARNINGS: Files not referenced in manifest:');
    orphanedFiles.forEach(slug => {
      const filePath = slug.replace('/docs/', '') + '/page.*';
      console.warn(`  ${slug} -> File: src/app/docs/${filePath}`);
    });
    console.warn('');
  }
  
  // Print summary
  if (!hasErrors && orphanedFiles.length === 0) {
    console.log('✅ All manifest entries have corresponding files and no orphaned files found.');
  } else if (!hasErrors) {
    console.log(`✅ All manifest entries have corresponding files. ${orphanedFiles.length} orphaned files found (warnings only).`);
  }
  
  console.log(`📊 Summary: ${manifestSlugs.length} manifest entries, ${fileSlugs.length} page files`);
  
  // Exit with error code if there are missing files
  if (hasErrors) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});