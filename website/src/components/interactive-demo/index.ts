// Main Components
export { HowItWorksInteractive } from './HowItWorksInteractive';
export { StepController } from './StepController';

// Orchestration Hooks
export {
  useAutoFillText,
  useAnimatedNumber,
  useSimulatedClick,
  useTypeOnScroll,
  useDelayedVisibility,
  usePulse
} from './hooks/useScrollOrchestration';

// Types
export type StepControllerProps = {
  children: React.ReactNode | ((props: { isInView: boolean; progress: number }) => React.ReactNode);
  onEnter?: () => void;
  className?: string;
}

export type OrchestrationConfig = {
  progress: number;
  phases: Array<{ start: number; end: number; name: string }>;
}