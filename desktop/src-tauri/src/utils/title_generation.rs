use crate::api_clients::client_factory::get_api_client;
use crate::api_clients::client_trait::ApiClientOptions;
use crate::error::{AppError, AppResult};
use crate::models::{OpenRouterContent, OpenRouterRequestMessage, RuntimeAIConfig};
use crate::services::config_cache_service::ConfigCache;
use crate::services::system_prompt_cache_service::SystemPromptCacheService;
use tauri::{AppHandle, Manager};

const MAX_TITLE_CHARS: usize = 140;

async fn resolve_model_defaults(app_handle: &AppHandle) -> AppResult<(String, f32, u32)> {
    let cache = app_handle.state::<ConfigCache>().inner();
    let cache_guard = cache
        .lock()
        .map_err(|e| AppError::ConfigError(format!("Failed to lock cache: {}", e)))?;

    if let Some(runtime_config_value) = cache_guard.get("runtime_ai_config") {
        if let Ok(runtime_config) =
            serde_json::from_value::<RuntimeAIConfig>(runtime_config_value.clone())
        {
            if let Some(task_config) = runtime_config.tasks.get("implementation_plan") {
                let model = task_config.model.clone();
                let temperature = task_config.temperature;
                let max_tokens = task_config.max_tokens;
                return Ok((model, temperature, max_tokens as u32));
            }
        }
    }

    Ok(("auto".to_string(), 0.2_f32, 64_u32))
}

async fn load_system_prompt(app_handle: &AppHandle) -> String {
    if let Some(cache_service) = app_handle.try_state::<SystemPromptCacheService>() {
        if let Ok(Some(prompt)) = cache_service
            .get_fresh_system_prompt("implementation_plan_title")
            .await
        {
            return prompt.system_prompt;
        }
    }

    "You are a naming assistant that generates descriptive titles for software implementation plans.
Constraints:
- Output a single line, ≤140 characters.
- No surrounding quotes, backticks, markdown, or code formatting.
- Sentence/title case; avoid trailing punctuation.
- Be specific and descriptive; include key technical details when helpful; no emojis.".to_string()
}

pub async fn generate_plan_title(
    app_handle: &AppHandle,
    task_description: &str,
    request_id: Option<String>,
    model_override: Option<(String, f32, u32)>,
) -> AppResult<Option<String>> {
    let (model, temperature, _max_tokens) = match model_override {
        Some((m, t, k)) => (m, t, k),
        None => resolve_model_defaults(app_handle).await?,
    };

    let system_prompt = load_system_prompt(app_handle).await;

    let system_message = OpenRouterRequestMessage {
        role: "system".to_string(),
        content: vec![OpenRouterContent::Text {
            content_type: "text".to_string(),
            text: system_prompt,
        }],
    };

    let user_content = format!(
        "<task_request>\n  <constraints max_length=\"{}\" />\n  <task_description><![CDATA[\n{}\n]]></task_description>\n</task_request>",
        MAX_TITLE_CHARS, task_description
    );

    let user_message = OpenRouterRequestMessage {
        role: "user".to_string(),
        content: vec![OpenRouterContent::Text {
            content_type: "text".to_string(),
            text: user_content,
        }],
    };

    let messages = vec![system_message, user_message];

    let api_client = get_api_client(app_handle).await?;

    let options = ApiClientOptions {
        model,
        stream: false,
        max_tokens: 64,
        temperature,
        request_id,
        task_type: Some("implementation_plan_title".to_string()),
    };

    let response = api_client.chat_completion(messages, options).await?;

    let raw_title = match response.choices.first() {
        Some(choice) => choice.message.content.clone(),
        None => return Ok(None),
    };

    // Process the text
    let mut processed = raw_title.trim().to_string();

    // Strip surrounding quotes/backticks
    if (processed.starts_with('"') && processed.ends_with('"'))
        || (processed.starts_with('\'') && processed.ends_with('\''))
        || (processed.starts_with('`') && processed.ends_with('`'))
    {
        processed = processed[1..processed.len() - 1].to_string();
    }

    // Replace newlines with spaces and collapse multiple spaces
    processed = processed.replace('\n', " ");
    processed = processed.split_whitespace().collect::<Vec<_>>().join(" ");

    // Trim trailing punctuation and quotes
    processed = processed
        .trim_matches(|c: char| r#""'` .:;,_-/"#.contains(c))
        .to_string();

    // Simple char-based truncation to 70 chars (safe for UTF-8)
    if processed.is_empty() {
        return Ok(None);
    }

    // Truncate to MAX_TITLE_CHARS characters
    let truncated = if processed.chars().count() > MAX_TITLE_CHARS {
        processed.chars().take(MAX_TITLE_CHARS).collect::<String>()
    } else {
        processed
    };

    let final_title = truncated.trim().to_string();

    if final_title.is_empty() {
        Ok(None)
    } else {
        Ok(Some(final_title))
    }
}

pub async fn generate_plan_title_with_retry(
    app: &tauri::AppHandle,
    task_description: &str,
    request_id: Option<String>,
    model_override: Option<(String, f32, u32)>,
    attempts: usize,
    backoff_ms: &[u64],
) -> Result<Option<String>, AppError> {
    use tokio::time::{sleep, Duration};
    let mut last_err: Option<AppError> = None;
    let tries = attempts.min(backoff_ms.len().max(1));
    for i in 0..tries {
        match generate_plan_title(app, task_description, request_id.clone(), model_override.clone()).await {
            Ok(Some(title)) => return Ok(Some(title)),
            Ok(None) => return Ok(None),
            Err(e) => {
                last_err = Some(e);
                if i + 1 < tries {
                    sleep(Duration::from_millis(backoff_ms[i])).await;
                }
            }
        }
    }
    if let Some(e) = last_err {
        tracing::warn!(error=?e, "Title generation failed after retries");
    }
    Ok(None)
}
