// This is a debug file to test the response parser logic

use std::path::Path;

fn main() {
    // Test case 1: JSON array
    let json_response = r#"["src/config.json", "src/app.js", "package.json"]"#;
    println!("Testing JSON array response: {}", json_response);
    
    // Test case 2: Text with paths
    let text_response = "src/config.json\nsrc/app.js\npackage.json";
    println!("Testing text response: {}", text_response);
    
    // Test case 3: Mixed format
    let mixed_response = "The following files are relevant:\n- src/config.json\n- src/app.js\n- package.json";
    println!("Testing mixed response: {}", mixed_response);
}