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

export interface CreateCreditCheckoutSessionCommandArgs {
  amount: number;
}


export interface CreateSetupCheckoutSessionCommandArgs {
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface CheckoutSessionStatusResponse {
  status: string;
  paymentStatus: string;
  customerEmail?: string;
}

// Commands from text_commands
export interface ImproveTextCommandArgs {
  projectHash: string;
  textToImprove: string;
  originalTranscriptionJobId?: string | null;
  projectDirectory?: string | null;
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

export interface GetTaskDescriptionHistoryCommandArgs {
  sessionId: string;
}

export interface AddTaskDescriptionHistoryEntryCommandArgs {
  sessionId: string;
  description: string;
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
export interface ProjectFileInfo {
  path: string;        // RELATIVE from project root
  name: string;
  size?: number;
  modifiedAt?: number;
  isBinary: boolean;
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

export interface WriteBinaryFileCommandArgs {
  path: string;
  content: number[];
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


export interface RefineTaskDescriptionCommandArgs {
  sessionId: string;
  taskDescription: string;
  relevantFiles: string[];
  projectDirectory: string;
}




// Commands from implementation_plan_commands
export interface CreateImplementationPlanCommandArgs {
  projectHash: string;
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

export interface UpdateImplementationPlanContentCommandArgs {
  jobId: string;
  newContent: string;
}

export interface GetPromptCommandArgs {
  projectHash: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: Array<string>;
  projectStructure?: string | null;
  taskType: string;
}

export interface PromptResponse {
  systemPrompt: string;
  userPrompt: string;
  combinedPrompt: string;
}

export interface EstimatePromptTokensCommandArgs {
  projectHash: string;
  taskDescription: string;
  projectDirectory: string;
  relevantFiles: Array<string>;
  projectStructure?: string | null;
  taskType: string;
}

export interface PromptTokenEstimateResponse {
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


export interface DeleteBackgroundJobCommandArgs {
  jobId: string;
}

export interface CancelBackgroundJobCommandArgs {
  jobId: string;
}

export interface CancelSessionJobsCommandArgs {
  projectHash: string;
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
  projectHash: string;
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

export interface EstimatePathFinderTokensCommandArgs {
  projectHash: string;
  taskDescription: string;
  projectDirectory?: string | null;
  options?: PathFinderOptions | null;
  directoryTree?: string | null;
}


// Commands from regex_commands
export interface GenerateRegexCommandArgs {
  projectHash: string;
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
  projectHash: string;
  textToImprove: string;
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

export interface IsProjectSystemPromptCustomizedCommandArgs {
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
  projectHash: string;
  taskDescription: string;
  projectDirectory: string;
  excludedPaths?: string[];
  timeoutMs?: number;
}

export interface GetWorkflowStatusCommandArgs {
  workflowId: string;
}

export interface CancelWorkflowCommandArgs {
  workflowId: string;
}

export interface PauseWorkflowCommandArgs {
  workflowId: string;
}

export interface ResumeWorkflowCommandArgs {
  workflowId: string;
}

export interface GetWorkflowResultsCommandArgs {
  workflowId: string;
}

export interface GetAllWorkflowsCommandArgs {
}

export interface GetWorkflowDetailsCommandArgs {
  workflowId: string;
}

export interface RetryWorkflowCommandArgs {
  workflowId: string;
  failedStageJobId: string;
}

export interface CancelWorkflowStageCommandArgs {
  workflowId: string;
  stageJobId: string;
}

export interface StartWebEnhancedTaskRefinementWorkflowCommandArgs {
  sessionId: string;
  taskDescription: string;
  projectDirectory: string;
}

// Video recording and analysis commands
export interface StartVideoAnalysisJobCommandArgs {
  videoPath: string;
  prompt: string;
  model: string;
  temperature: number;
  systemPrompt?: string;
  durationMs: number;
}


// Common result types
export interface JobResult {
  jobId: string;
  duration_ms?: number;
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
  duration_ms?: number;
}

// Tauri invoke function type
export type TauriInvoke = {
  "get_database_info_command": () => Promise<DatabaseInfo>;
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
  "get_task_description_history_command": (args: GetTaskDescriptionHistoryCommandArgs) => Promise<string[]>;
  "add_task_description_history_entry_command": (args: AddTaskDescriptionHistoryEntryCommandArgs) => Promise<void>;
  "db_execute_query": (args: DbExecuteQueryArgs) => Promise<number>;
  "db_select_query": (args: DbSelectQueryArgs) => Promise<Record<string, unknown>[]>;
  "db_execute_transaction": (args: DbExecuteTransactionArgs) => Promise<void>;
  "db_table_exists": (args: DbTableExistsArgs) => Promise<boolean>;
  "list_project_files_command": (args: { projectDirectory: string }) => Promise<ProjectFileInfo[]>;
  "create_directory_command": (args: CreateDirectoryCommandArgs) => Promise<void>;
  "read_file_content_command": (args: ReadFileContentCommandArgs) => Promise<string>;
  "write_file_content_command": (args: WriteFileContentCommandArgs) => Promise<void>;
  "write_binary_file_command": (args: WriteBinaryFileCommandArgs) => Promise<void>;
  "create_unique_filepath_command": (args: CreateUniqueFilepathCommandArgs) => Promise<string>;
  "delete_file_command": (args: DeleteFileCommandArgs) => Promise<void>;
  "move_file_command": (args: MoveFileCommandArgs) => Promise<void>;
  "get_app_data_directory_command": () => Promise<string>;
  "get_temp_dir_command": () => Promise<string>;
  "path_is_absolute_command": (args: PathIsAbsoluteCommandArgs) => Promise<boolean>;
  "generic_llm_stream_command": (args: GenericLLMStreamCommandArgs) => Promise<JobResult>;
  "refine_task_description_command": (args: RefineTaskDescriptionCommandArgs) => Promise<JobResult>;
  "estimate_prompt_tokens_command": (args: EstimatePromptTokensCommandArgs) => Promise<PromptTokenEstimateResponse>;
  "get_prompt_command": (args: GetPromptCommandArgs) => Promise<PromptResponse>;
  "create_implementation_plan_command": (args: CreateImplementationPlanCommandArgs) => Promise<JobResult>;
  "read_implementation_plan_command": (args: ReadImplementationPlanCommandArgs) => Promise<{
    id: string;
    title?: string | null;
    description?: string | null;
    content?: string | null;
    contentFormat?: string | null;
    createdAt: string;
  }>;
  "update_implementation_plan_content_command": (args: UpdateImplementationPlanContentCommandArgs) => Promise<void>;
  "get_background_job_by_id_command": (args: GetBackgroundJobByIdCommandArgs) => Promise<import("@/types").BackgroundJob | null>;
  "clear_job_history_command": (args: ClearJobHistoryCommandArgs) => Promise<void>;
  "get_all_visible_jobs_command": () => Promise<import("@/types").BackgroundJob[]>;
  "delete_background_job_command": (args: DeleteBackgroundJobCommandArgs) => Promise<void>;
  "cancel_background_job_command": (args: CancelBackgroundJobCommandArgs) => Promise<void>;
  "cancel_session_jobs_command": (args: CancelSessionJobsCommandArgs) => Promise<void>;
  "find_relevant_files_command": (args: FindRelevantFilesCommandArgs) => Promise<JobResult>;
  "generate_directory_tree_command": (args: GenerateDirectoryTreeCommandArgs) => Promise<string>;
  "generate_regex_command": (args: GenerateRegexCommandArgs) => Promise<JobResult>;
  "improve_text_command": (args: ImproveTextCommandArgs) => Promise<JobResult>;
  "generate_simple_text_command": (args: GenerateSimpleTextCommandArgs) => Promise<{ text: string; duration_ms?: number }>;
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
  "is_project_system_prompt_customized_command": (args: IsProjectSystemPromptCustomizedCommandArgs) => Promise<boolean>;
  "fetch_default_system_prompts_from_server": (args: FetchDefaultSystemPromptsFromServerCommandArgs) => Promise<import("@/types/system-prompts").DefaultSystemPrompt[]>;
  "fetch_default_system_prompt_from_server": (args: FetchDefaultSystemPromptFromServerCommandArgs) => Promise<import("@/types/system-prompts").DefaultSystemPrompt | null>;
  "initialize_system_prompts_from_server": (args: InitializeSystemPromptsFromServerCommandArgs) => Promise<void>;
  
  // Billing commands
  "get_billing_dashboard_data_command": () => Promise<BillingDashboardData>;
  "get_spending_history_command": () => Promise<SpendingHistoryResponse>;
  "check_service_access_command": () => Promise<ServiceAccessResponse>;
  "get_spending_analytics_command": (args?: { periodMonths?: number }) => Promise<SpendingAnalyticsResponse>;
  "get_spending_forecast_command": (args?: { monthsAhead?: number }) => Promise<SpendingForecastResponse>;
  "get_payment_methods_command": () => Promise<PaymentMethodsResponse>;
  
  // Auto top-off commands
  "get_auto_top_off_settings_command": () => Promise<AutoTopOffSettings>;
  "update_auto_top_off_settings_command": (args: { request: UpdateAutoTopOffRequest }) => Promise<AutoTopOffSettings>;
  
  // Credit system commands
  "get_credit_history_command": (args: { limit?: number; offset?: number; search?: string }) => Promise<UnifiedCreditHistoryResponse>;
  "get_credit_balance_command": () => Promise<CreditBalanceResponse>;
  "get_credit_details_command": () => Promise<CreditDetailsResponse>;
  "get_credit_stats_command": () => Promise<CreditStats>;
  "get_credit_purchase_fee_tiers_command": () => Promise<FeeTierConfig>;
  
  
  "confirm_payment_status_command": (args: { paymentIntentId: string }) => Promise<any>;
  "get_stripe_publishable_key_command": () => Promise<string>;
  
  // Checkout commands
  "create_credit_purchase_checkout_session_command": (args: CreateCreditCheckoutSessionCommandArgs) => Promise<CheckoutSessionResponse>;
  "create_setup_checkout_session_command": (args: CreateSetupCheckoutSessionCommandArgs) => Promise<CheckoutSessionResponse>;
  "get_checkout_session_status_command": (args: { sessionId: string }) => Promise<CheckoutSessionStatusResponse>;
  
  // Credit lifecycle management
  "get_usage_summary_command": () => Promise<any>;
  "create_billing_portal_session_command": () => Promise<BillingPortalResponse>;
  
  // Invoice management commands
  "list_invoices_command": (args: { limit?: number; offset?: number }) => Promise<import("@/actions/billing/invoice.actions").ListInvoicesResponse>;
  "download_invoice_pdf_command": (args: { invoiceId: string; pdfUrl: string }) => Promise<string>;
  "reveal_file_in_explorer_command": (args: { filePath: string }) => Promise<void>;
  
  // Payment method management commands
  "get_detailed_usage_command": (args: { startDate: string; endDate: string }) => Promise<DetailedUsageRecord[]>;
  "get_detailed_usage_with_summary_command": (args: { startDate: string; endDate: string }) => Promise<import("@/actions/billing/billing.actions").DetailedUsageResponse>;
  
  // File Finder Workflow commands
  "start_file_finder_workflow": (args: StartFileFinderWorkflowCommandArgs) => Promise<import("@/types/workflow-types").WorkflowCommandResponse>;
  "get_workflow_status": (args: GetWorkflowStatusCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse>;
  "cancel_workflow": (args: CancelWorkflowCommandArgs) => Promise<void>;
  "pause_workflow": (args: PauseWorkflowCommandArgs) => Promise<void>;
  "resume_workflow": (args: ResumeWorkflowCommandArgs) => Promise<void>;
  "get_workflow_results_legacy": (args: GetWorkflowResultsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowResultsResponse>;
  "get_all_workflows_command": (args: GetAllWorkflowsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse[]>;
  "get_workflow_details_command": (args: GetWorkflowDetailsCommandArgs) => Promise<import("@/types/workflow-types").WorkflowStatusResponse | null>;
  "retry_workflow_command": (args: RetryWorkflowCommandArgs) => Promise<string>;
  "cancel_workflow_stage_command": (args: CancelWorkflowStageCommandArgs) => Promise<void>;
  "start_web_enhanced_task_refinement_workflow": (args: StartWebEnhancedTaskRefinementWorkflowCommandArgs) => Promise<import("@/types/workflow-types").WorkflowCommandResponse>;
  "get_workflow_state": (args: { workflowId: string }) => Promise<any>;
  "get_workflow_results": (args: { workflowId: string }) => Promise<any>;
  
  // Video recording and analysis commands
  "start_video_analysis_job": (args: StartVideoAnalysisJobCommandArgs) => Promise<import("@/types/video-analysis-types").VideoAnalysisJobResponse>;
};

// Billing-related types
export interface DetailedUsageRecord {
  serviceName: string;
  modelDisplayName: string;
  providerCode: string;
  totalCost: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
}

export interface UsageInfo {
  currency: string;
}

export interface BillingPortalResponse {
  url: string;
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
  lastUpdated: string | null;
}

export interface CreditTransactionEntry {
  id: string;
  amount: string;
  currency: string;
  transaction_type: string;
  description: string;
  created_at: string;
  balance_after: string;
}

export interface UnifiedCreditHistoryEntry {
  id: string;
  price: number;  // Negative for usage, positive for purchases
  date: string;
  model: string;  // Model name or "Credit Purchase" for purchases
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheWriteTokens?: number | null;
  cacheReadTokens?: number | null;
  balanceAfter: number;
  description: string;
  transactionType: string;
}

export interface UnifiedCreditHistoryResponse {
  entries: UnifiedCreditHistoryEntry[];
  totalCount: number;
  hasMore: boolean;
}

export interface CreditDetailsResponse {
  stats: CreditStats;
  transactions: CreditTransactionEntry[];
  totalTransactionCount: number;
  hasMore: boolean;
}


export interface CreditStats {
  userId: string;
  currentBalance: number;
  totalPurchased: number;
  totalConsumed: number;
  totalRefunded: number;
  netBalance: number;
  transactionCount: number;
  currency: string;
}

export interface FeeTier {
  min: number;
  max?: number | null;
  feeRate: number;
  label: string;
}

export interface FeeTierConfig {
  tiers: FeeTier[];
}

export interface AutoTopOffSettings {
  enabled: boolean;
  threshold?: string;
  amount?: string;
}

export interface UpdateAutoTopOffRequest {
  enabled: boolean;
  threshold?: string | undefined;
  amount?: string | undefined;
}







// Credit lifecycle management types

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



export interface SpendingAnalyticsResponse {
  userId: string;
  periodMonths: number;
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
  created: number;
  isDefault: boolean;
}

export interface PaymentMethodsResponse {
  totalMethods: number;
  hasDefault: boolean;
  methods: PaymentMethod[];
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


// Consolidated billing dashboard types
export interface BillingDashboardPlanDetails {
  planId: string;
  name: string;
  priceUsd: number;
  billingInterval: string;
}

export interface TaxIdInfo {
  type_: string;
  value: string;
  country?: string | null;
  verificationStatus?: string | null;
}

export interface CustomerBillingInfo {
  customerName?: string | null;
  customerEmail?: string | null;
  phone?: string | null;
  taxExempt?: string | null;
  taxIds: TaxIdInfo[];
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  hasBillingInfo: boolean;
}

export interface BillingDashboardData {
  creditBalanceUsd: number;
  servicesBlocked: boolean;
  isPaymentMethodRequired: boolean;
  isBillingInfoRequired: boolean;
  freeCreditBalanceUsd: number;
  freeCreditsGrantedAt: string | null;
  freeCreditsExpiresAt: string | null;
  freeCreditsExpired: boolean;
  usageLimitUsd: number;
  currentUsage: number;
  customerBillingInfo: CustomerBillingInfo | null;
}

// Invoice interfaces
export interface Invoice {
  id: string;
  created: number;
  due_date?: number;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  invoice_pdf_url?: string;
}

export interface ListInvoicesResponse {
  invoices: Invoice[];
  totalInvoices: number;
  hasMore: boolean;
}

// Strongly typed invoke function
export declare function invoke<T extends keyof TauriInvoke>(
  command: T,
  ...args: Parameters<TauriInvoke[T]>
): ReturnType<TauriInvoke[T]>;
