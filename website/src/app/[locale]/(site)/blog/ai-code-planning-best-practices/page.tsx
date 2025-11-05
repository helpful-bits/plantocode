import { BlogArticle } from '@/components/blog/BlogArticle';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import type { Metadata } from 'next';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'AI Code Planning Best Practices 2025 - Workflow Guide',
  description: 'Master AI code planning with proven best practices: multi-model planning, dependency mapping, review checklists, and team workflows for production codebases.',
  keywords: [
    'ai code planning best practices',
    'ai code planning',
    'ai coding best practices',
    'ai development workflow',
    'implementation planning',
    'ai code review',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/blog/ai-code-planning-best-practices',
    languages: {
      'en-US': 'https://www.plantocode.com/blog/ai-code-planning-best-practices',
      'en': 'https://www.plantocode.com/blog/ai-code-planning-best-practices',
      'x-default': 'https://www.plantocode.com/blog/ai-code-planning-best-practices',
    },
  },
  openGraph: {
    title: 'AI Code Planning Best Practices 2025 - Workflow Guide',
    description: 'Master AI code planning with proven best practices: multi-model planning, dependency mapping, review checklists for production code.',
    url: 'https://www.plantocode.com/blog/ai-code-planning-best-practices',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Code Planning Best Practices',
    }],
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function AICodePlanningBestPracticesPage() {
  return (
    <BlogArticle
      title="AI Code Planning Best Practices (2025)"
      description="AI can generate implementation plans in seconds. But a bad plan executed perfectly is still a disaster. Here are the proven best practices for AI code planning in production environments."
      date="2025-11-02"
      readTime="15 min"
      category="Best Practices"
      author="PlanToCode Team"
    >

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h2 className="text-2xl font-bold mb-4">Quick Reference</h2>
            <ul className="space-y-1 mb-0">
              <li>✓ Always use multi-model planning (Claude + GPT-4 + Gemini)</li>
              <li>✓ Run dependency mapping before generating plans</li>
              <li>✓ Use plan review checklists for consistency</li>
              <li>✓ Version control plans alongside code</li>
              <li>✓ Measure plan quality with post-execution audits</li>
            </ul>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">1. Multi-Model Planning Strategy</h2>

          <p>
            <strong>Single-model planning is risky.</strong> Each AI model has blind spots. Claude might miss performance
            implications. GPT-4 might overlook edge cases. Gemini might suggest outdated patterns.
          </p>

          <div className="my-8">
            <h3 className="text-xl font-semibold mb-4">Best Practice: Generate 3 Plans, Merge the Best</h3>
            <ol className="space-y-3 mb-0">
              <li>
                <strong>1. Generate from Claude Sonnet 4</strong>
                <p className="text-sm text-foreground/80">Strong at architectural reasoning and dependency analysis</p>
              </li>
              <li>
                <strong>2. Generate from GPT-4</strong>
                <p className="text-sm text-foreground/80">Excellent at covering edge cases and error handling</p>
              </li>
              <li>
                <strong>3. Generate from Gemini Pro</strong>
                <p className="text-sm text-foreground/80">Good at suggesting modern patterns and optimizations</p>
              </li>
              <li>
                <strong>4. Compare and merge</strong>
                <p className="text-sm text-foreground/80">Take the architectural structure from Claude, edge case handling from GPT-4,
                and optimization insights from Gemini</p>
              </li>
            </ol>
          </div>

          <p className="mt-6">
            <strong>Example:</strong> For "migrate REST API to GraphQL," Claude identified 47 affected files, GPT-4
            caught schema validation edge cases Claude missed, and Gemini suggested caching optimizations neither mentioned.
            The merged plan was 30% more complete.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">2. Dependency Mapping Before Planning</h2>

          <p>
            Never generate a plan without understanding file dependencies first. AI hallucinates less when given context.
          </p>

          <blockquote className="border-l-4 border-yellow-500 bg-yellow-500/5 rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-3">⚠️ Common Mistake: Planning Without Context</h3>
            <p className="text-sm mb-2">
              <strong>Bad workflow:</strong> Ask AI "Refactor authentication" → AI generates plan → Missing 12 files
            </p>
            <p className="text-sm">
              <strong>Good workflow:</strong> Run file discovery for "authentication" → AI sees all 47 auth-related files
              → Generates complete plan
            </p>
          </blockquote>

          <div className="my-8">
            <h3 className="text-xl font-semibold mb-4">File Discovery Checklist</h3>
            <ul className="space-y-2">
              <li>☐ Search for function/class names being modified</li>
              <li>☐ Find all import statements referencing target files</li>
              <li>☐ Identify type definitions and interfaces used</li>
              <li>☐ Locate test files for affected code</li>
              <li>☐ Check for environment-specific config files</li>
            </ul>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">3. Plan Review Checklist</h2>

          <p>
            Every plan needs review before execution. Use a systematic checklist to catch common issues.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Essential Plan Review Questions</h3>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-primary mb-2">📂 File Coverage</h4>
                <ul className="text-sm space-y-1">
                  <li>☐ Are all affected files included?</li>
                  <li>☐ Did AI miss test files?</li>
                  <li>☐ Are config files (e.g., <code>.env</code>, <code>tsconfig.json</code>) updated if needed?</li>
                  <li>☐ Do file paths use correct casing for the OS?</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-primary mb-2">🔗 Dependencies</h4>
                <ul className="text-sm space-y-1">
                  <li>☐ Are import statements correctly updated?</li>
                  <li>☐ Will type changes break downstream consumers?</li>
                  <li>☐ Are circular dependencies introduced?</li>
                  <li>☐ Does execution order prevent intermediate broken states?</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-primary mb-2">⚠️ Edge Cases</h4>
                <ul className="text-sm space-y-1">
                  <li>☐ How does the plan handle error conditions?</li>
                  <li>☐ What happens if external services fail?</li>
                  <li>☐ Are null/undefined cases covered?</li>
                  <li>☐ Is backwards compatibility maintained if needed?</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-primary mb-2">🧪 Testing</h4>
                <ul className="text-sm space-y-1">
                  <li>☐ Are existing tests updated to match changes?</li>
                  <li>☐ Do new features have corresponding tests?</li>
                  <li>☐ Are integration tests affected?</li>
                  <li>☐ Does the plan specify test execution order?</li>
                </ul>
              </div>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">4. Version Control for Plans</h2>

          <p>
            Treat implementation plans as code. Check them into version control for traceability.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Plan Versioning Workflow</h3>
            <div className="bg-foreground/5 rounded-lg p-4 font-mono text-sm">
              <div className="mb-2"># Create plan directory</div>
              <div className="mb-2">mkdir -p plans/2025-11-refactor-auth</div>
              <div className="mb-4">cd plans/2025-11-refactor-auth</div>

              <div className="mb-2"># Save generated plans</div>
              <div className="mb-2">plantocode generate --model claude &gt; plan-claude.md</div>
              <div className="mb-2">plantocode generate --model gpt4 &gt; plan-gpt4.md</div>
              <div className="mb-4">plantocode generate --model gemini &gt; plan-gemini.md</div>

              <div className="mb-2"># Create merged final plan</div>
              <div className="mb-4">vi plan-final.md</div>

              <div className="mb-2"># Commit to version control</div>
              <div className="mb-2">git add plans/</div>
              <div>git commit -m "Add auth refactoring plan"</div>
            </div>
          </div>

          <p className="mt-6">
            <strong>Benefits:</strong> Audit trail for team review, rollback capability if plans fail,
            historical reference for similar tasks later.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">5. Incremental Planning for Large Changes</h2>

          <p>
            Don't try to plan a 6-month migration in one shot. Break it into weekly milestones.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Example: Monolith to Microservices Migration</h3>

            <div className="space-y-3">
              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Week 1 Plan:</strong> Extract user service interface
                <p className="text-sm text-foreground/80 mt-1">Files: 12 | Risk: Low | Rollback: Easy</p>
              </div>

              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Week 2 Plan:</strong> Migrate authentication to new service
                <p className="text-sm text-foreground/80 mt-1">Files: 24 | Risk: Medium | Depends on Week 1</p>
              </div>

              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Week 3 Plan:</strong> Deploy user service, switch traffic
                <p className="text-sm text-foreground/80 mt-1">Files: 8 | Risk: High | Feature flag required</p>
              </div>
            </div>
          </div>

          <p className="mt-6">
            Each week gets its own plan, review cycle, and execution. If Week 2 fails, Week 1 is already stable.
          </p>

          <h2 className="text-3xl font-bold mt-12 mb-6">6. Plan Quality Metrics</h2>

          <p>
            Measure plan quality to improve your process. Track these metrics after execution:
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Post-Execution Audit Questions</h3>
            <ul className="space-y-2 mb-0">
              <li>✓ <strong>Completeness:</strong> Did the plan include all files that needed modification?</li>
              <li>✓ <strong>Accuracy:</strong> Were the suggested changes correct, or did you need to deviate significantly?</li>
              <li>✓ <strong>Edge Cases:</strong> Did execution uncover cases the plan didn't mention?</li>
              <li>✓ <strong>Test Coverage:</strong> Did test updates match actual code changes?</li>
              <li>✓ <strong>Execution Time:</strong> How long did it take vs plan estimate?</li>
            </ul>
          </div>

          <div className="my-8">
            <h4 className="font-semibold mb-3">Example Quality Tracking</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Task</th>
                    <th className="text-left p-2">Completeness</th>
                    <th className="text-left p-2">Accuracy</th>
                    <th className="text-left p-2">Issues</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">2025-11-01</td>
                    <td className="p-2">Auth refactor</td>
                    <td className="p-2">95% (missed 2 test files)</td>
                    <td className="p-2">90%</td>
                    <td className="p-2">1 edge case</td>
                  </tr>
                  <tr className="border-b border-foreground/10">
                    <td className="p-2">2025-11-05</td>
                    <td className="p-2">GraphQL migration</td>
                    <td className="p-2">100%</td>
                    <td className="p-2">85%</td>
                    <td className="p-2">3 type errors</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">7. Team Collaboration on Plans</h2>

          <p>
            In team environments, plans need review from multiple perspectives: architecture, security, testing, ops.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Team Review Workflow</h3>
            <ol className="space-y-3 mb-0">
              <li>
                <strong>1. Engineer generates plan</strong>
                <p className="text-sm text-foreground/80">Uses multi-model approach, runs dependency mapping</p>
              </li>
              <li>
                <strong>2. Self-review with checklist</strong>
                <p className="text-sm text-foreground/80">Catches obvious issues before team review</p>
              </li>
              <li>
                <strong>3. Peer review (async)</strong>
                <p className="text-sm text-foreground/80">Teammate checks for missed files, architectural concerns</p>
              </li>
              <li>
                <strong>4. Security/ops review (if high-risk)</strong>
                <p className="text-sm text-foreground/80">For auth changes, DB migrations, API modifications</p>
              </li>
              <li>
                <strong>5. Approval and execution</strong>
                <p className="text-sm text-foreground/80">Plan marked approved, engineer proceeds with implementation</p>
              </li>
            </ol>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">8. Common Pitfalls to Avoid</h2>

          <div className="grid md:grid-cols-2 gap-6 my-8">
            <div className="bg-red-500/10 border-l-4 border-red-500 rounded-r-lg p-4">
              <h3 className="text-lg font-semibold mb-2">❌ Trusting First Draft</h3>
              <p className="text-sm">
                AI plans are starting points, not gospel. Always review and refine before execution.
              </p>
            </div>

            <div className="bg-red-500/10 border-l-4 border-red-500 rounded-r-lg p-4">
              <h3 className="text-lg font-semibold mb-2">❌ Skipping Dependency Mapping</h3>
              <p className="text-sm">
                Plans without file discovery context miss 20-40% of affected files. Always map first.
              </p>
            </div>

            <div className="bg-red-500/10 border-l-4 border-red-500 rounded-r-lg p-4">
              <h3 className="text-lg font-semibold mb-2">❌ Planning Too Far Ahead</h3>
              <p className="text-sm">
                Long-term plans become outdated as codebases evolve. Plan 1-2 weeks max, iterate.
              </p>
            </div>

            <div className="bg-red-500/10 border-l-4 border-red-500 rounded-r-lg p-4">
              <h3 className="text-lg font-semibold mb-2">❌ Ignoring Plan Metrics</h3>
              <p className="text-sm">
                Track plan quality post-execution. Improve your prompts and review process over time.
              </p>
            </div>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">9. Advanced: Conditional Planning</h2>

          <p>
            Some tasks have multiple valid approaches. Generate conditional plans for different scenarios.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Example: Database Migration</h3>
            <div className="space-y-3">
              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Plan A: Zero-Downtime Migration</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Dual-write to old and new schema, gradual cutover, 2-week timeline
                </p>
              </div>

              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Plan B: Maintenance Window</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  4-hour downtime, direct migration, simpler but requires user communication
                </p>
              </div>

              <div className="bg-foreground/5 rounded-lg p-3">
                <strong>Plan C: Shadow Mode Testing</strong>
                <p className="text-sm text-foreground/80 mt-1">
                  Run new schema in parallel for 1 week, verify correctness, then cut over
                </p>
              </div>
            </div>
            <p className="text-sm text-foreground/80 mt-4">
              Team reviews all 3 plans, chooses Plan C for production safety. Plans A and B kept as fallback options.
            </p>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">10. Continuous Improvement</h2>

          <p>
            AI code planning is a skill. The more you practice, the better your plans become.
          </p>

          <div className="bg-primary/5 border-l-4 border-primary rounded-r-lg p-6 my-8">
            <h3 className="text-xl font-semibold mb-4">Monthly Planning Retrospective</h3>
            <ul className="space-y-2 mb-0">
              <li>✓ Review last month's plans: which were accurate, which missed things?</li>
              <li>✓ Identify patterns in plan failures (e.g., always miss test files)</li>
              <li>✓ Update your review checklist based on learnings</li>
              <li>✓ Share insights with the team, improve collective process</li>
            </ul>
          </div>

          <h2 className="text-3xl font-bold mt-12 mb-6">Conclusion</h2>

          <p>
            AI code planning is powerful when done right: multi-model planning for completeness, dependency mapping
            for context, systematic reviews for quality, and continuous improvement for mastery.
          </p>

          <p className="mt-4">
            Start small—pick one best practice and apply it to your next refactoring. Measure the results.
            Iterate. Over time, your planning process becomes a competitive advantage.
          </p>

          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">Implement These Best Practices Today</h3>
            <p className="text-foreground/80 mb-6">
              PlanToCode supports multi-model planning, file discovery, and team review workflows out of the box.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                Get Started Free
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs"
                className="inline-flex items-center"
              >
                Read the Documentation
              </LinkWithArrow>
            </div>
          </div>

    </BlogArticle>
  );
}
