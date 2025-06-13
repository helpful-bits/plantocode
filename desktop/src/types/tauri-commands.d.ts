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
  params: Array<unknown>;
}

export interface DbSelectQueryArgs {
  sql: string;
  params: Array<unknown>;
}

export interface DbExecuteTransactionArgs {
  operations: Array<{
    sql: string;
    params: Array<unknown>;
  }>;
}

export interface DbTableExistsArgs {
  tableName: string;
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

export interface GetTempDirCommandArgs {
}

export interface PathIsAbsoluteCommandArgs {
  path: string;
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

export interface GetImplementationPlanPromptCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: Array<string>;
  projectStructure?: string | null;
}

export interface ImplementationPlanPromptResponse {
  systemPrompt: string;
  userPrompt: string;
  combinedPrompt: string;
}

export interface EstimateImplementationPlanTokensCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: Array<string>;
  projectStructure?: string | null;
}

export interface ImplementationPlanTokenEstimateResponse {
  estimatedTokens: number;
  systemPromptTokens: number;
  userPromptTokens: number;
  totalTokens: number;
}


// Commands from job_commands

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

// PathFinderOptions interface aligned with Rust PathFinderOptions struct
export interface PathFinderOptions {
  includeFileContents?: boolean | null;
  maxFilesWithContent?: number | null;
  priorityFileTypes?: string[] | null;
  includedFiles?: string[] | null;
  excludedFiles?: string[] | null;
}

// Commands from path_finding_commands
export interface FindRelevantFilesCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  options?: PathFinderOptions | null;
}

export interface GenerateDirectoryTreeCommandArgs {
  projectDirectory: string;
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
  projectDirectory?: string | null;
  modelOverride?: string | null;
  temperatureOverride?: number | null;
  maxTokensOverride?: number | null;
  targetField?: string | null;
}

export interface CorrectTextCommandArgs {
  sessionId: string;
  textToCorrect: string;
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
  audioData: Uint8Array;
  filename?: string | null;
  projectDirectory?: string | null;
  durationMs: number;
}

export interface TranscribeAudioBatchCommandArgs {
  sessionId: string;
  audioBase64: string;
  chunkIndex: number;
  durationMs: number;
  language?: string | null;
  prompt?: string | null;
  temperature?: number | null;
}

export interface TranscribeAudioDirectCommandArgs {
  audioData: Uint8Array;
  filename: string;
  model: string;
  durationMs: number;
}

// Commands from voice_commands - transcription settings
export interface TranscriptionSettings {
  defaultLanguage?: string | null;
  defaultPrompt?: string | null;
  defaultTemperature?: number | null;
  model?: string | null;
}

export interface GetTranscriptionSettingsCommandArgs {
}

export interface SetTranscriptionSettingsCommandArgs {
  settings: TranscriptionSettings;
}

export interface GetProjectTranscriptionSettingsCommandArgs {
  projectDirectory: string;
}

export interface SetProjectTranscriptionSettingsCommandArgs {
  projectDirectory: string;
  settings: TranscriptionSettings;
}

export interface ResetTranscriptionSettingsCommandArgs {
}

export interface GetEffectiveTranscriptionSettingsCommandArgs {
  projectDirectory?: string | null;
}

export interface ValidateTranscriptionSettingsCommandArgs {
  settings: TranscriptionSettings;
}

// Commands from settings_commands - system prompt related
export interface GetProjectSystemPromptCommandArgs {
  projectDirectory: string;
  taskType: string;
}

export interface SetProjectSystemPromptCommandArgs {
  projectDirectory: string;
  taskType: string;
  systemPrompt: string;
}

export interface ResetProjectSystemPromptCommandArgs {
  projectDirectory: string;
  taskType: string;
}

export interface FetchDefaultSystemPromptsFromServerCommandArgs {
}

export interface FetchDefaultSystemPromptFromServerCommandArgs {
  taskType: string;
}

export interface InitializeSystemPromptsFromServerCommandArgs {
}

// Commands from config_commands / key-value store
export interface GetKeyValueCommandArgs {
  key: string;
}

export interface SetKeyValueCommandArgs {
  key: string;
  value: string;
}

export interface GetWorkflowSettingCommandArgs {
  workflowName: string;
  settingKey: string;
}

export interface SetWorkflowSettingCommandArgs {
  workflowName: string;
  settingKey: string;
  value: string;
}

export interface DeleteWorkflowSettingCommandArgs {
  workflowName: string;
  settingKey: string;
}

export interface GetAllWorkflowSettingsCommandArgs {
  workflowName: string;
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

export interface GetServerUrlArgs {
}

// Commands from database_maintenance_commands
export interface CheckDatabaseHealthCommandArgs {
}

export interface RepairDatabaseCommandArgs {
}

export interface ResetDatabaseCommandArgs {
}




// Commands from file_finder_workflow_commands

export interface StartFileFinderWorkflowCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
  excludedPaths?: string[];
  timeoutMs?: number;
}

export interface GetFileFinderWorkflowStatusCommandArgs {
  workflowId: string;
}

export interface CancelFileFinderWorkflowCommandArgs {
  workflowId: string;
}

export interface PauseFileFinderWorkflowCommandArgs {
  workflowId: string;
}

export interface ResumeFileFinderWorkflowCommandArgs {
  workflowId: string;
}

export interface GetFileFinderWorkflowResultsCommandArgs {
  workflowId: string;
}

export interface GetAllWorkflowsCommandArgs {
}

export interface GetWorkflowDetailsCommandArgs {
  workflowId: string;
}

export interface RetryWorkflowStageCommandArgs {
  workflowId: string;
  failedStageJobId: string;
}

export interface CancelWorkflowStageCommandArgs {
  workflowId: string;
  stageJobId: string;
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

export interface BatchTranscriptionResponse {
  chunkIndex: number;
  text: string;
  processingTimeMs?: number;
}

// Tauri invoke function type
export type TauriInvoke = {
  "get_database_info_command": () => Promise<DatabaseInfo>;
  "is_keyring_onboarding_required": () => Promise<boolean>;
  "trigger_initial_keychain_access": () => Promise<void>;
  "get_storage_mode": () => Promise<boolean>;
  "start_auth0_login_flow": (args: StartAuth0LoginFlowArgs) => Promise<Auth0LoginResult>;
  "check_auth_status_and_exchange_token": (args: CheckAuthStatusAndExchangeTokenArgs) => Promise<TokenExchangeResult>;
  "refresh_app_jwt_auth0": () => Promise<TokenExchangeResult>;
  "logout_auth0": () => Promise<void>;
  "get_user_info_with_app_jwt": (args: GetUserInfoWithAppJwtArgs) => Promise<UserInfo>;
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
  "list_files_command": (args: ListFilesCommandArgs) => Promise<import("@/types").FileInfo[]>;
  "create_directory_command": (args: CreateDirectoryCommandArgs) => Promise<void>;
  "read_file_content_command": (args: ReadFileContentCommandArgs) => Promise<string>;
  "write_file_content_command": (args: WriteFileContentCommandArgs) => Promise<void>;
  "create_unique_filepath_command": (args: CreateUniqueFilepathCommandArgs) => Promise<string>;
  "delete_file_command": (args: DeleteFileCommandArgs) => Promise<void>;
  "move_file_command": (args: MoveFileCommandArgs) => Promise<void>;
  "get_app_data_directory_command": () => Promise<string>;
  "get_temp_dir_command": () => Promise<string>;
  "path_is_absolute_command": (args: PathIsAbsoluteCommandArgs) => Promise<boolean>;
  "generic_llm_stream_command": (args: GenericLLMStreamCommandArgs) => Promise<JobResult>;
  "enhance_task_description_command": (args: EnhanceTaskDescriptionCommandArgs) => Promise<JobResult>;
  "generate_guidance_command": (args: GenerateGuidanceCommandArgs) => Promise<JobResult>;
  "create_implementation_plan_command": (args: CreateImplementationPlanCommandArgs) => Promise<JobResult>;
  "read_implementation_plan_command": (args: ReadImplementationPlanCommandArgs) => Promise<{
    id: string;
    title?: string | null;
    description?: string | null;
    content?: string | null;
    contentFormat?: string | null;
    createdAt: string;
  }>;
  "get_background_job_by_id_command": (args: GetBackgroundJobByIdCommandArgs) => Promise<import("@/types").BackgroundJob | null>;
  "clear_job_history_command": (args: ClearJobHistoryCommandArgs) => Promise<void>;
  "get_active_jobs_command": () => Promise<import("@/types").BackgroundJob[]>;
  "delete_background_job_command": (args: DeleteBackgroundJobCommandArgs) => Promise<void>;
  "cancel_background_job_command": (args: CancelBackgroundJobCommandArgs) => Promise<void>;
  "cancel_session_jobs_command": (args: CancelSessionJobsCommandArgs) => Promise<void>;
  "find_relevant_files_command": (args: FindRelevantFilesCommandArgs) => Promise<JobResult>;
  "generate_directory_tree_command": (args: GenerateDirectoryTreeCommandArgs) => Promise<string>;
  "generate_regex_command": (args: GenerateRegexCommandArgs) => Promise<JobResult>;
  "improve_text_command": (args: ImproveTextCommandArgs) => Promise<JobResult>;
  "correct_text_command": (args: CorrectTextCommandArgs) => Promise<JobResult>;
  "generate_simple_text_command": (args: GenerateSimpleTextCommandArgs) => Promise<string>;
  "create_transcription_job_command": (args: CreateTranscriptionJobCommandArgs) => Promise<JobResult>;
  "transcribe_audio_batch_command": (args: TranscribeAudioBatchCommandArgs) => Promise<BatchTranscriptionResponse>;
  "transcribe_audio_direct_command": (args: TranscribeAudioDirectCommandArgs) => Promise<{ text: string }>;
  "get_transcription_settings_command": (args: GetTranscriptionSettingsCommandArgs) => Promise<TranscriptionSettings>;
  "set_transcription_settings_command": (args: SetTranscriptionSettingsCommandArgs) => Promise<void>;
  "get_project_transcription_settings_command": (args: GetProjectTranscriptionSettingsCommandArgs) => Promise<TranscriptionSettings>;
  "set_project_transcription_settings_command": (args: SetProjectTranscriptionSettingsCommandArgs) => Promise<void>;
  "reset_transcription_settings_command": (args: ResetTranscriptionSettingsCommandArgs) => Promise<void>;
  "get_effective_transcription_settings_command": (args: GetEffectiveTranscriptionSettingsCommandArgs) => Promise<TranscriptionSettings>;
  "validate_transcription_settings_command": (args: ValidateTranscriptionSettingsCommandArgs) => Promise<string[]>;
  "get_key_value_command": (args: GetKeyValueCommandArgs) => Promise<string | null>;
  "set_key_value_command": (args: SetKeyValueCommandArgs) => Promise<void>;
  "get_workflow_setting_command": (args: GetWorkflowSettingCommandArgs) => Promise<string | null>;
  "set_workflow_setting_command": (args: SetWorkflowSettingCommandArgs) => Promise<void>;
  "delete_workflow_setting_command": (args: DeleteWorkflowSettingCommandArgs) => Promise<void>;
  "get_all_workflow_settings_command": (args: GetAllWorkflowSettingsCommandArgs) => Promise<Record<string, string>>;
  "get_all_task_model_settings_for_project_command": (args: GetAllTaskModelSettingsForProjectCommandArgs) => Promise<import("@/types").TaskSettings>;
  "set_project_task_model_settings_command": (args: SetProjectTaskModelSettingsCommandArgs) => Promise<void>;
  "fetch_runtime_ai_config": (args: FetchRuntimeAiConfigArgs) => Promise<import("@/types/config-types").RuntimeAIConfig>;
  "get_server_url": (args: GetServerUrlArgs) => Promise<string>;
  "check_database_health_command": (args: CheckDatabaseHealthCommandArgs) => Promise<DatabaseHealthResult>;
  "repair_database_command": (args: RepairDatabaseCommandArgs) => Promise<DatabaseRepairResult>;
  "reset_database_command": (args: ResetDatabaseCommandArgs) => Promise<DatabaseResetResult>;
  "get_project_system_prompt_command": (args: GetProjectSystemPromptCommandArgs) => Promise<string | null>;
  "set_project_system_prompt_command": (args: SetProjectSystemPromptCommandArgs) => Promise<void>;
  "reset_project_system_prompt_command": (args: ResetProjectSystemPromptCommandArgs) => Promise<void>;
  "fetch_default_system_prompts_from_server": (args: FetchDefaultSystemPromptsFromServerCommandArgs) => Promise<import("@/types/system-prompts").DefaultSystemPrompt[]>;
  "fetch_default_system_prompt_from_server": (args: FetchDefaultSystemPromptFromServerCommandArgs) => Promise<import("@/types/system-prompts").DefaultSystemPrompt | null>;
  "initialize_system_prompts_from_server": (args: InitializeSystemPromptsFromServerCommandArgs) => Promise<void>;
  
  // Billing commands
  "get_subscription_details_command": () => Promise<SubscriptionDetails>;
  "get_subscription_plans_command": () => Promise<SubscriptionPlan[]>;
  "create_checkout_session_command": (args: { plan: string }) => Promise<CheckoutSessionResponse>;
  "create_billing_portal_command": () => Promise<BillingPortalResponse>;
  "create_billing_portal_session_command": () => Promise<string>;
  "get_spending_status_command": () => Promise<SpendingStatusInfo>;
  "acknowledge_spending_alert_command": (args: { alertId: string }) => Promise<boolean>;
  "update_spending_limits_command": (args: UpdateSpendingLimitsRequest) => Promise<UpdateSpendingLimitsResponse>;
  "get_invoice_history_command": (args?: InvoiceHistoryRequest) => Promise<InvoiceHistoryResponse>;
  "get_spending_history_command": () => Promise<SpendingHistoryResponse>;
  "get_spending_analytics_command": (args?: { periodMonths?: number }) => Promise<SpendingAnalyticsResponse>;
  "get_spending_forecast_command": (args?: { monthsAhead?: number }) => Promise<SpendingForecastResponse>;
  "get_payment_methods_command": () => Promise<PaymentMethodsResponse>;
  "check_service_access_command": () => Promise<ServiceAccessResponse>;
  
  // Credit system commands
  "get_credit_balance_command": () => Promise<CreditBalanceResponse>;
  "get_credit_history_command": (args: { limit?: number; offset?: number }) => Promise<CreditHistoryResponse>;
  "get_credit_packs_command": () => Promise<CreditPacksResponse>;
  "get_credit_stats_command": () => Promise<CreditStats>;
  "purchase_credits_command": (args: { stripePriceId: string }) => Promise<CheckoutSessionResponse>;
  
  // Modern PaymentIntent-based commands (2024)
  "create_credit_payment_intent_command": (args: CreatePaymentIntentRequest) => Promise<PaymentIntentResponse>;
  "create_subscription_intent_command": (args: CreateSubscriptionIntentRequest) => Promise<SubscriptionIntentResponse>;
  "create_setup_intent_command": () => Promise<SetupIntentResponse>;
  "confirm_payment_status_command": (args: { paymentIntentId: string }) => Promise<any>;
  "get_stripe_publishable_key_command": () => Promise<string>;
  
  // Subscription lifecycle management
  "change_subscription_plan_command": (args: ChangeSubscriptionPlanRequest) => Promise<SubscriptionDetails>;
  "preview_subscription_change_command": (args: { newPlanId: string }) => Promise<PreviewSubscriptionChangeResponse>;
  "cancel_subscription_command": (args: CancelSubscriptionRequest) => Promise<SubscriptionDetails>;
  "resume_subscription_command": () => Promise<SubscriptionDetails>;
  "reactivate_subscription_command": (args?: { planId?: string }) => Promise<SubscriptionDetails>;
  "get_subscription_pending_payment_command": () => Promise<PendingPaymentInfo>;
  "complete_pending_payment_command": () => Promise<CompletePendingPaymentResponse>;
  
  // Billing details and invoice customization
  "get_billing_details_command": () => Promise<BillingDetails>;
  "update_billing_details_command": (args: UpdateBillingDetailsRequest) => Promise<BillingDetails>;
  "get_invoice_settings_command": () => Promise<InvoiceSettings>;
  "update_invoice_settings_command": (args: UpdateInvoiceSettingsRequest) => Promise<InvoiceSettings>;
  
  // Payment method management commands
  "delete_payment_method_command": (args: { id: string }) => Promise<void>;
  "set_default_payment_method_command": (args: { id: string }) => Promise<void>;
  
  // File Finder Workflow commands
  "start_file_finder_workflow": (args: StartFileFinderWorkflowCommandArgs) => Promise<import("@/types/workflow-types").WorkflowCommandResponse>;
  "get_file_finder_workflow_status": (args: GetFileFinderWorkflowStatusCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse>;
  "cancel_file_finder_workflow": (args: CancelFileFinderWorkflowCommandArgs) => Promise<void>;
  "pause_file_finder_workflow": (args: PauseFileFinderWorkflowCommandArgs) => Promise<void>;
  "resume_file_finder_workflow": (args: ResumeFileFinderWorkflowCommandArgs) => Promise<void>;
  "get_file_finder_workflow_results": (args: GetFileFinderWorkflowResultsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowResultsResponse>;
  "get_all_workflows_command": (args: GetAllWorkflowsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse[]>;
  "get_workflow_details_command": (args: GetWorkflowDetailsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse | null>;
  "retry_workflow_stage_command": (args: RetryWorkflowStageCommandArgs) => Promise<string>;
  "cancel_workflow_stage_command": (args: CancelWorkflowStageCommandArgs) => Promise<void>;
  // Billing health monitoring commands
  "check_billing_health_command": (args: CheckBillingHealthCommandArgs) => Promise<BillingHealthStatus>;
  "ping_billing_service_command": (args: PingBillingServiceCommandArgs) => Promise<boolean>;
  
  // Consolidated billing dashboard command
  "get_billing_dashboard_data_command": () => Promise<BillingDashboardData>;
};

// Billing-related types
export interface SubscriptionDetails {
  plan: string;
  planName?: string;
  status: string;
  trialEndsAt?: string;
  currentPeriodEndsAt?: string;
  monthlySpendingAllowance?: number;
  hardSpendingLimit?: number;
  isTrialing: boolean;
  hasCancelled: boolean;
  nextInvoiceAmount?: number;
  currency: string;
  usage: UsageInfo;
  creditBalance: number;
  pendingPlanId?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  features: string[];
  recommended: boolean;
  trialDays: number;
  stripeMonthlyPriceId?: string;
  stripeYearlyPriceId?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UsageInfo {
  currentSpending: number;
  includedAllowance: number;
  usagePercentage: number;
  servicesBlocked: boolean;
  currency: string;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface BillingPortalResponse {
  url: string;
}

export interface SpendingStatusInfo {
  currentSpending: number;
  includedAllowance: number;
  remainingAllowance: number;
  overageAmount: number;
  usagePercentage: number;
  servicesBlocked: boolean;
  hardLimit: number;
  nextBillingDate: string;
  currency: string;
  alerts: SpendingAlert[];
  creditBalance: number;
}

export interface SpendingAlert {
  id: string;
  alertType: string;
  thresholdAmount: number;
  currentSpending: number;
  alertSentAt: string;
  acknowledged: boolean;
}

export interface InvoiceHistoryEntry {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdDate: string;
  dueDate?: string;
  paidDate?: string;
  invoicePdf?: string;
  description: string;
}

export interface InvoiceSummary {
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  overdueAmount: number;
  overdueCount: number;
}

export interface InvoiceHistoryResponse {
  invoices: InvoiceHistoryEntry[];
  totalCount: number;
  hasMore: boolean;
  summary?: InvoiceSummary;
}

// Database health and maintenance result types
export interface DatabaseHealthResult {
  isHealthy: boolean;
  issues: string[];
  recommendations?: string[];
}

export interface DatabaseRepairResult {
  success: boolean;
  repairsPerformed: string[];
  errors?: string[];
}

export interface DatabaseResetResult {
  success: boolean;
  message: string;
}

// User info interface
export interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  [key: string]: unknown; // Allow additional Auth0 claims
}

// Additional billing response types
export interface SpendingHistoryResponse {
  history: SpendingHistoryEntry[];
  totalCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface SpendingHistoryEntry {
  date: string;
  amount: number;
  currency: string;
  description: string;
  serviceType?: string;
}

export interface ServiceAccessResponse {
  hasAccess: boolean;
  reason?: string;
  blockedServices?: string[];
}

// Credit system types
export interface CreditBalanceResponse {
  userId: string;
  balance: number;
  currency: string;
  lastUpdated: string;
}

export interface CreditTransactionEntry {
  id: string;
  amount: number;
  currency: string;
  transactionType: string;
  description: string;
  createdAt: string;
  balanceAfter: number;
}

export interface CreditHistoryResponse {
  transactions: CreditTransactionEntry[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreditPack {
  id: string;
  name: string;
  valueCredits: number; // Amount of credits user gets
  priceAmount: number;  // Actual price to pay
  currency: string;
  stripePriceId: string;
  description?: string;
  recommended: boolean;
  bonusPercentage?: number;
  isPopular?: boolean;
}

export interface CreditPacksResponse {
  packs: CreditPack[];
}

export interface CreditStats {
  userId: string;
  currentBalance: number;
  totalPurchased: number;
  totalConsumed: number;
  totalRefunded: number;
  transactionCount: number;
  currency: string;
}

// Modern PaymentIntent types (2024)
export interface PaymentIntentResponse {
  clientSecret: string;
  publishableKey: string;
  amount: number;
  currency: string;
  description: string;
}

export interface SetupIntentResponse {
  clientSecret: string;
  publishableKey: string;
}

export interface CreatePaymentIntentRequest {
  creditPackId: string;
  savePaymentMethod?: boolean;
}

export interface CreateSubscriptionIntentRequest {
  planId: string;
  trialDays?: number;
}

export interface SubscriptionIntentResponse {
  subscriptionId: string;
  clientSecret?: string; // For SetupIntent or PaymentIntent
  publishableKey: string;
  status: string;
  trialEnd?: string;
}

// Subscription lifecycle management types
export interface ChangeSubscriptionPlanRequest {
  newPlanId?: string;
  cancelAtPeriodEnd?: boolean;
  prorationBehavior?: string; // "create_prorations", "none", "always_invoice"
}

export interface PreviewSubscriptionChangeResponse {
  immediateCharge?: number;
  prorationCredit?: number;
  netAmount: number;
  currency: string;
  invoicePreview: any;
}

export interface CancelSubscriptionRequest {
  immediate: boolean;
  invoiceNow?: boolean;
  prorate?: boolean;
}

export interface PendingPaymentInfo {
  hasPendingPayment: boolean;
  paymentIntentSecret?: string;
  publishableKey?: string;
  pendingPlanId?: string;
  currentStatus?: string;
}

export interface CompletePendingPaymentResponse {
  success: boolean;
  newPlanId?: string;
  previousPlanId?: string;
  message: string;
}

// Advanced billing types for new commands
export interface UpdateSpendingLimitsRequest {
  monthlySpendingLimit?: number;
  hardLimit?: number;
}

export interface UpdateSpendingLimitsResponse {
  success: boolean;
  message: string;
  updatedLimits: {
    monthlyAllowance: number;
    hardLimit: number;
    currentSpending: number;
    servicesBlocked: boolean;
  };
}

export interface InvoiceHistoryRequest {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  sortField?: 'createdDate' | 'amount' | 'status';
  sortDirection?: 'asc' | 'desc';
}

export interface SpendingAnalyticsResponse {
  userId: string;
  periodMonths: number;
  currentStatus: SpendingStatusInfo;
  summary: SpendingSummary;
  trends: SpendingTrend[];
  monthlyAverage: number;
  projectedMonthEndSpending: number;
  spendingTrend: "increasing" | "decreasing" | "stable" | "insufficient_data";
  costPerRequest: number;
  costPerToken: number;
  daysUntilLimit?: number;
  generatedAt: string;
}

export interface SpendingSummary {
  totalSpending: number;
  totalOverage: number;
  totalRequests: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalPeriods: number;
}

export interface SpendingTrend {
  periodStart: string;
  totalSpending: number;
  overageAmount: number;
  totalRequests: number;
  planId: string;
}

export interface SpendingForecastResponse {
  userId: string;
  monthsAhead: number;
  totalProjectedSpending: number;
  monthlyForecasts: MonthlyForecast[];
  basedOnMonths: number;
  confidenceLevel: number;
  generatedAt: string;
}

export interface MonthlyForecast {
  monthOffset: number;
  projectedSpending: number;
  confidenceLevel: number;
}

export interface PaymentMethod {
  id: string;
  type_: string;
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  isDefault: boolean;
  createdDate: string;
}

export interface PaymentMethodsResponse {
  paymentMethods: PaymentMethod[];
  hasDefault: boolean;
}

export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface BillingDetails {
  companyName?: string;
  contactEmail: string;
  billingAddress: BillingAddress;
  taxId?: string;
  phone?: string;
}

export interface UpdateBillingDetailsRequest {
  companyName?: string;
  contactEmail: string;
  billingAddress: BillingAddress;
  taxId?: string;
  phone?: string;
}

export interface InvoiceSettings {
  companyName?: string;
  logoUrl?: string;
  footerText?: string;
  notes?: string;
  dueDays: number;
}

export interface UpdateInvoiceSettingsRequest {
  companyName?: string;
  logoUrl?: string;
  footerText?: string;
  notes?: string;
  dueDays: number;
}

// Commands from billing_health_commands
export interface CheckBillingHealthCommandArgs {
}

export interface PingBillingServiceCommandArgs {
}

export interface BillingHealthStatus {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  serverConnectivity: boolean;
  authenticationStatus: boolean;
  subscriptionAccessible: boolean;
  spendingStatusAccessible: boolean;
  paymentMethodsAccessible: boolean;
  lastChecked: string;
  errorDetails: string[];
  warnings: string[];
  recommendations: string[];
}

// Consolidated billing dashboard types
export interface BillingDashboardPlanDetails {
  planId: string;
  name: string;
  priceUsd: number;
  billingInterval: string;
}

export interface BillingDashboardSpendingDetails {
  currentSpendingUsd: number;
  spendingLimitUsd: number;
  periodStart: string;
  periodEnd: string;
}

export interface BillingDashboardData {
  planDetails: BillingDashboardPlanDetails;
  spendingDetails: BillingDashboardSpendingDetails;
  creditBalanceUsd: number;
}

// Strongly typed invoke function
export declare function invoke<T extends keyof TauriInvoke>(
  command: T,
  ...args: Parameters<TauriInvoke[T]>
): ReturnType<TauriInvoke[T]>;
