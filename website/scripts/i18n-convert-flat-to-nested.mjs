#!/usr/bin/env node
import { globby } from 'globby';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Convert dotted keys at any depth to nested objects.
 * Example: { "a.b.c": 1, "a.b.d": 2 } => { a: { b: { c: 1, d: 2 } } }
 */
function unflatten(flat) {
  const nested = {};
  const sortedKeys = Object.keys(flat).sort();

  for (const key of sortedKeys) {
    const parts = key.split('.');
    let current = nested;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      } else if (typeof current[part] !== 'object' || Array.isArray(current[part])) {
        // Conflict: a leaf value exists where we need an object
        // Last write wins: overwrite with object
        current[part] = {};
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    // Last write wins: always set the value
    current[lastPart] = flat[key];
  }

  return nested;
}

/**
 * Convert nested objects to flat dotted keys.
 * Example: { a: { b: { c: 1 } } } => { "a.b.c": 1 }
 */
function flatten(obj, prefix = '') {
  const flat = {};

  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, flatten(value, newKey));
    } else {
      flat[newKey] = value;
    }
  }

  return flat;
}

/**
 * Deep merge with deterministic behavior:
 * - Objects are merged recursively
 * - Arrays are replaced (last write wins)
 * - Primitives are replaced (last write wins)
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source).sort()) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      // Last write wins: arrays and primitives are replaced
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Sort object keys recursively for stable output
 */
function sortKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

/**
 * Process a single JSON file:
 * 1. Read and parse JSON
 * 2. Flatten to dotted keys
 * 3. Unflatten back to nested
 * 4. Sort keys for stable output
 * 5. Write back if changed (idempotent)
 */
async function processFile(filePath, write) {
  try {
    const content = await readFile(filePath, 'utf8');
    const original = JSON.parse(content);

    // Convert to flat, then back to nested (this normalizes the structure)
    const flat = flatten(original);
    const nested = unflatten(flat);
    const sorted = sortKeys(nested);

    // Generate new content with consistent formatting
    const newContent = JSON.stringify(sorted, null, 2) + '\n';

    // Check if content actually changed
    const changed = content !== newContent;

    if (changed) {
      if (write) {
        await writeFile(filePath, newContent, 'utf8');
        console.log(`✓ Updated: ${path.relative(process.cwd(), filePath)}`);
      } else {
        console.log(`✗ Needs update: ${path.relative(process.cwd(), filePath)}`);
      }
    } else {
      console.log(`  Unchanged: ${path.relative(process.cwd(), filePath)}`);
    }

    return { filePath, changed };
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return { filePath, changed: false, error: error.message };
  }
}

/**
 * Main function to process all message files
 */
async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const check = args.includes('--check');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node i18n-convert-flat-to-nested.mjs [options]

Options:
  --write   Write changes to files (default: dry-run)
  --check   Exit with error code if any files need updates
  --help    Show this help message

Examples:
  node i18n-convert-flat-to-nested.mjs              # Dry-run mode
  node i18n-convert-flat-to-nested.mjs --write      # Apply changes
  node i18n-convert-flat-to-nested.mjs --check      # CI mode
`);
    process.exit(0);
  }

  console.log('Scanning website/src/messages/**/*.json...\n');

  const pattern = 'website/src/messages/**/*.json';
  const files = await globby(pattern, {
    cwd: process.cwd(),
    absolute: true,
  });

  if (files.length === 0) {
    console.log('No JSON files found.');
    process.exit(0);
  }

  console.log(`Found ${files.length} files to process.\n`);

  const results = await Promise.all(
    files.map(file => processFile(file, write))
  );

  const changed = results.filter(r => r.changed);
  const errors = results.filter(r => r.error);

  console.log(`\nSummary:`);
  console.log(`  Total files: ${results.length}`);
  console.log(`  Changed: ${changed.length}`);
  console.log(`  Unchanged: ${results.length - changed.length - errors.length}`);
  console.log(`  Errors: ${errors.length}`);

  if (write && changed.length > 0) {
    console.log(`\n✓ Updated ${changed.length} file(s).`);
  } else if (!write && changed.length > 0) {
    console.log(`\n⚠ Run with --write to apply changes.`);
  }

  if (check && changed.length > 0) {
    console.error(`\n✗ Check failed: ${changed.length} file(s) need updates.`);
    process.exit(1);
  }

  if (errors.length > 0) {
    console.error(`\n✗ Encountered ${errors.length} error(s).`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
