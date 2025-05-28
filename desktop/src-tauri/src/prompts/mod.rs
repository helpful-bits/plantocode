// Re-export all prompt modules
pub mod guidance;
pub mod implementation_plan;
pub mod implementation_plan_title;
pub mod path_correction;
pub mod path_finder;
pub mod regex;
pub mod regex_pattern_generation;
pub mod regex_summary;
pub mod task_enhancement;
pub mod text_improvement;
pub mod voice_correction;

// Re-export commonly used prompt functions
pub use guidance::{generate_guidance_prompt, generate_guidance_system_prompt, generate_guidance_user_prompt, generate_guidance_for_paths_user_prompt};
pub use implementation_plan::generate_enhanced_implementation_plan_prompt;
pub use implementation_plan_title::{generate_implementation_plan_title_system_prompt, generate_implementation_plan_title_user_prompt};
pub use path_correction::generate_path_correction_prompt;
pub use path_finder::{
    generate_path_finder_prompt,
    generate_path_finder_system_prompt,
    generate_path_finder_prompt_with_contents
};
pub use regex::generate_regex_prompt;
pub use regex_pattern_generation::generate_regex_pattern_prompt;
pub use regex_summary::generate_regex_summary_prompt;
pub use task_enhancement::{
    generate_task_enhancement_system_prompt,
    generate_task_enhancement_user_prompt
};
pub use text_improvement::{
    generate_text_improvement_system_prompt,
    generate_text_improvement_user_prompt
};
pub use voice_correction::{
    generate_voice_correction_prompt,
    generate_simple_voice_correction_prompt
};