#!/usr/bin/env node

/**
 * Generate comparison pages from comparisons.json
 * Usage: node scripts/generate-comparison-pages.js
 */

const fs = require('fs');
const path = require('path');

// Load comparisons data
const comparisonsPath = path.join(__dirname, '../src/data/pseo/comparisons.json');
const comparisonsData = JSON.parse(fs.readFileSync(comparisonsPath, 'utf8'));

// Template function to generate page content
function generatePageContent(comparison) {
  const { slug, competitor, headline, subhead, meta_title, meta_description, primary_cta, comparison_table, pain_points, workflow_steps } = comparison;

  // Escape single quotes in strings for JSX
  const escapedTitle = meta_title.replace(/'/g, "\\'");
  const escapedDescription = meta_description.replace(/'/g, "\\'");
  const escapedHeadline = headline.replace(/'/g, "\\'");
  const escapedSubhead = subhead.replace(/'/g, "\\'");
  const escapedCta = (primary_cta || 'Try PlanToCode Today').replace(/'/g, "\\'");

  // Generate comparison table rows
  const tableRows = comparison_table.features.map(feature => {
    return `                  <tr className="border-b border-foreground/10">
                    <td className="p-2">${feature.name}</td>
                    <td className="p-2">${feature.plantocode}</td>
                    <td className="p-2">${feature.competitor}</td>
                  </tr>`;
  }).join('\n');

  // Generate pain points section
  const painPointsSection = pain_points ? `
          <h2 className="text-3xl font-bold mt-12 mb-6">Key Pain Points Solved</h2>

          ${pain_points.map(point => `
          <GlassCard className="my-6 bg-yellow-500/10 border-yellow-500/20">
            <h3 className="text-xl font-semibold mb-2">Problem: ${point.problem}</h3>
            <p className="text-foreground/80">
              <strong>Solution:</strong> ${point.solution}
            </p>
          </GlassCard>`).join('\n')}` : '';

  // Generate workflow steps section
  const workflowSection = workflow_steps ? `
          <h2 className="text-3xl font-bold mt-12 mb-6">Comparison Workflow</h2>

          <GlassCard className="my-6">
            <ol className="space-y-3">
              ${workflow_steps.map((step, idx) => `<li><strong>${idx + 1}. ${step}</strong></li>`).join('\n              ')}
            </ol>
          </GlassCard>` : '';

  return `import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import { ComparisonPageClient } from '@/components/compare/ComparisonPageClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${escapedTitle}',
  description: '${escapedDescription}',
  keywords: [
    '${competitor}',
    'plantocode vs ${competitor}',
    '${competitor} alternative',
    'ai code planning',
    'implementation planning',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/compare/${slug}',
    languages: {
      'en-US': 'https://www.plantocode.com/compare/${slug}',
      'en': 'https://www.plantocode.com/compare/${slug}',
      'x-default': 'https://www.plantocode.com/compare/${slug}',
    },
  },
  openGraph: {
    title: '${escapedTitle}',
    description: '${escapedDescription}',
    url: 'https://www.plantocode.com/compare/${slug}',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function ComparisonPage() {
  return (
    <ComparisonPageClient>
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            ${escapedHeadline}
          </h1>

          <p className="text-xl text-foreground/80 mb-8">
            ${escapedSubhead}
          </p>

          <GlassCard className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Feature Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Feature</th>
                    <th className="text-left p-2">PlanToCode</th>
                    <th className="text-left p-2">${competitor.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</th>
                  </tr>
                </thead>
                <tbody>
${tableRows}
                </tbody>
              </table>
            </div>
          </GlassCard>
${painPointsSection}
${workflowSection}

          <h2 className="text-3xl font-bold mt-12 mb-6">Why Choose PlanToCode?</h2>

          <p>
            PlanToCode takes a <strong>planning-first approach</strong> to AI-assisted development.
            Instead of generating code immediately, we help you create detailed implementation plans
            that you can review, edit, and approve before execution.
          </p>

          <GlassCard className="my-6">
            <h3 className="text-xl font-semibold mb-4">The Planning-First Workflow</h3>
            <ol className="space-y-2">
              <li><strong>1. Describe your goal</strong> - Use natural language or voice input</li>
              <li><strong>2. AI generates implementation plan</strong> - File-by-file breakdown with exact paths</li>
              <li><strong>3. Review and refine</strong> - Edit the plan, catch issues early</li>
              <li><strong>4. Execute with confidence</strong> - Hand off to your preferred tool (Claude Code, Cursor, etc.)</li>
            </ol>
          </GlassCard>

          <h2 className="text-3xl font-bold mt-12 mb-6">When to Use Each Tool</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-4">Use PlanToCode When:</h3>
              <ul className="space-y-2">
                <li>• Working in large/complex codebases</li>
                <li>• Need to review changes before execution</li>
                <li>• Want to prevent duplicate files and wrong paths</li>
                <li>• Require approval workflows for teams</li>
                <li>• Working across multiple AI models</li>
              </ul>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-semibold mb-4">Use ${competitor.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} When:</h3>
              <ul className="space-y-2">
                <li>• Need immediate code generation</li>
                <li>• Working on smaller projects</li>
                <li>• Comfortable with direct execution</li>
                <li>• Prefer integrated development environment</li>
              </ul>
            </GlassCard>
          </div>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">${escapedCta}</h3>
            <p className="text-foreground/80 mb-6">
              Experience the planning-first approach to AI-assisted development
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Download PlanToCode
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs"
                className="inline-flex items-center"
              >
                View Documentation
              </LinkWithArrow>
            </div>
          </div>

          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Last updated:</strong> November 2025. This comparison is based on publicly available
            information and hands-on testing. Both tools serve different purposes and can complement
            each other in a comprehensive development workflow.
          </p>
        </article>
      </main>
    </ComparisonPageClient>
  );
}
`;
}

// Generate all comparison pages
let created = 0;
let skipped = 0;

comparisonsData.pages.forEach(comparison => {
  if (!comparison.publish) {
    console.log(`⏭️  Skipping ${comparison.slug} (publish: false)`);
    skipped++;
    return;
  }

  const pagePath = path.join(__dirname, '../src/app/compare', comparison.slug, 'page.tsx');
  const pageDir = path.dirname(pagePath);

  // Check if page already exists
  if (fs.existsSync(pagePath)) {
    console.log(`⚠️  Skipping ${comparison.slug} (already exists)`);
    skipped++;
    return;
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(pageDir)) {
    fs.mkdirSync(pageDir, { recursive: true });
  }

  // Generate and write page content
  const content = generatePageContent(comparison);
  fs.writeFileSync(pagePath, content, 'utf8');

  console.log(`✅ Created ${comparison.slug}`);
  created++;
});

console.log(`\n📊 Summary:`);
console.log(`   Created: ${created} pages`);
console.log(`   Skipped: ${skipped} pages`);
console.log(`\n✨ Done! Run 'pnpm build' to verify the pages.`);
