// Main Components
export { HowItWorksInteractive } from './HowItWorksInteractive';
export { StepController } from './StepController';

// Orchestration Hooks
export {
  useTimedCycle,
  useTimedLoop,
  useTypewriter,
  useTweenNumber,
  useIntervalGate
} from './hooks/useScrollOrchestration';

// Types
export type StepControllerProps = {
  children: React.ReactNode | ((props: { isInView: boolean; resetKey: number }) => React.ReactNode);
  onEnter?: () => void;
  onLeave?: () => void;
  className?: string;
}