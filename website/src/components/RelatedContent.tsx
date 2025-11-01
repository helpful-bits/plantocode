import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { getPublishedPages, type PseoPage } from '@/data/pseo';

interface RelatedContentProps {
  currentSlug?: string;
  category?: string;
  tool_integration?: string;
  os?: string;
  language?: string;
  framework?: string;
  workflow?: string;
  maxItems?: number;
  title?: string;
  description?: string;
}

/**
 * RelatedContent component - displays contextually related pages
 * Uses smart filtering to show the most relevant content based on shared attributes
 */
export function RelatedContent({
  currentSlug,
  category,
  tool_integration,
  os,
  language,
  framework,
  workflow,
  maxItems = 6,
  title = 'Related Content',
  description,
}: RelatedContentProps) {
  const allPages = getPublishedPages();

  // Filter and score related pages
  const relatedPages = allPages
    .filter(page => page.slug !== currentSlug) // Exclude current page
    .map(page => {
      let score = 0;

      // Same category: highest priority
      if (category && page.category === category) score += 10;

      // Same tool integration
      if (tool_integration && page.tool_integration === tool_integration) score += 8;

      // Same workflow
      if (workflow && page.workflow === workflow) score += 7;

      // Same language/framework
      if (language && page.language === language) score += 6;
      if (framework && page.framework === framework) score += 6;

      // Same OS
      if (os && page.os === os) score += 5;

      // Complementary relationships
      if (category === 'workflows' && page.category === 'integrations') score += 4;
      if (category === 'integrations' && page.category === 'workflows') score += 4;
      if (category === 'stacks' && page.category === 'workflows') score += 3;
      if (category === 'use-cases' && page.category === 'workflows') score += 3;

      return { page, score };
    })
    .filter(({ score }) => score > 0) // Only pages with some relevance
    .sort((a, b) => {
      // Sort by score, then by priority
      if (b.score !== a.score) return b.score - a.score;
      return a.page.priority - b.page.priority;
    })
    .slice(0, maxItems)
    .map(({ page }) => page);

  // Don't render if no related content
  if (relatedPages.length === 0) return null;

  return (
    <section className="py-12">
      <div className="mb-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">{title}</h2>
        {description && (
          <p className="text-foreground/70 max-w-2xl mx-auto">{description}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {relatedPages.map((page) => (
          <GlassCard key={page.slug} className="p-6 flex flex-col">
            <div className="mb-2">
              {/* Category badge */}
              <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium capitalize">
                {page.category?.replace('-', ' ')}
              </span>
            </div>

            <h3 className="font-semibold mb-2 text-lg line-clamp-2">
              {page.headline}
            </h3>

            <p className="text-sm text-foreground/70 mb-4 line-clamp-3 flex-grow">
              {page.subhead}
            </p>

            {/* Tool/OS badges if applicable */}
            <div className="flex flex-wrap gap-2 mb-4">
              {page.tool_integration && (
                <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-500">
                  {page.tool_integration}
                </span>
              )}
              {page.os && (
                <span className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-500">
                  {page.os}
                </span>
              )}
              {page.language && (
                <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-500">
                  {page.language}
                </span>
              )}
            </div>

            <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
              Learn more
            </LinkWithArrow>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

/**
 * Specific variant for solution pages
 */
export function RelatedSolutions({
  currentSlug,
  maxItems = 3,
}: {
  currentSlug?: string;
  maxItems?: number;
}) {
  return (
    <RelatedContent
      currentSlug={currentSlug}
      category="workflows"
      maxItems={maxItems}
      title="Related Solutions"
      description="Explore more ways PlanToCode solves complex development challenges"
    />
  );
}

/**
 * Specific variant for feature pages
 */
export function RelatedFeatures({
  currentSlug,
  maxItems = 4,
}: {
  currentSlug?: string;
  maxItems?: number;
}) {
  return (
    <RelatedContent
      currentSlug={currentSlug}
      category="features"
      maxItems={maxItems}
      title="Related Features"
      description="Discover more powerful capabilities that work together"
    />
  );
}
