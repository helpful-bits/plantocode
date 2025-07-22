use crate::error::{AppError, AppResult};
use crate::models::{RuntimeAIConfig, TaskSpecificModelConfig, TaskType};
use crate::services::config_cache_service::ConfigCache;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};

/// Detailed validation result with specific error information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
    pub summary: String,
}

/// Specific validation error with context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub error_type: ValidationErrorType,
    pub component: String,
    pub field: Option<String>,
    pub message: String,
    pub severity: ValidationSeverity,
}

/// Validation warning for non-critical issues
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub warning_type: ValidationWarningType,
    pub component: String,
    pub message: String,
}

/// Types of validation errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationErrorType {
    MissingConfiguration,
    InvalidValue,
    InconsistentState,
    ModelNotFound,
    ProviderNotAvailable,
    ConfigurationMismatch,
    ServerConnectionFailure,
}

/// Types of validation warnings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationWarningType {
    UnknownConfiguration,
    SuboptimalSettings,
    DeprecatedSettings,
}

/// Severity levels for validation errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationSeverity {
    Critical, // Application cannot start
    High,     // Feature will not work
    Medium,   // Degraded functionality
    Low,      // Minor issues
}

/// Centralized validation registry for all configuration validation
pub struct ConfigValidator {
    validation_rules: HashMap<String, Box<dyn ValidationRule + Send + Sync>>,
}

/// Trait for individual validation rules
pub trait ValidationRule {
    fn name(&self) -> &str;
    fn validate(&self, config: &RuntimeAIConfig, app_handle: &AppHandle) -> ValidationResult;
    fn is_critical(&self) -> bool;
}

impl ConfigValidator {
    pub fn new() -> Self {
        let mut validator = Self {
            validation_rules: HashMap::new(),
        };

        // Register all validation rules
        validator.register_rule(
            "task_type_configurations",
            Box::new(TaskTypeConfigurationRule),
        );
        validator.register_rule("model_availability", Box::new(ModelAvailabilityRule));
        validator.register_rule("provider_consistency", Box::new(ProviderConsistencyRule));
        validator.register_rule("parameter_ranges", Box::new(ParameterRangeRule));
        validator.register_rule("required_configs", Box::new(RequiredConfigRule));

        validator
    }

    pub fn register_rule(&mut self, name: &str, rule: Box<dyn ValidationRule + Send + Sync>) {
        self.validation_rules.insert(name.to_string(), rule);
    }

    /// Perform comprehensive validation of the complete configuration
    pub fn validate_complete_configuration(
        &self,
        config: &RuntimeAIConfig,
        app_handle: &AppHandle,
    ) -> ValidationResult {
        let mut all_errors = Vec::new();
        let mut all_warnings = Vec::new();
        let mut critical_failures = 0;

        info!(
            "Starting comprehensive configuration validation with {} rules",
            self.validation_rules.len()
        );

        for (rule_name, rule) in &self.validation_rules {
            let result = rule.validate(config, app_handle);

            for error in result.errors {
                if matches!(error.severity, ValidationSeverity::Critical) {
                    critical_failures += 1;
                }
                all_errors.push(error);
            }

            all_warnings.extend(result.warnings);

            if !result.is_valid && rule.is_critical() {
                error!("Critical validation rule '{}' failed", rule_name);
            }
        }

        let is_valid = critical_failures == 0;
        let summary = if is_valid {
            format!(
                "Configuration validation passed with {} warnings",
                all_warnings.len()
            )
        } else {
            format!(
                "Configuration validation FAILED with {} critical errors, {} total errors, {} warnings",
                critical_failures,
                all_errors.len(),
                all_warnings.len()
            )
        };

        ValidationResult {
            is_valid,
            errors: all_errors,
            warnings: all_warnings,
            summary,
        }
    }

    /// Fail-fast validation for startup - application cannot start if this fails
    pub fn fail_fast_on_invalid_config(
        &self,
        config: &RuntimeAIConfig,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        let result = self.validate_complete_configuration(config, app_handle);

        if !result.is_valid {
            let critical_errors: Vec<&ValidationError> = result
                .errors
                .iter()
                .filter(|e| matches!(e.severity, ValidationSeverity::Critical))
                .collect();

            if !critical_errors.is_empty() {
                let error_messages: Vec<String> = critical_errors
                    .iter()
                    .map(|e| format!("{}: {}", e.component, e.message))
                    .collect();

                let full_error = format!(
                    "CRITICAL CONFIGURATION VALIDATION FAILURES - APPLICATION CANNOT START:\n{}",
                    error_messages.join("\n")
                );

                error!("{}", full_error);
                return Err(AppError::ConfigError(full_error));
            }
        }

        // Log warnings
        for warning in &result.warnings {
            warn!(
                "Configuration warning in {}: {}",
                warning.component, warning.message
            );
        }

        info!("Configuration validation passed startup requirements");
        Ok(())
    }
}

/// Validation rule for task type configurations
struct TaskTypeConfigurationRule;

impl ValidationRule for TaskTypeConfigurationRule {
    fn name(&self) -> &str {
        "task_type_configurations"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn validate(&self, config: &RuntimeAIConfig, _app_handle: &AppHandle) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Get all TaskType variants - we'll filter by requires_llm() below
        let all_task_types = [
            TaskType::ImplementationPlan,
            TaskType::ImplementationPlanMerge,
            TaskType::VoiceTranscription,
            TaskType::TextImprovement,
            TaskType::PathCorrection,
            TaskType::TaskRefinement,
            TaskType::GenericLlmStream,
            TaskType::RegexFileFilter,
            TaskType::FileFinderWorkflow,
            TaskType::FileRelevanceAssessment,
            TaskType::ExtendedPathFinder,
            TaskType::WebSearchPromptsGeneration,
            TaskType::WebSearchExecution,
            TaskType::WebSearchWorkflow,
            TaskType::Streaming,
            TaskType::Unknown,
        ];

        for task_type in all_task_types.iter() {
            // Skip task types that don't require LLM configuration
            if !task_type.requires_llm() {
                continue;
            }
            let task_key = task_type.to_string();

            match config.tasks.get(&task_key) {
                Some(task_config) => {
                    // Validate configuration completeness
                    if task_config.model.is_empty() {
                        errors.push(ValidationError {
                            error_type: ValidationErrorType::InvalidValue,
                            component: format!("TaskConfig[{}]", task_key),
                            field: Some("model".to_string()),
                            message: "Model is empty".to_string(),
                            severity: ValidationSeverity::Critical,
                        });
                    }

                    if task_config.max_tokens == 0 {
                        errors.push(ValidationError {
                            error_type: ValidationErrorType::InvalidValue,
                            component: format!("TaskConfig[{}]", task_key),
                            field: Some("max_tokens".to_string()),
                            message: "Max tokens is 0".to_string(),
                            severity: ValidationSeverity::Critical,
                        });
                    }

                    if task_config.temperature < 0.0 || task_config.temperature > 2.0 {
                        errors.push(ValidationError {
                            error_type: ValidationErrorType::InvalidValue,
                            component: format!("TaskConfig[{}]", task_key),
                            field: Some("temperature".to_string()),
                            message: format!(
                                "Temperature {} is out of range [0.0, 2.0]",
                                task_config.temperature
                            ),
                            severity: ValidationSeverity::High,
                        });
                    }
                }
                None => {
                    errors.push(ValidationError {
                        error_type: ValidationErrorType::MissingConfiguration,
                        component: format!("TaskConfig[{}]", task_key),
                        field: None,
                        message: "Task configuration is missing from server".to_string(),
                        severity: ValidationSeverity::Critical,
                    });
                }
            }
        }

        // Check for unknown configurations
        let known_task_keys: std::collections::HashSet<String> =
            all_task_types.iter().map(|t| t.to_string()).collect();

        for task_key in config.tasks.keys() {
            if !known_task_keys.contains(task_key) {
                warnings.push(ValidationWarning {
                    warning_type: ValidationWarningType::UnknownConfiguration,
                    component: format!("TaskConfig[{}]", task_key),
                    message: "Configuration exists on server but no corresponding task type found"
                        .to_string(),
                });
            }
        }

        let is_valid = errors
            .iter()
            .all(|e| !matches!(e.severity, ValidationSeverity::Critical));
        let summary = format!(
            "Task type configuration validation: {} errors, {} warnings",
            errors.len(),
            warnings.len()
        );

        ValidationResult {
            is_valid,
            errors,
            warnings,
            summary,
        }
    }
}

/// Validation rule for model availability
struct ModelAvailabilityRule;

impl ValidationRule for ModelAvailabilityRule {
    fn name(&self) -> &str {
        "model_availability"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn validate(&self, config: &RuntimeAIConfig, _app_handle: &AppHandle) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Check if we have any models available
        let total_models: usize = config.providers.iter().map(|p| p.models.len()).sum();
        if total_models == 0 {
            errors.push(ValidationError {
                error_type: ValidationErrorType::ModelNotFound,
                component: "RuntimeAIConfig".to_string(),
                field: Some("providers".to_string()),
                message: "No models available from any provider".to_string(),
                severity: ValidationSeverity::Critical,
            });
        }

        // Validate that all task configurations reference available models
        let available_models: std::collections::HashSet<String> = config
            .providers
            .iter()
            .flat_map(|p| p.models.iter().map(|m| m.id.clone()))
            .collect();

        for (task_key, task_config) in &config.tasks {
            if !available_models.contains(&task_config.model) {
                errors.push(ValidationError {
                    error_type: ValidationErrorType::ModelNotFound,
                    component: format!("TaskConfig[{}]", task_key),
                    field: Some("model".to_string()),
                    message: format!(
                        "Model '{}' not found in available providers",
                        task_config.model
                    ),
                    severity: ValidationSeverity::Critical,
                });
            }
        }

        let is_valid = errors
            .iter()
            .all(|e| !matches!(e.severity, ValidationSeverity::Critical));
        let summary = format!(
            "Model availability validation: {} models available, {} errors",
            total_models,
            errors.len()
        );

        ValidationResult {
            is_valid,
            errors,
            warnings,
            summary,
        }
    }
}

/// Validation rule for provider consistency
struct ProviderConsistencyRule;

impl ValidationRule for ProviderConsistencyRule {
    fn name(&self) -> &str {
        "provider_consistency"
    }

    fn is_critical(&self) -> bool {
        false
    }

    fn validate(&self, config: &RuntimeAIConfig, _app_handle: &AppHandle) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Check for providers with no models
        for provider in &config.providers {
            if provider.models.is_empty() {
                warnings.push(ValidationWarning {
                    warning_type: ValidationWarningType::UnknownConfiguration,
                    component: format!("Provider[{}]", provider.provider.name),
                    message: "Provider has no models configured".to_string(),
                });
            }

            // Check for duplicate model IDs within provider
            let mut model_ids = std::collections::HashSet::new();
            for model in &provider.models {
                if !model_ids.insert(&model.id) {
                    errors.push(ValidationError {
                        error_type: ValidationErrorType::ConfigurationMismatch,
                        component: format!("Provider[{}]", provider.provider.name),
                        field: Some("models".to_string()),
                        message: format!("Duplicate model ID: {}", model.id),
                        severity: ValidationSeverity::Medium,
                    });
                }
            }
        }

        let is_valid = errors.is_empty();
        let summary = format!(
            "Provider consistency validation: {} providers checked",
            config.providers.len()
        );

        ValidationResult {
            is_valid,
            errors,
            warnings,
            summary,
        }
    }
}

/// Validation rule for parameter ranges
struct ParameterRangeRule;

impl ValidationRule for ParameterRangeRule {
    fn name(&self) -> &str {
        "parameter_ranges"
    }

    fn is_critical(&self) -> bool {
        false
    }

    fn validate(&self, config: &RuntimeAIConfig, _app_handle: &AppHandle) -> ValidationResult {
        let mut errors = Vec::new();
        let warnings = Vec::new();

        for (task_key, task_config) in &config.tasks {
            // Validate temperature precision
            let temp_rounded = (task_config.temperature * 100.0).round() / 100.0;
            if (task_config.temperature - temp_rounded).abs() > 0.001 {
                errors.push(ValidationError {
                    error_type: ValidationErrorType::InvalidValue,
                    component: format!("TaskConfig[{}]", task_key),
                    field: Some("temperature".to_string()),
                    message: "Temperature has excessive precision (should be rounded to 2 decimal places)".to_string(),
                    severity: ValidationSeverity::Low,
                });
            }
        }

        let is_valid = errors
            .iter()
            .all(|e| matches!(e.severity, ValidationSeverity::Low));
        let summary = format!(
            "Parameter range validation: {} configurations checked",
            config.tasks.len()
        );

        ValidationResult {
            is_valid,
            errors,
            warnings,
            summary,
        }
    }
}

/// Validation rule for required configurations
struct RequiredConfigRule;

impl ValidationRule for RequiredConfigRule {
    fn name(&self) -> &str {
        "required_configs"
    }

    fn is_critical(&self) -> bool {
        true
    }

    fn validate(&self, config: &RuntimeAIConfig, _app_handle: &AppHandle) -> ValidationResult {
        let mut errors = Vec::new();
        let warnings = Vec::new();

        // Validate providers are not empty
        if config.providers.is_empty() {
            errors.push(ValidationError {
                error_type: ValidationErrorType::MissingConfiguration,
                component: "RuntimeAIConfig".to_string(),
                field: Some("providers".to_string()),
                message: "No providers configured".to_string(),
                severity: ValidationSeverity::Critical,
            });
        }

        // Validate tasks are not empty
        if config.tasks.is_empty() {
            errors.push(ValidationError {
                error_type: ValidationErrorType::MissingConfiguration,
                component: "RuntimeAIConfig".to_string(),
                field: Some("tasks".to_string()),
                message: "No task configurations found".to_string(),
                severity: ValidationSeverity::Critical,
            });
        }

        let is_valid = errors
            .iter()
            .all(|e| !matches!(e.severity, ValidationSeverity::Critical));
        let summary = "Required configuration validation completed".to_string();

        ValidationResult {
            is_valid,
            errors,
            warnings,
            summary,
        }
    }
}

/// Validate that all required configurations are present
pub async fn validate_all_required_configs_present(app_handle: &AppHandle) -> AppResult<()> {
    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e))
    })?;

    let runtime_config_value = cache_guard
        .get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;

    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| {
            AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e))
        })?;

    drop(cache_guard);

    let validator = ConfigValidator::new();
    validator.fail_fast_on_invalid_config(&runtime_config, app_handle)?;

    Ok(())
}

/// Comprehensive startup validation function
pub async fn comprehensive_startup_validation(app_handle: &AppHandle) -> AppResult<()> {
    info!("Starting comprehensive startup validation");

    // Validate all required configurations are present
    validate_all_required_configs_present(app_handle).await?;

    // Validate model availability
    validate_model_availability(app_handle).await?;

    info!("Comprehensive startup validation completed successfully");
    Ok(())
}

/// Validate model availability
pub async fn validate_model_availability(app_handle: &AppHandle) -> AppResult<()> {
    let config_cache = app_handle.state::<ConfigCache>();
    let cache_guard = config_cache.lock().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire config cache lock: {}", e))
    })?;

    let runtime_config_value = cache_guard
        .get("runtime_ai_config")
        .ok_or_else(|| AppError::ConfigError("Runtime AI config not found in cache".to_string()))?;

    let runtime_config: RuntimeAIConfig = serde_json::from_value(runtime_config_value.clone())
        .map_err(|e| {
            AppError::SerializationError(format!("Failed to deserialize runtime config: {}", e))
        })?;

    drop(cache_guard);

    let total_models: usize = runtime_config
        .providers
        .iter()
        .map(|p| p.models.len())
        .sum();
    if total_models == 0 {
        return Err(AppError::ConfigError(
            "CRITICAL: No models available from any provider. Application cannot function without LLM models.".to_string()
        ));
    }

    info!(
        "Model availability validation passed: {} models available",
        total_models
    );
    Ok(())
}
