import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Deep research - PlanToCode',
  description:
    'Technical documentation for the web search workflow: API integration, query optimization, result processing, and development workflow integration.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/deep-research',
  },
  openGraph: {
    title: 'Deep research - PlanToCode',
    description:
      'Understand how web search operates within PlanToCode: from query generation to result processing and integration with development workflows.',
    url: 'https://www.plantocode.com/docs/deep-research',
    siteName: 'PlanToCode',
    type: 'article',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Deep research - PlanToCode',
  description:
    'Technical documentation for the web search feature, including architecture, workflow stages, API integration, and best practices.',
};

export default function DeepResearchDocPage() {
  return (
    <>
      <StructuredData data={structuredData} />

      <DocsArticle
        title="Deep Research & Web Search"
        description="How PlanToCode performs web searches, processes results, and integrates findings into development workflows."
        date="2025-09-20"
        readTime="8 min"
        category="Technical Reference"
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          The Deep Research feature enables PlanToCode to perform intelligent web searches, gather up-to-date information,
          and integrate findings directly into development workflows. This system combines query optimization, result processing,
          and contextual integration to enhance code generation and problem-solving capabilities.
        </p>

        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">Architecture Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            The web search system operates as a pipeline: query generation, search execution, result processing, and integration.
            Each stage is designed for reliability, cost efficiency, and contextual relevance. The architecture supports
            both standalone research tasks and integrated development workflows.
          </p>
        </GlassCard>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Search Workflow Stages</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Query Generation & Optimization</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Search queries are automatically generated based on the current development context, user intent, and task requirements.
              The system analyzes project files, active discussions, and error messages to formulate targeted search queries that
              prioritize recent documentation, technical discussions, and authoritative sources.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Query Types</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• API documentation searches for specific libraries or frameworks</li>
                <li>• Error message resolution and troubleshooting guides</li>
                <li>• Best practices and implementation patterns</li>
                <li>• Version compatibility and migration information</li>
                <li>• Security advisories and vulnerability reports</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Search Execution</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Web searches are performed through integrated search APIs that prioritize developer-focused content. The system
              automatically filters results to focus on technical documentation, official sources, and community discussions
              from platforms like GitHub, Stack Overflow, and official project documentation.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Search Sources</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Official project documentation and wikis</li>
                <li>• GitHub repositories, issues, and discussions</li>
                <li>• Technical forums and community Q&A sites</li>
                <li>• Blog posts from recognized technical authorities</li>
                <li>• Release notes and changelogs</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Result Processing & Filtering</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Search results undergo intelligent processing to extract relevant information, remove noise, and prioritize
              content based on recency, authority, and contextual relevance. The system converts web content into structured
              data that can be efficiently integrated into development workflows.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Processing Steps</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Content extraction and HTML-to-markdown conversion</li>
                <li>• Relevance scoring based on query match and source authority</li>
                <li>• Duplicate detection and content deduplication</li>
                <li>• Timestamp analysis for content freshness</li>
                <li>• Code snippet extraction and syntax validation</li>
              </ul>
            </div>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">API Integration Details</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Search Provider Configuration</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The system integrates with multiple search providers to ensure comprehensive coverage and redundancy. Provider
              selection is automatic based on query type, geographic restrictions, and availability. API keys and rate limiting
              are managed transparently within the application configuration.
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// Search provider configuration
{
  "providers": {
    "primary": {
      "name": "web_search_api",
      "rate_limit": "100/hour",
      "geographic_restrictions": ["US"]
    },
    "fallback": {
      "name": "secondary_provider",
      "rate_limit": "50/hour"
    }
  },
  "query_optimization": {
    "max_results": 10,
    "filter_domains": ["stackoverflow.com", "github.com"],
    "exclude_domains": ["spam-sites.com"]
  }
}`}</code></pre>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Content Processing Pipeline</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Retrieved content passes through a standardized processing pipeline that extracts meaningful information while
              preserving formatting and context. The pipeline handles various content types including documentation, code
              repositories, and technical discussions.
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// Content processing flow
interface SearchResult {
  url: string;
  title: string;
  content: string;
  metadata: {
    source_type: 'documentation' | 'forum' | 'repository' | 'blog';
    last_updated: Date;
    authority_score: number;
    code_snippets: CodeSnippet[];
  };
  relevance_score: number;
}`}</code></pre>
            </div>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Development Workflow Integration</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Context-Aware Research</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Research requests are automatically enhanced with context from the current development session. The system
              analyzes open files, recent changes, error messages, and project dependencies to formulate more targeted
              search queries and filter results for maximum relevance.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Result Integration</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Search results are seamlessly integrated into the development workflow. Code snippets can be directly inserted,
              documentation links are preserved for reference, and key findings are summarized in context-appropriate formats.
              The integration respects existing code style and project conventions.
            </p>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Caching and Performance</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Search results are intelligently cached to improve performance and reduce API costs. The caching system
              considers content freshness, query similarity, and usage patterns to provide fast responses while ensuring
              information accuracy. Cache invalidation occurs automatically based on content age and relevance decay.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Configuration and Customization</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Search Preferences</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Users can customize search behavior through preference settings that control result filtering, source prioritization,
              and integration depth. These settings are project-aware and can be configured per workspace to match team
              preferences and project requirements.
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">Configurable Options</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Preferred documentation sources and authorities</li>
                <li>• Language and framework-specific search filters</li>
                <li>• Result count and processing depth limits</li>
                <li>• Automatic vs. manual search trigger modes</li>
                <li>• Integration patterns for different file types</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Project-Specific Settings</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Search configuration can be tailored to specific projects and technologies. The system automatically detects
              project frameworks, languages, and dependencies to optimize search parameters. Custom domain filters and
              source preferences can be configured per project to ensure relevant results.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Cost Considerations and Limits</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Rate Limiting and Quotas</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The system implements intelligent rate limiting to manage API costs while ensuring search functionality remains
              available when needed. Rate limits are applied per user, per project, and globally, with automatic fallback
              to cached results when limits are approached.
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Rate Limit Guidelines</h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <li>• Personal usage: 100 searches per hour, 1000 per day</li>
                <li>• Team workspaces: Shared quotas based on subscription tier</li>
                <li>• Automatic throttling when approaching limits</li>
                <li>• Cache-first responses to minimize API calls</li>
              </ul>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Cost Optimization</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Multiple strategies are employed to optimize search costs without compromising functionality. These include
              intelligent query batching, result caching, provider fallbacks, and user education about efficient search
              patterns. Cost monitoring and alerting help teams stay within budget limits.
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Best Practices and Examples</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Effective Search Strategies</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              To maximize the value of web search integration, follow these proven strategies for formulating queries,
              interpreting results, and integrating findings into your development workflow.
            </p>
            <div className="space-y-4 mt-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Query Formulation</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Include specific version numbers when relevant</li>
                  <li>• Combine library names with specific error messages</li>
                  <li>• Use "best practices" or "recommended approach" for pattern searches</li>
                  <li>• Include platform or environment constraints</li>
                </ul>
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Result Evaluation</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Prioritize official documentation over third-party sources</li>
                  <li>• Check publication dates for time-sensitive information</li>
                  <li>• Verify code examples in your development environment</li>
                  <li>• Cross-reference solutions across multiple sources</li>
                </ul>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Integration Examples</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Common integration patterns demonstrate how web search results enhance different development scenarios, from
              debugging specific errors to implementing new features with unfamiliar APIs.
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// Example: API integration research
Search query: "Next.js 14 app router middleware authentication"
Results integrated as:
- Middleware setup code with current best practices
- Authentication flow documentation links
- Common pitfalls and troubleshooting tips
- Compatible library recommendations`}</code></pre>
            </div>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">Troubleshooting and Support</h2>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Common Issues</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Most web search issues stem from connectivity problems, rate limiting, or overly broad queries. The system
              provides clear error messages and suggested remediation steps for common failure scenarios.
            </p>
            <div className="space-y-3 mt-4">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Rate Limit Exceeded</h4>
                <p className="text-sm text-red-700 dark:text-red-300">Wait for reset period or try cached results</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">No Results Found</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">Broaden query terms or check spelling</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">Geographic Restrictions</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">Search functionality limited to supported regions</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">Performance Optimization</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              For optimal performance, the system monitors search patterns and suggests optimizations. This includes query
              refinement recommendations, cache hit rate improvements, and integration efficiency metrics.
            </p>
          </GlassCard>
        </section>

        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">Ready to use Deep Research?</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              The Deep Research and Web Search features are available in the PlanToCode desktop application. Download
              the build for your platform to start integrating web research into your development workflow.
            </p>
            <PlatformDownloadSection location="docs_deep_research" />
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}