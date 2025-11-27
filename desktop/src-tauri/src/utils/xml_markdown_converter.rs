use tauri::AppHandle;
use crate::error::AppResult;
use crate::jobs::processors::utils::llm_api_utils::{
    create_openrouter_messages, create_api_client_options, execute_llm_chat_completion,
};
use log::{debug, info};

const DEFAULT_MODEL: &str = "openai/gpt-5-mini";
const DEFAULT_TEMPERATURE: f32 = 0.1;
const DEFAULT_MAX_TOKENS: u32 = 50000;

pub async fn convert_xml_plan_to_markdown(
    app_handle: &AppHandle,
    xml_content: &str,
) -> AppResult<String> {
    info!("Converting XML plan to Markdown");

    let model = DEFAULT_MODEL.to_string();
    let temperature = DEFAULT_TEMPERATURE;
    let max_tokens = DEFAULT_MAX_TOKENS;

    let system_prompt = r#"You are an expert programmer and technical writer.
Convert the following XML implementation plan into a clean, readable, and well-structured Markdown document.
Requirements:
- Preserve ALL information and structure (steps, titles, descriptions, file operations, commands, metadata).
- Use headings for steps and subsections.
- Use fenced code blocks for code and shell commands.
- Do NOT omit any content or commentary from the XML.
- Do NOT add any extra explanation or conversational text; return ONLY the Markdown representation."#;

    let user_prompt = format!(
        "Convert this XML implementation plan to Markdown:\n\n```xml\n{}\n```",
        xml_content
    );

    let messages = create_openrouter_messages(system_prompt, &user_prompt);
    let api_options = create_api_client_options(model.clone(), temperature, max_tokens, false)?;

    debug!(
        "Calling LLM API for XML-to-Markdown conversion with model: {}",
        model
    );

    let response = execute_llm_chat_completion(app_handle, messages, api_options).await?;

    let markdown = response
        .choices
        .first()
        .ok_or_else(|| {
            crate::error::AppError::JobError("No content in LLM response".to_string())
        })?
        .message
        .content
        .clone();

    info!("Successfully converted XML to Markdown");
    Ok(markdown)
}
