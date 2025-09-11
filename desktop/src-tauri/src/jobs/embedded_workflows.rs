/// Embedded workflow definitions as a fallback when the external files are not available
/// This ensures workflows can always be loaded even if resource files are missing

pub const FILE_FINDER_WORKFLOW: &str = include_str!("workflow_definitions/file_finder_workflow.json");
pub const WEB_SEARCH_WORKFLOW: &str = include_str!("workflow_definitions/web_search_workflow.json");

/// Get embedded workflow content by filename
pub fn get_embedded_workflow(filename: &str) -> Option<&'static str> {
    match filename {
        "file_finder_workflow.json" => Some(FILE_FINDER_WORKFLOW),
        "web_search_workflow.json" => Some(WEB_SEARCH_WORKFLOW),
        _ => None,
    }
}