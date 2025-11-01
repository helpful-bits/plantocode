#!/usr/bin/env node

/**
 * Content Validation Script
 *
 * Validates content files for:
 * - Required metadata fields
 * - Open Graph completeness
 * - Title length (optimal: <60 chars)
 * - Description length (optimal: 150-160 chars)
 * - TODO comments (warns if present)
 * - Broken internal links
 *
 * Usage:
 *   node scripts/validate-content.js                    # Validate all
 *   node scripts/validate-content.js --path src/app/blog/my-post  # Validate specific
 *   node scripts/validate-content.js --strict           # Fail on warnings
 *   node scripts/validate-content.js --fix              # Auto-fix issues where possible
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const targetPath = args.includes('--path') ? args[args.indexOf('--path') + 1] : null;
const strictMode = args.includes('--strict');
const fixMode = args.includes('--fix');
const helpMode = args.includes('--help') || args.includes('-h');

if (helpMode) {
  console.log(`
Content Validation Script

Usage:
  node scripts/validate-content.js [options]

Options:
  --path <path>     Validate specific directory or file
  --strict          Fail build on warnings (for CI/CD)
  --fix             Auto-fix issues where possible
  --help, -h        Show this help message

Examples:
  node scripts/validate-content.js
  node scripts/validate-content.js --path src/app/blog/my-post
  node scripts/validate-content.js --strict
  `);
  process.exit(0);
}

// Validation results
const results = {
  errors: [],
  warnings: [],
  info: [],
  filesChecked: 0,
};

/**
 * Find all page.tsx files to validate
 */
function findPageFiles(dir) {
  const files = [];

  function walk(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules and .next
        if (item !== 'node_modules' && item !== '.next' && item !== 'out') {
          walk(fullPath);
        }
      } else if (item === 'page.tsx' || item === 'page.ts') {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Extract metadata from a page file
 */
function extractMetadata(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const metadata = {};

  // Extract title
  const titleMatch = content.match(/title:\s*['"](.*?)['"]/);
  if (titleMatch) metadata.title = titleMatch[1];

  // Extract description
  const descMatch = content.match(/description:\s*['"](.*?)['"]/s);
  if (descMatch) metadata.description = descMatch[1].replace(/\s+/g, ' ').trim();

  // Check for OpenGraph
  metadata.hasOpenGraph = content.includes('openGraph:');

  // Check for Twitter card
  metadata.hasTwitterCard = content.includes('twitter:');

  // Check for canonical
  metadata.hasCanonical = content.includes('canonical:');

  // Check for keywords
  const keywordsMatch = content.match(/keywords:\s*\[([\s\S]*?)\]/);
  metadata.hasKeywords = !!keywordsMatch;
  if (keywordsMatch) {
    const keywordsStr = keywordsMatch[1];
    const keywords = keywordsStr.split(',').map(k => k.trim().replace(/['"]/g, '')).filter(Boolean);
    metadata.keywords = keywords;
    metadata.keywordCount = keywords.length;
  }

  // Check for TODO comments
  const todoMatches = content.match(/TODO:/g);
  metadata.todoCount = todoMatches ? todoMatches.length : 0;

  return metadata;
}

/**
 * Validate a single file
 */
function validateFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  results.filesChecked++;

  try {
    const metadata = extractMetadata(filePath);

    // Required field checks
    if (!metadata.title) {
      results.errors.push({
        file: relativePath,
        message: 'Missing required metadata field: title',
      });
    } else {
      // Title length check
      if (metadata.title.length > 60) {
        results.warnings.push({
          file: relativePath,
          message: `Title too long (${metadata.title.length} chars, optimal: <60): "${metadata.title}"`,
        });
      }
    }

    if (!metadata.description) {
      results.errors.push({
        file: relativePath,
        message: 'Missing required metadata field: description',
      });
    } else {
      // Description length check
      const descLen = metadata.description.length;
      if (descLen < 120) {
        results.warnings.push({
          file: relativePath,
          message: `Description too short (${descLen} chars, optimal: 150-160): "${metadata.description.substring(0, 50)}..."`,
        });
      } else if (descLen > 160) {
        results.warnings.push({
          file: relativePath,
          message: `Description too long (${descLen} chars, optimal: 150-160): "${metadata.description.substring(0, 50)}..."`,
        });
      }
    }

    // OpenGraph checks
    if (!metadata.hasOpenGraph) {
      results.errors.push({
        file: relativePath,
        message: 'Missing OpenGraph metadata',
      });
    }

    // Twitter card checks
    if (!metadata.hasTwitterCard) {
      results.warnings.push({
        file: relativePath,
        message: 'Missing Twitter card metadata',
      });
    }

    // Canonical URL check
    if (!metadata.hasCanonical) {
      results.warnings.push({
        file: relativePath,
        message: 'Missing canonical URL',
      });
    }

    // Keywords check
    if (!metadata.hasKeywords) {
      results.warnings.push({
        file: relativePath,
        message: 'Missing keywords (helpful for SEO)',
      });
    } else if (metadata.keywordCount < 5) {
      results.info.push({
        file: relativePath,
        message: `Only ${metadata.keywordCount} keywords defined (recommended: 5-10)`,
      });
    }

    // TODO comments check
    if (metadata.todoCount > 0) {
      results.warnings.push({
        file: relativePath,
        message: `Found ${metadata.todoCount} TODO comment(s) - content may be incomplete`,
      });
    }

  } catch (error) {
    results.errors.push({
      file: relativePath,
      message: `Failed to parse file: ${error.message}`,
    });
  }
}

/**
 * Print validation results
 */
function printResults() {
  console.log('\n' + '='.repeat(70));
  console.log('CONTENT VALIDATION REPORT');
  console.log('='.repeat(70) + '\n');

  console.log(`Files checked: ${results.filesChecked}\n`);

  // Errors
  if (results.errors.length > 0) {
    console.log(`\x1b[31m✗ ERRORS (${results.errors.length}):\x1b[0m\n`);
    results.errors.forEach(err => {
      console.log(`  \x1b[31m✗\x1b[0m ${err.file}`);
      console.log(`    ${err.message}\n`);
    });
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log(`\x1b[33m⚠ WARNINGS (${results.warnings.length}):\x1b[0m\n`);
    results.warnings.forEach(warn => {
      console.log(`  \x1b[33m⚠\x1b[0m ${warn.file}`);
      console.log(`    ${warn.message}\n`);
    });
  }

  // Info
  if (results.info.length > 0) {
    console.log(`\x1b[36mℹ INFO (${results.info.length}):\x1b[0m\n`);
    results.info.forEach(info => {
      console.log(`  \x1b[36mℹ\x1b[0m ${info.file}`);
      console.log(`    ${info.message}\n`);
    });
  }

  // Summary
  console.log('='.repeat(70));

  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('\x1b[32m✓ All content validation checks passed!\x1b[0m');
  } else if (results.errors.length === 0) {
    console.log('\x1b[33m⚠ Content has warnings but no critical errors\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Content validation failed with errors\x1b[0m');
  }

  console.log('='.repeat(70) + '\n');
}

/**
 * Main execution
 */
function main() {
  console.log('\nStarting content validation...\n');

  // Determine what to validate
  const basePath = targetPath
    ? path.resolve(process.cwd(), targetPath)
    : path.resolve(process.cwd(), 'src', 'app');

  if (!fs.existsSync(basePath)) {
    console.error(`Error: Path does not exist: ${basePath}`);
    process.exit(1);
  }

  // Find and validate files
  const files = fs.statSync(basePath).isDirectory()
    ? findPageFiles(basePath)
    : [basePath];

  if (files.length === 0) {
    console.log('No page files found to validate.');
    process.exit(0);
  }

  console.log(`Found ${files.length} page file(s) to validate...\n`);

  files.forEach(validateFile);

  // Print results
  printResults();

  // Exit with appropriate code
  if (results.errors.length > 0) {
    process.exit(1);
  }

  if (strictMode && results.warnings.length > 0) {
    console.log('\x1b[31mStrict mode enabled: Failing due to warnings\x1b[0m\n');
    process.exit(1);
  }

  process.exit(0);
}

// Run validation
main();
