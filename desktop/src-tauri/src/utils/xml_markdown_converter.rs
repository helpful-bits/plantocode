use futures::StreamExt;
use tauri::AppHandle;
use crate::error::{AppError, AppResult};
use crate::jobs::processors::utils::llm_api_utils::{
    create_openrouter_messages, create_api_client_options, get_api_client,
};
use crate::jobs::processors::utils::parsing_utils::{
    extract_steps_from_xml, extract_agent_instructions_from_xml,
};
use crate::models::StreamEvent;
use log::{debug, info, warn};
use std::sync::Arc;

const DEFAULT_MODEL: &str = "openai/gpt-5-mini";
const DEFAULT_TEMPERATURE: f32 = 0.3;
const DEFAULT_MAX_TOKENS: u32 = 20000;
const MAX_PARALLEL_CONVERSIONS: usize = 5;

/// System prompt for converting XML step to markdown
const STEP_SYSTEM_PROMPT: &str = r#"Convert this XML implementation step to Markdown for reading on mobile devices.

RULES:
- Start with ## Step N: [title] where N is the step number provided
- Use ### for subsection headers like "File Operations", "Commands", "Description"
- Regular text (descriptions, notes, explanations) should be plain paragraphs, NOT code blocks
- Use fenced code blocks ONLY for: actual code snippets, file paths, shell commands
- Keep ALL technical details exactly as in the XML - do not summarize or omit anything
- Format for easy mobile reading: clear structure, readable paragraphs

Output ONLY the markdown."#;

pub async fn convert_xml_plan_to_markdown(
    app_handle: &AppHandle,
    xml_content: &str,
) -> AppResult<String> {
    info!("Converting XML plan to Markdown (parallel steps)");

    // Extract steps directly from XML using regex (more reliable than quick_xml deserialization)
    let steps = extract_steps_from_xml(xml_content);

    if steps.is_empty() {
        warn!("No steps found in XML, falling back to full conversion");
        return convert_full_xml_streaming(app_handle, xml_content).await;
    }

    info!("Extracted {} steps from implementation plan", steps.len());

    // Extract agent instructions if present
    let agent_instructions = extract_agent_instructions_from_xml(xml_content);

    // Convert steps in parallel batches
    let mut markdown_parts = Vec::new();

    // Add header with agent instructions if present
    if let Some(instructions) = agent_instructions {
        markdown_parts.push(format!("## Agent Instructions\n\n{}\n\n---\n", instructions));
    }

    // Process steps in parallel batches
    let steps_with_index: Vec<_> = steps.into_iter().enumerate().collect();
    let app_handle = Arc::new(app_handle.clone());

    for chunk in steps_with_index.chunks(MAX_PARALLEL_CONVERSIONS) {
        let futures: Vec<_> = chunk
            .iter()
            .map(|(idx, step_xml)| {
                let app = app_handle.clone();
                let step_xml = step_xml.clone();
                let step_num = *idx + 1;
                async move {
                    convert_step_xml_to_markdown(&app, &step_xml, step_num).await
                }
            })
            .collect();

        let results = futures::future::join_all(futures).await;

        for result in results {
            match result {
                Ok(md) => markdown_parts.push(md),
                Err(e) => {
                    warn!("Failed to convert step: {}", e);
                    // Continue with other steps
                }
            }
        }
    }

    let final_markdown = markdown_parts.join("\n\n---\n\n");
    info!("Successfully converted plan to Markdown ({} chars, {} parts)",
          final_markdown.len(), markdown_parts.len());
    Ok(final_markdown)
}

/// Convert a raw XML step to markdown using LLM
async fn convert_step_xml_to_markdown(
    app_handle: &AppHandle,
    step_xml: &str,
    step_number: usize,
) -> AppResult<String> {
    let user_message = format!("Step number: {}\n\n{}", step_number, step_xml);
    let messages = create_openrouter_messages(STEP_SYSTEM_PROMPT, &user_message);
    let api_options = create_api_client_options(
        DEFAULT_MODEL.to_string(),
        DEFAULT_TEMPERATURE,
        DEFAULT_MAX_TOKENS,
        true,
    )?;

    debug!("Converting step {} to markdown", step_number);

    let llm_client = get_api_client(app_handle).await?;
    let mut stream = llm_client.chat_completion_stream(messages, api_options).await?;

    let mut markdown = String::new();

    while let Some(event_result) = stream.next().await {
        match event_result {
            Ok(event) => {
                if let StreamEvent::ContentChunk(chunk) = event {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            markdown.push_str(content);
                        }
                    }
                }
            }
            Err(e) => {
                return Err(AppError::JobError(format!(
                    "Error during step {} streaming: {}",
                    step_number, e
                )));
            }
        }
    }

    if markdown.is_empty() {
        // Fallback: just return step number header
        markdown = format!("## Step {}\n\n(conversion failed)", step_number);
    }

    Ok(markdown)
}

/// Fallback: convert entire XML in one streaming call (for non-parseable content)
async fn convert_full_xml_streaming(
    app_handle: &AppHandle,
    xml_content: &str,
) -> AppResult<String> {
    info!("Converting full XML to Markdown (streaming fallback)");

    let system_prompt = r#"Convert this XML implementation plan to Markdown for reading on mobile devices.

RULES:
- Use ## Step N: [title] for each step
- Use ### for subsection headers
- Regular text (descriptions, notes, explanations) should be plain paragraphs, NOT code blocks
- Use fenced code blocks ONLY for: actual code snippets, file paths, shell commands
- Keep ALL technical details - do not summarize or omit anything
- Format for easy mobile reading: clear structure, readable paragraphs

Output ONLY the markdown."#;

    let user_prompt = format!("```xml\n{}\n```", xml_content);

    let messages = create_openrouter_messages(system_prompt, &user_prompt);
    let api_options = create_api_client_options(
        DEFAULT_MODEL.to_string(),
        DEFAULT_TEMPERATURE,
        16000, // Larger for full conversion
        true,
    )?;

    let llm_client = get_api_client(app_handle).await?;
    let mut stream = llm_client.chat_completion_stream(messages, api_options).await?;

    let mut markdown = String::new();

    while let Some(event_result) = stream.next().await {
        match event_result {
            Ok(event) => {
                if let StreamEvent::ContentChunk(chunk) = event {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            markdown.push_str(content);
                        }
                    }
                }
            }
            Err(e) => {
                return Err(AppError::JobError(format!(
                    "Error during streaming: {}",
                    e
                )));
            }
        }
    }

    if markdown.is_empty() {
        return Err(AppError::JobError(
            "No content received from LLM stream".to_string(),
        ));
    }

    info!("Successfully converted XML to Markdown ({} chars)", markdown.len());
    Ok(markdown)
}
