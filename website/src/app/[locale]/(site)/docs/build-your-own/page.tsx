import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['docs']);

  return generatePageMetadata({
    locale,
    slug: '/docs/build-your-own',
    title: t['buildYourOwn.meta.title'],
    description: t['buildYourOwn.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

interface PatternSection {
  title: string;
  description: string;
  benefits?: string[];
  pitfalls?: string[];
  components?: string[];
}

interface StepSection {
  title: string;
  description: string;
  details?: string;
}

interface ArchitectureDecision {
  question: string;
  recommendation: string;
}

interface CommonPitfall {
  pitfall: string;
  solution: string;
}

export default async function BuildYourOwnPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['docs']);

  const keyPatterns = t['buildYourOwn.keyPatterns'] as {
    heading: string;
    jobQueue: PatternSection;
    workflowOrchestrator: PatternSection;
    repositoryPattern: PatternSection;
  };

  const architectureDecisions = t['buildYourOwn.architectureDecisions'] as {
    heading: string;
    decisions: ArchitectureDecision[];
  };

  const customizeVsReuse = t['buildYourOwn.customizeVsReuse'] as {
    heading: string;
    customize: string[];
    reuse: string[];
  };

  const commonPitfalls = t['buildYourOwn.commonPitfalls'] as {
    heading: string;
    items: CommonPitfall[];
  };

  return (
    <DocsArticle
      title={t['buildYourOwn.title']}
      description={t['buildYourOwn.description']}
      date={t['buildYourOwn.date']}
      readTime={t['buildYourOwn.readTime']}
      category={t['buildYourOwn.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        {t['buildYourOwn.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['buildYourOwn.visuals.pipelineMap.title']}
        description={t['buildYourOwn.visuals.pipelineMap.description']}
        imageSrc={t['buildYourOwn.visuals.pipelineMap.imageSrc']}
        imageAlt={t['buildYourOwn.visuals.pipelineMap.imageAlt']}
        caption={t['buildYourOwn.visuals.pipelineMap.caption']}
      />

      {/* Key Architectural Patterns */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{keyPatterns.heading}</h2>

        {/* Job Queue Pattern */}
        <GlassCard className="p-6">
          <h3 className="text-xl font-semibold mb-3">{keyPatterns.jobQueue.title}</h3>
          <p className="text-muted-foreground mb-4">{keyPatterns.jobQueue.description}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {keyPatterns.jobQueue.benefits && (
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2">Benefits</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
                  {keyPatterns.jobQueue.benefits.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {keyPatterns.jobQueue.pitfalls && (
              <div>
                <h4 className="text-sm font-semibold text-amber-400 mb-2">Pitfalls to Avoid</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
                  {keyPatterns.jobQueue.pitfalls.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Workflow Orchestrator Pattern */}
        <GlassCard className="p-6">
          <h3 className="text-xl font-semibold mb-3">{keyPatterns.workflowOrchestrator.title}</h3>
          <p className="text-muted-foreground mb-4">{keyPatterns.workflowOrchestrator.description}</p>
          {keyPatterns.workflowOrchestrator.components && (
            <div>
              <h4 className="text-sm font-semibold text-blue-400 mb-2">Components</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
                {keyPatterns.workflowOrchestrator.components.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>

        {/* Repository Pattern */}
        <GlassCard className="p-6">
          <h3 className="text-xl font-semibold mb-3">{keyPatterns.repositoryPattern.title}</h3>
          <p className="text-muted-foreground mb-4">{keyPatterns.repositoryPattern.description}</p>
          {keyPatterns.repositoryPattern.benefits && (
            <div>
              <h4 className="text-sm font-semibold text-green-400 mb-2">Benefits</h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
                {keyPatterns.repositoryPattern.benefits.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>
      </section>

      {/* Pipeline Steps */}
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Pipeline Steps</h2>

        {['step1', 'step2', 'step3', 'step4', 'step5'].map((stepKey) => {
          const step = t[`buildYourOwn.steps.${stepKey}`] as StepSection;
          return (
            <div key={stepKey} className="border-l-2 border-primary/30 pl-4">
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground mb-2">{step.description}</p>
              {step.details && (
                <p className="text-sm text-muted-foreground/80 bg-muted/20 p-3 rounded-lg">
                  {step.details}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* Architecture Decisions */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{architectureDecisions.heading}</h2>
        <div className="grid gap-4">
          {architectureDecisions.decisions.map((decision, i) => (
            <GlassCard key={i} className="p-5">
              <h3 className="font-semibold text-primary mb-2">{decision.question}</h3>
              <p className="text-muted-foreground text-sm">{decision.recommendation}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Customize vs Reuse */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{customizeVsReuse.heading}</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">Customize</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {customizeVsReuse.customize.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">Reuse</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {customizeVsReuse.reuse.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </section>

      {/* Common Pitfalls */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{commonPitfalls.heading}</h2>
        <div className="space-y-3">
          {commonPitfalls.items.map((item, i) => (
            <GlassCard key={i} className="p-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-sm font-bold">
                  !
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-red-400 mb-1">{item.pitfall}</h4>
                  <p className="text-muted-foreground text-sm">{item.solution}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Artifacts to Persist */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{t['buildYourOwn.artifacts.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {(t['buildYourOwn.artifacts.items'] as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* Implementation Notes */}
      <section className="space-y-4 mb-6">
        <h2 className="text-2xl font-bold">{t['buildYourOwn.implementationNotes.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {(t['buildYourOwn.implementationNotes.items'] as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
