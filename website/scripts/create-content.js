#!/usr/bin/env node

/**
 * Content Template Generator
 *
 * Usage:
 *   node scripts/create-content.js --type blog --slug my-post-title
 *   node scripts/create-content.js --type solution --slug hard-bugs --title "Resolve Hard Bugs"
 *   node scripts/create-content.js --type feature --slug deep-research
 *   node scripts/create-content.js --type comparison --slug cursor-vs-copilot
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : null;
};

const contentType = getArg('--type');
const slug = getArg('--slug');
const title = getArg('--title');

if (!contentType || !slug) {
  console.error('Error: Missing required arguments');
  console.log('\nUsage:');
  console.log('  node scripts/create-content.js --type <type> --slug <slug> [--title <title>]');
  console.log('\nTypes: blog, solution, feature, comparison');
  console.log('\nExamples:');
  console.log('  node scripts/create-content.js --type blog --slug my-post-title');
  console.log('  node scripts/create-content.js --type solution --slug hard-bugs --title "Resolve Hard Bugs"');
  process.exit(1);
}

// Helper to convert slug to title case
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper to generate page title based on type
function generatePageTitle(type, slug, customTitle) {
  if (customTitle) return customTitle;

  const baseTitle = slugToTitle(slug);

  switch(type) {
    case 'blog':
      return `${baseTitle} - PlanToCode`;
    case 'solution':
      return `${baseTitle} - PlanToCode`;
    case 'feature':
      return `${baseTitle} - PlanToCode`;
    case 'comparison':
      return `${baseTitle} Comparison - PlanToCode`;
    default:
      return `${baseTitle} - PlanToCode`;
  }
}

// Template generators
const templates = {
  blog: (slug, title) => `import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '${title}',
  description: 'TODO: Add compelling description (150-160 characters)',
  keywords: [
    // TODO: Add 5-10 relevant keywords
    'ai coding',
    'implementation planning',
  ],
  openGraph: {
    title: '${title}',
    description: 'TODO: Add OpenGraph description',
    type: 'article',
    publishedTime: '${new Date().toISOString()}',
    authors: ['PlanToCode Team'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '${title}',
    description: 'TODO: Add Twitter description',
  },
  alternates: {
    canonical: 'https://plantocode.com/blog/${slug}',
  },
};

export default function ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Page() {
  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1>${title}</h1>

          <p className="lead">
            TODO: Add compelling lead paragraph that hooks the reader.
          </p>

          <p>
            TODO: Add introduction explaining what this article covers and why it matters.
          </p>

          <GlassCard className="my-8">
            <h2>Quick Summary</h2>
            <ul>
              <li>TODO: Key point 1</li>
              <li>TODO: Key point 2</li>
              <li>TODO: Key point 3</li>
            </ul>
          </GlassCard>

          <h2>TODO: Section 1 Heading</h2>
          <p>
            TODO: Add content for section 1
          </p>

          <h2>TODO: Section 2 Heading</h2>
          <p>
            TODO: Add content for section 2
          </p>

          <div className="bg-primary/10 rounded-lg p-8 text-center my-12">
            <h3>Try PlanToCode</h3>
            <p className="mb-6">
              TODO: Add CTA description
            </p>
            <LinkWithArrow href="/downloads">Download PlanToCode Free</LinkWithArrow>
          </div>

          <div className="mt-12 border-t border-white/10 pt-8">
            <h3>Related Resources</h3>
            <ul>
              <li>
                <Link href="/features/plan-mode" className="text-primary hover:underline">
                  How Plan Mode Works
                </Link>
              </li>
              <li>
                <Link href="/features/deep-research" className="text-primary hover:underline">
                  Deep Research Feature
                </Link>
              </li>
            </ul>
          </div>
        </article>
      </main>
    </>
  );
}
`,

  solution: (slug, title) => `import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { AlertTriangle, ListChecks, TerminalSquare, FileSearch } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: '${title}',
  description: 'TODO: Add solution description (150-160 characters)',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: '${title}',
    description: 'TODO: Add OpenGraph description',
    url: 'https://www.plantocode.com/solutions/${slug}',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/${slug}',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/${slug}',
      'en': 'https://www.plantocode.com/solutions/${slug}',
    },
  },
};

export default function ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Page() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-500 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>TODO: Add category</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  ${title}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  TODO: Add compelling subtitle explaining the solution value proposition
                </p>
              </header>

              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileSearch className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">TODO: Benefit 1</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    TODO: Describe first key benefit
                  </p>
                  <LinkWithArrow href="/docs" className="text-sm mt-4">
                    Learn more
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ListChecks className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">TODO: Benefit 2</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    TODO: Describe second key benefit
                  </p>
                  <LinkWithArrow href="/docs" className="text-sm mt-4">
                    Learn more
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <TerminalSquare className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">TODO: Benefit 3</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    TODO: Describe third key benefit
                  </p>
                  <LinkWithArrow href="/docs" className="text-sm mt-4">
                    Learn more
                  </LinkWithArrow>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileSearch className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold">TODO: Benefit 4</h2>
                  </div>
                  <p className="text-foreground/70 leading-relaxed">
                    TODO: Describe fourth key benefit
                  </p>
                  <LinkWithArrow href="/docs" className="text-sm mt-4">
                    Learn more
                  </LinkWithArrow>
                </GlassCard>
              </div>

              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">TODO: Add CTA Heading</h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  TODO: Add compelling CTA description
                </p>
                <PlatformDownloadSection location="solutions_${slug.replace(/-/g, '_')}" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/plan-mode">
                    Explore features
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/docs">
                    Read documentation
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
`,

  feature: (slug, title) => `import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Search, Globe, Database, Brain, Zap, Shield, CheckCircle2 } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: '${title}',
  description: 'TODO: Add feature description (150-160 characters)',
  keywords: [
    // TODO: Add 5-10 relevant keywords
  ],
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: '${title}',
    description: 'TODO: Add OpenGraph description',
    url: 'https://www.plantocode.com/features/${slug}',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/${slug}',
    languages: {
      'en-US': 'https://www.plantocode.com/features/${slug}',
      'en': 'https://www.plantocode.com/features/${slug}',
    },
  },
};

export default function ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Page() {
  return (
    <React.Fragment>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Search className="w-4 h-4" />
                  <span>TODO: Add feature category</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  ${title}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  TODO: Add compelling subtitle
                </p>
              </div>

              {/* Core Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">TODO: Feature 1</h3>
                    <p className="text-foreground/80 text-sm">
                      TODO: Describe first core feature
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">TODO: Feature 2</h3>
                    <p className="text-foreground/80 text-sm">
                      TODO: Describe second core feature
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Shield className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">TODO: Feature 3</h3>
                    <p className="text-foreground/80 text-sm">
                      TODO: Describe third core feature
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">TODO: Add CTA Heading</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    TODO: Add compelling CTA description
                  </p>

                  <PlatformDownloadSection location="features_${slug.replace(/-/g, '_')}" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      See other features
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs">
                      Read documentation
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}
`,

  comparison: (slug, title) => `import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { CheckCircle2, X } from 'lucide-react';

export const metadata: Metadata = {
  title: '${title}',
  description: 'TODO: Add comparison description (150-160 characters)',
  keywords: [
    // TODO: Add comparison keywords
  ],
  openGraph: {
    title: '${title}',
    description: 'TODO: Add OpenGraph description',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: '${title}',
    description: 'TODO: Add Twitter description',
  },
  alternates: {
    canonical: 'https://plantocode.com/compare/${slug}',
  },
};

export default function ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Page() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-6xl">
          <article className="space-y-12">
            <header className="text-center space-y-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                ${title}
              </h1>
              <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                TODO: Add comparison introduction
              </p>
            </header>

            <GlassCard className="my-8">
              <h2 className="text-2xl font-bold mb-6">Quick Comparison</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-4">Feature</th>
                      <th className="text-center p-4">TODO: Tool A</th>
                      <th className="text-center p-4">TODO: Tool B</th>
                      <th className="text-center p-4">PlanToCode</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-4">TODO: Feature 1</td>
                      <td className="text-center p-4"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></td>
                      <td className="text-center p-4"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></td>
                      <td className="text-center p-4"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="p-4">TODO: Feature 2</td>
                      <td className="text-center p-4"><X className="w-5 h-5 text-red-500 mx-auto" /></td>
                      <td className="text-center p-4"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></td>
                      <td className="text-center p-4"><CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </GlassCard>

            <section>
              <h2 className="text-3xl font-bold mb-6">TODO: Section Heading</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">TODO: Tool A</h3>
                  <p className="text-foreground/80">TODO: Describe Tool A</p>
                </GlassCard>
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-4">TODO: Tool B</h3>
                  <p className="text-foreground/80">TODO: Describe Tool B</p>
                </GlassCard>
              </div>
            </section>

            <GlassCard className="p-8 sm:p-12 text-center" highlighted>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Try PlanToCode</h2>
              <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                TODO: Add CTA description
              </p>
              <PlatformDownloadSection location="compare_${slug.replace(/-/g, '_')}" />
            </GlassCard>
          </article>
        </main>
      </div>
    </>
  );
}
`,
};

// Generate content
const pageTitle = generatePageTitle(contentType, slug, title);
const template = templates[contentType];

if (!template) {
  console.error(`Error: Unknown content type "${contentType}"`);
  console.log('Valid types: blog, solution, feature, comparison');
  process.exit(1);
}

const content = template(slug, pageTitle);

// Determine output path
let outputPath;
switch(contentType) {
  case 'blog':
    outputPath = path.join(__dirname, '..', 'src', 'app', 'blog', slug, 'page.tsx');
    break;
  case 'solution':
    outputPath = path.join(__dirname, '..', 'src', 'app', 'solutions', slug, 'page.tsx');
    break;
  case 'feature':
    outputPath = path.join(__dirname, '..', 'src', 'app', 'features', slug, 'page.tsx');
    break;
  case 'comparison':
    outputPath = path.join(__dirname, '..', 'src', 'app', 'compare', slug, 'page.tsx');
    break;
}

// Create directory if it doesn't exist
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Write file
fs.writeFileSync(outputPath, content);

console.log('✓ Successfully created content file!');
console.log('');
console.log(`  Type: ${contentType}`);
console.log(`  Slug: ${slug}`);
console.log(`  File: ${outputPath}`);
console.log('');
console.log('Next steps:');
console.log('  1. Open the file and replace all TODO comments');
console.log('  2. Add relevant keywords to metadata');
console.log('  3. Run validation: node scripts/validate-content.js');
console.log('  4. Test locally: npm run dev');
console.log('');
console.log(`  View at: http://localhost:3000/${contentType === 'blog' ? 'blog' : contentType === 'solution' ? 'solutions' : contentType === 'feature' ? 'features' : 'compare'}/${slug}`);
