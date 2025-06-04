use std::sync::Arc;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use log::info;
use serde_json;

use crate::error::{AppError, AppResult};
use crate::models::TaskType;
use crate::jobs::workflow_types::{WorkflowDefinition, WorkflowStageDefinition};

/// Load workflow definitions from JSON files in the workflow_definitions directory
pub(super) fn load_workflow_definitions_from_files() -> AppResult<HashMap<String, Arc<WorkflowDefinition>>> {
    let mut workflow_definitions = HashMap::new();
    
    // Get the path to the workflow_definitions directory
    let workflow_definitions_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src/jobs/workflow_definitions");
    
    if !workflow_definitions_dir.exists() {
        return Err(AppError::JobError(format!(
            "Workflow definitions directory not found: {:?}", 
            workflow_definitions_dir
        )));
    }

    // Read all JSON files in the directory
    let entries = fs::read_dir(&workflow_definitions_dir)
        .map_err(|e| AppError::JobError(format!("Failed to read workflow definitions directory: {}", e)))?;

    for entry in entries {
        let entry = entry.map_err(|e| AppError::JobError(format!("Failed to read directory entry: {}", e)))?;
        let path = entry.path();
        
        // Only process .json files
        if path.extension().map(|ext| ext == "json").unwrap_or(false) {
            info!("Loading workflow definition from: {:?}", path);
            
            // Read and parse the JSON file
            let content = fs::read_to_string(&path)
                .map_err(|e| AppError::JobError(format!("Failed to read workflow file {:?}: {}", path, e)))?;
            
            let workflow_definition: WorkflowDefinition = serde_json::from_str(&content)
                .map_err(|e| AppError::JobError(format!("Failed to parse workflow file {:?}: {}", path, e)))?;
            
            // Validate the workflow definition
            workflow_definition.validate().map_err(|e| {
                AppError::JobError(format!("Invalid workflow definition in {:?}: {}", path, e))
            })?;
            
            let workflow_name = workflow_definition.name.clone();
            workflow_definitions.insert(workflow_name.clone(), Arc::new(workflow_definition));
            
            info!("Successfully loaded workflow definition: {}", workflow_name);
        }
    }

    if workflow_definitions.is_empty() {
        return Err(AppError::JobError("No valid workflow definitions found".to_string()));
    }

    Ok(workflow_definitions)
}

