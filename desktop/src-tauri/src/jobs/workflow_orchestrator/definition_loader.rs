use log::info;
use std::collections::HashMap;
use std::sync::Arc;

use crate::error::{AppError, AppResult};
use crate::jobs::embedded_workflows;
use crate::jobs::workflow_types::WorkflowDefinition;

pub(super) fn load_workflow_definitions_from_files() -> AppResult<HashMap<String, Arc<WorkflowDefinition>>> {
    const WORKFLOW_FILES: &[&str] = &[
        "file_finder_workflow.json",
        "web_search_workflow.json",
    ];

    let mut workflow_definitions = HashMap::new();
    
    for filename in WORKFLOW_FILES {
        let Some(json) = embedded_workflows::get_embedded_workflow(filename) else {
            return Err(AppError::JobError(format!(
                "Embedded workflow missing: {}", filename
            )));
        };
        
        let workflow_definition: WorkflowDefinition = serde_json::from_str(json).map_err(|e| {
            AppError::JobError(format!("Invalid embedded workflow JSON {}: {}", filename, e))
        })?;

        workflow_definition.validate().map_err(|e| {
            AppError::JobError(format!("Invalid workflow definition in embedded {}: {}", filename, e))
        })?;

        let workflow_name = workflow_definition.name.clone();
        workflow_definitions.insert(workflow_name.clone(), Arc::new(workflow_definition));
        info!("Successfully loaded embedded workflow definition: {}", workflow_name);
    }

    if workflow_definitions.is_empty() {
        return Err(AppError::JobError(
            "No valid embedded workflow definitions found".to_string(),
        ));
    }

    Ok(workflow_definitions)
}