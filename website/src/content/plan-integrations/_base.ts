import type {
  PlanIntegrationContent,
  PlanIntegrationValueBullet,
} from '@/components/plan/PlanIntegrationLayout';

export type { PlanIntegrationContent };

export const baseValueBullets: PlanIntegrationValueBullet[] = [
  {
    title: 'Human-in-the-loop governance',
    description:
      'Maintain full control over AI-generated implementation plans. Review proposed changes, edit plan details, and approve before execution. Every step is visible, auditable, and aligned with your requirements.',
  },
  {
    title: 'File-by-file plans with exact repository paths',
    description:
      'Implementation plans break down changes on a file-by-file basis with exact paths corresponding to your project structure. This granular approach ensures complete visibility into what will be modified.',
  },
  {
    title: 'Intelligent file discovery',
    description:
      'Surface the right files before writing prompts. The file discovery workflow uses pattern groups, relevance scoring, and staged reviews to identify exactly which files your AI needs.',
  },
  {
    title: 'Integrated terminal with CLI detection',
    description:
      'Launch AI coding CLIs directly in the built-in terminal without leaving your workspace. Health monitoring, auto-recovery, and resize handling keep long-running jobs stable.',
  },
  {
    title: 'Persistent sessions and logs',
    description:
      'Terminal output is stored locally, and project sessions reload on startup. Close the application and return days later to pick up exactly where you left off.',
  },
  {
    title: 'Privacy and local storage',
    description:
      'All sessions are stored locally on your machine in SQLite. When you use AI features, you see exactly what will be sent to AI providers before confirming. No hidden data collection.',
  },
];

export function buildJsonLdHowTo(title: string, steps: Array<{ step: string; detail: string }>) {
  return {
    '@type': 'HowTo',
    name: title,
    description: `Step-by-step guide: ${title}`,
    step: steps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.step,
      text: s.detail,
    })),
  };
}
