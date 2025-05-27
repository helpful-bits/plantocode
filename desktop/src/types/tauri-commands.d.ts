// Command interface definitions

// Commands from app_commands
export interface GetDatabaseInfoCommandArgs {
}


// Commands from auth0_commands
export interface StartAuth0LoginFlowArgs {
  provideHint?: string | null;
}

export interface CheckAuthStatusAndExchangeTokenArgs {
  pollingId: string;
}

export interface RefreshAppJwtAuth0Args {
}

export interface LogoutAuth0Args {
}

export interface GetUserInfoWithAppJwtArgs {
  appToken: string;
}

export interface GetAppJwtArgs {
}

export interface SetAppJwtArgs {
  token?: string | null;
}

export interface ClearStoredAppJwtArgs {
}


// Commands from session_commands
export interface CreateSessionCommandArgs {
  sessionData: Partial<import("@/types").Session>;
}

export interface UpdateSessionCommandArgs {
  sessionData: import("@/types").Session;
}

export interface GetSessionCommandArgs {
  sessionId: string;
}

export interface GetSessionsForProjectCommandArgs {
  projectDirectory: string;
}

export interface DeleteSessionCommandArgs {
  sessionId: string;
}


// Commands from db_commands
export interface DbExecuteQueryArgs {
  sql: string;
  params: Array<string | number | boolean | null>;
}

export interface DbSelectQueryArgs {
  sql: string;
  params: Array<string | number | boolean | null>;
}

export interface DbExecuteTransactionArgs {
  operations: Array<{
    sql: string;
    params: Array<string | number | boolean | null>;
  }>;
}

export interface DbTableExistsArgs {
  tableName: string;
}


// Commands from fetch_handler_command
export interface HandleFetchRequestArgs {
  method: string;
  headers?: Record<string, string> | null;
  body?: string | null;
  url: string;
}

export interface InvokeFetchHandlerArgs {
  url: string;
  method: string;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface InvokeStreamHandlerArgs {
  url: string;
  method: string;
  headers?: Record<string, string> | null;
  body?: string | null;
  onChunk: (chunk: string) => void;
}


// Commands from file_system_commands
export interface ListFilesCommandArgs {
  directory: string;
  pattern?: string | null;
  includeStats?: boolean | null;
  exclude?: Array<string> | null;
}

export interface CreateDirectoryCommandArgs {
  path: string;
  projectDirectory?: string | null;
}

export interface ReadFileContentCommandArgs {
  path: string;
  projectDirectory?: string | null;
  encoding?: string | null;
}

export interface WriteFileContentCommandArgs {
  path: string;
  content: string;
  projectDirectory?: string | null;
}

export interface CreateUniqueFilepathCommandArgs {
  requestId: string;
  sessionName: string;
  extension: string;
  projectDirectory?: string | null;
  targetDirName?: string | null;
}

export interface DeleteFileCommandArgs {
  path: string;
  projectDirectory?: string | null;
}

export interface MoveFileCommandArgs {
  sourcePath: string;
  destinationPath: string;
  projectDirectory?: string | null;
  overwrite?: boolean | null;
}

export interface GetAppDataDirectoryCommandArgs {
}

export interface Get_temp_dir_commandArgs {
}


// Commands from generic_task_commands
export interface GenericLLMStreamCommandArgs {
  sessionId: string;
  promptText: string;
  systemPrompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  metadata?: Record<string, unknown> | null;
  projectDirectory?: string | null;
}

export interface EnhanceTaskDescriptionCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectContext?: string | null;
  projectDirectory?: string | null;
  targetField?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
}


// Commands from guidance_commands
export interface GenerateGuidanceCommandArgs {
  sessionId: string;
  projectDirectory: string;
  taskDescription: string;
  paths?: Array<string> | null;
  fileContentsSummary?: string | null;
  systemPromptOverride?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
}


// Commands from implementation_plan_commands
export interface CreateImplementationPlanCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: Array<string>;
  projectStructure?: string | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
}

export interface ReadImplementationPlanCommandArgs {
  jobId: string;
}


// Commands from job_commands
export interface UpdateJobClearedStatusCommandArgs {
  jobId: string;
  cleared: boolean;
}

export interface GetBackgroundJobByIdCommandArgs {
  jobId: string;
}

export interface ClearJobHistoryCommandArgs {
  daysToKeep: number;
}

export interface GetActiveJobsCommandArgs {
}

export interface DeleteBackgroundJobCommandArgs {
  jobId: string;
}

export interface CancelBackgroundJobCommandArgs {
  jobId: string;
}

export interface CancelSessionJobsCommandArgs {
  sessionId: string;
}


// Directory tree options interface for JavaScript/TypeScript side (camelCase)
export interface DirectoryTreeOptions {
  maxDepth?: number | null;
  includeIgnored?: boolean | null;
  respectGitignore?: boolean | null;
  excludePatterns?: string[] | null;
  includeFiles?: boolean | null;
  includeDirs?: boolean | null;
  includeHidden?: boolean | null;
}

// Define PathFinderOptions interface for better type safety
export interface PathFinderOptions {
  includeFileContents?: boolean | null;
  maxFilesWithContent?: number | null;
  maxDepth?: number | null;
  excludePatterns?: string[] | null;
}

// Commands from path_finding_commands
export interface FindFelevantFilesCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  options?: PathFinderOptions | null;
}

export interface CreateGenerateDirectoryTreeJobCommandArgs {
  projectDirectory: string;
  sessionId: string;
  options?: DirectoryTreeOptions | null;
}


// Commands from regex_commands
export interface GenerateRegexCommandArgs {
  sessionId: string;
  projectDirectory: string;
  description: string;
  examples?: Array<string> | null;
  targetLanguage?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  targetField?: string | null;
}


// Commands from text_commands
export interface ImproveTextCommandArgs {
  sessionId: string;
  text: string;
  improvementType: string;
  language?: string | null;
  projectDirectory?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  targetField?: string | null;
}

export interface CorrectTextPostTranscriptionCommandArgs {
  sessionId: string;
  textToCorrect: string;
  language: string;
  originalTranscriptionJobId?: string | null;
  projectDirectory?: string | null;
}

export interface GenerateSimpleTextCommandArgs {
  prompt: string;
  systemPrompt?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  taskType?: string | null;
}


// Commands from voice_commands
export interface CreateTranscriptionJobCommandArgs {
  sessionId: string;
  audioData: string;
  filename?: string | null;
  projectDirectory?: string | null;
}

export interface CorrectTranscriptionCommandArgs {
  sessionId: string;
  textToCorrect: string;
  language: string;
  originalJobId?: string | null;
  projectDirectory?: string | null;
}

export interface TranscribeAudioDirectCommandArgs {
  audioData: Array<number>;
  filename: string;
  model: string;
}

// Commands from config_commands / key-value store
export interface GetKeyValueCommandArgs {
  key: string;
}

export interface SetKeyValueCommandArgs {
  key: string;
  value: string;
}

export interface GetAllTaskModelSettingsForProjectCommandArgs {
  projectDirectory: string;
}

export interface SetProjectTaskModelSettingsCommandArgs {
  projectDirectory: string;
  settingsJson: string;
}

export interface FetchRuntimeAiConfigArgs {
}


// Common result types
export interface JobResult {
  jobId: string;
}

export interface DatabaseInfo {
  version: string;
  path: string;
  size: number;
}

export interface Auth0LoginResult {
  pollingId: string;
  verificationUri: string;
  userCode: string;
}

export interface TokenExchangeResult {
  success: boolean;
  token?: string;
}

// Tauri invoke function type
export type TauriInvoke = {
  "get_database_info_command": () => Promise<DatabaseInfo>;
  "start_auth0_login_flow": (args: StartAuth0LoginFlowArgs) => Promise<Auth0LoginResult>;
  "check_auth_status_and_exchange_token": (args: CheckAuthStatusAndExchangeTokenArgs) => Promise<TokenExchangeResult>;
  "refresh_app_jwt_auth0": () => Promise<TokenExchangeResult>;
  "logout_auth0": () => Promise<void>;
  "get_user_info_with_app_jwt": (args: GetUserInfoWithAppJwtArgs) => Promise<Record<string, unknown>>;
  "get_app_jwt": () => Promise<string | null>;
  "set_app_jwt": (args: SetAppJwtArgs) => Promise<void>;
  "clear_stored_app_jwt": () => Promise<void>;
  "create_session_command": (args: CreateSessionCommandArgs) => Promise<import("@/types").Session>;
  "update_session_command": (args: UpdateSessionCommandArgs) => Promise<import("@/types").Session>;
  "get_session_command": (args: GetSessionCommandArgs) => Promise<import("@/types").Session | null>;
  "get_sessions_for_project_command": (args: GetSessionsForProjectCommandArgs) => Promise<import("@/types").Session[]>;
  "delete_session_command": (args: DeleteSessionCommandArgs) => Promise<void>;
  "db_execute_query": (args: DbExecuteQueryArgs) => Promise<number>;
  "db_select_query": (args: DbSelectQueryArgs) => Promise<Record<string, unknown>[]>;
  "db_execute_transaction": (args: DbExecuteTransactionArgs) => Promise<void>;
  "db_table_exists": (args: DbTableExistsArgs) => Promise<boolean>;
  "handle_fetch_request": (args: HandleFetchRequestArgs) => Promise<string>;
  "invoke_fetch_handler": (args: InvokeFetchHandlerArgs) => Promise<string>;
  "invoke_stream_handler": (args: InvokeStreamHandlerArgs) => Promise<void>;
  "list_files_command": (args: ListFilesCommandArgs) => Promise<import("@/types").FileInfo[]>;
  "create_directory_command": (args: CreateDirectoryCommandArgs) => Promise<void>;
  "read_file_content_command": (args: ReadFileContentCommandArgs) => Promise<string>;
  "write_file_content_command": (args: WriteFileContentCommandArgs) => Promise<void>;
  "create_unique_filepath_command": (args: CreateUniqueFilepathCommandArgs) => Promise<string>;
  "delete_file_command": (args: DeleteFileCommandArgs) => Promise<void>;
  "move_file_command": (args: MoveFileCommandArgs) => Promise<void>;
  "get_app_data_directory_command": () => Promise<string>;
  "get_temp_dir_command": () => Promise<string>;
  "generic_llm_stream_command": (args: GenericLLMStreamCommandArgs) => Promise<JobResult>;
  "enhance_task_description_command": (args: EnhanceTaskDescriptionCommandArgs) => Promise<JobResult>;
  "generate_guidance_command": (args: GenerateGuidanceCommandArgs) => Promise<JobResult>;
  "create_implementation_plan_command": (args: CreateImplementationPlanCommandArgs) => Promise<JobResult>;
  "read_implementation_plan_command": (args: ReadImplementationPlanCommandArgs) => Promise<string>;
  "update_job_cleared_status_command": (args: UpdateJobClearedStatusCommandArgs) => Promise<void>;
  "get_background_job_by_id_command": (args: GetBackgroundJobByIdCommandArgs) => Promise<import("@/types").BackgroundJob | null>;
  "clear_job_history_command": (args: ClearJobHistoryCommandArgs) => Promise<void>;
  "get_active_jobs_command": () => Promise<import("@/types").BackgroundJob[]>;
  "delete_background_job_command": (args: DeleteBackgroundJobCommandArgs) => Promise<void>;
  "cancel_background_job_command": (args: CancelBackgroundJobCommandArgs) => Promise<void>;
  "cancel_session_jobs_command": (args: CancelSessionJobsCommandArgs) => Promise<void>;
  "find_relevant_files_command": (args: FindFelevantFilesCommandArgs) => Promise<JobResult>;
  "create_generate_directory_tree_job_command": (args: CreateGenerateDirectoryTreeJobCommandArgs) => Promise<JobResult>;
  "generate_regex_command": (args: GenerateRegexCommandArgs) => Promise<JobResult>;
  "improve_text_command": (args: ImproveTextCommandArgs) => Promise<JobResult>;
  "correct_text_post_transcription_command": (args: CorrectTextPostTranscriptionCommandArgs) => Promise<JobResult>;
  "generate_simple_text_command": (args: GenerateSimpleTextCommandArgs) => Promise<string>;
  "create_transcription_job_command": (args: CreateTranscriptionJobCommandArgs) => Promise<JobResult>;
  "correct_transcription_command": (args: CorrectTranscriptionCommandArgs) => Promise<JobResult>;
  "transcribe_audio_direct_command": (args: TranscribeAudioDirectCommandArgs) => Promise<string>;
  "get_key_value_command": (args: GetKeyValueCommandArgs) => Promise<string | null>;
  "set_key_value_command": (args: SetKeyValueCommandArgs) => Promise<void>;
  "get_all_task_model_settings_for_project_command": (args: GetAllTaskModelSettingsForProjectCommandArgs) => Promise<import("@/types").TaskSettings>;
  "set_project_task_model_settings_command": (args: SetProjectTaskModelSettingsCommandArgs) => Promise<void>;
  "fetch_runtime_ai_config": (args: FetchRuntimeAiConfigArgs) => Promise<Record<string, unknown>>;
};

// Strongly typed invoke function
export declare function invoke<T extends keyof TauriInvoke>(
  command: T,
  ...args: Parameters<TauriInvoke[T]>
): ReturnType<TauriInvoke[T]>;
