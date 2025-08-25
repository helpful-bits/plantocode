// Export all interactive demo step components - complete 14-step workflow
export { ProjectSelectorMock } from './ProjectSelectorMock';
export { SessionManagerMock } from './SessionManagerMock';
export { TaskDescriptionMock } from './TaskDescriptionMock';
export { VoiceTranscriptionMock } from './VoiceTranscriptionMock';
export { VideoRecordingMock } from './VideoRecordingMock';
export { TextImprovementMock } from './TextImprovementMock';
export { DeepResearchMock } from './DeepResearchMock';
export { FileSearchMock } from './FileSearchMock';
export { PlanCardsStreamMock } from './PlanCardsStreamMock';
export { MergeInstructionsMock } from './MergeInstructionsMock';
export { MergeExecutionMock } from './MergeExecutionMock';
export { SettingsMock } from './SettingsMock';
export { SystemPromptMock } from './SystemPromptMock';
export { CopyButtonsMock } from './CopyButtonsMock';
export { ModelSelectorToggleMock } from './ModelSelectorToggleMock';
export { JobDetailsModalMock } from './JobDetailsModalMock';
export { PlanContentModalMock } from './PlanContentModalMock';
export { PlanContentStreamingMock } from './PlanContentStreamingMock';

// Standardized step component props
export interface StepComponentProps {
  isInView: boolean;
  resetKey?: number;
}