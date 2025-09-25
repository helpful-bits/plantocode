// Import all category JSONs
import workflows from './workflows.json';
import integrations from './integrations.json';
import comparisons from './comparisons.json';
import stacks from './stacks.json';
import useCases from './use-cases.json';
import features from './features.json';

// Define the page interface
export interface PseoPage {
  slug: string;
  category?: string;
  headline: string;
  subhead: string;
  meta_title: string;
  meta_description: string;
  primary_cta: string;
  publish: boolean;
  priority: number;
  pain_points?: Array<{
    problem: string;
    solution: string;
  }>;
  workflow_steps?: string[];
  key_features?: string[];
  comparison_table?: {
    features: Array<{
      name: string;
      vibe_manager: string;
      competitor: string;
    }>;
  };
  // Optional metadata fields
  tool_integration?: string;
  os?: string;
  language?: string;
  framework?: string;
  workflow?: string;
  role?: string;
  feature?: string;
  use_case?: string;
  competitor?: string;
}

// Combine all pages and add category from parent
const allPages: PseoPage[] = [
  ...workflows.pages.map(page => ({ ...page, category: workflows.category })),
  ...integrations.pages.map(page => ({ ...page, category: integrations.category })),
  ...comparisons.pages.map(page => ({ ...page, category: comparisons.category })),
  ...stacks.pages.map(page => ({ ...page, category: stacks.category })),
  ...useCases.pages.map(page => ({ ...page, category: useCases.category })),
  ...features.pages.map(page => ({ ...page, category: features.category })),
];

// Export the combined data structure (compatible with existing code)
export const pseoData = {
  pages: allPages,
  metadata: {
    version: "2.0.0",
    last_updated: new Date().toISOString().split('T')[0],
    total_pages: allPages.length,
    published_pages: allPages.filter(p => p.publish === true).length,
    categories: ['workflows', 'integrations', 'stacks', 'comparisons', 'use-cases', 'features']
  }
};

// Export category-specific getters for targeted loading
export const getPagesByCategory = (category: string): PseoPage[] => {
  return allPages.filter(page => page.category === category);
};

export const getPublishedPages = (): PseoPage[] => {
  return allPages.filter(page => page.publish === true);
};

export const getPageBySlug = (slug: string): PseoPage | undefined => {
  return allPages.find(page => page.slug === slug);
};

// Export individual categories for direct access
export { workflows, integrations, comparisons, stacks, useCases, features };

// Default export for backward compatibility
export default pseoData;