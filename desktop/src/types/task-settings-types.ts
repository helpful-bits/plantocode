export interface TaskModelSettings {
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface TaskSettings {
  path_finder: TaskModelSettings;
  voice_transcription: TaskModelSettings;
  regex_pattern_generation: TaskModelSettings;
  regex_summary_generation: TaskModelSettings;
  path_correction: TaskModelSettings;
  text_improvement: TaskModelSettings;
  text_correction: TaskModelSettings;
  task_enhancement: TaskModelSettings;
  guidance_generation: TaskModelSettings;
  implementation_plan: TaskModelSettings;
  generic_llm_stream: TaskModelSettings;
  file_finder_workflow: TaskModelSettings;
  streaming: TaskModelSettings;
  unknown: TaskModelSettings;
}
