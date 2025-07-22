use once_cell::sync::Lazy;
use quick_xml::Reader;
use quick_xml::events::Event;
use regex::Regex;
use std::io::BufRead;

static XML_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```xml\s*\n?(.*?)\n?```").expect("XML fence regex pattern should be valid")
});

static GENERIC_FENCE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?s)```\s*\n?(.*?)\n?```").expect("Generic fence regex pattern should be valid")
});

/// Extracts XML content from markdown-formatted text
pub fn extract_xml_from_markdown(content: &str) -> String {
    let trimmed_content = content.trim();

    if trimmed_content.is_empty() {
        return String::new();
    }

    if let Some(caps) = XML_FENCE_REGEX.captures(trimmed_content) {
        if let Some(xml_content) = caps.get(1) {
            return xml_content.as_str().trim().to_string();
        }
    }

    if let Some(caps) = GENERIC_FENCE_REGEX.captures(trimmed_content) {
        if let Some(inner_content) = caps.get(1) {
            let inner_str = inner_content.as_str().trim();
            if inner_str.starts_with('<') {
                return inner_str.to_string();
            }
        }
    }

    trimmed_content.to_string()
}

/// Splits input by "<<<Separator>>>" delimiter to get individual XML documents
pub fn split_research_documents(input: &str) -> Vec<String> {
    input
        .split("<<<Separator>>>")
        .map(|doc| doc.trim())
        .filter(|doc| !doc.is_empty())
        .map(|doc| doc.to_string())
        .collect()
}

/// Extracts individual research tasks from XML content
/// Handles the new sophisticated format with XML declarations and CDATA sections
pub fn extract_research_tasks(xml: &str) -> Vec<String> {
    split_research_documents(xml)
}

/// Extracts search query from a single research task XML
/// Handles the new sophisticated format with proper XML parsing
pub fn extract_query_from_task(xml: &str) -> Option<String> {
    if xml.trim().is_empty() {
        return None;
    }

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut in_query = false;
    let mut query_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                if e.local_name().as_ref() == b"research_query" {
                    in_query = true;
                    query_text.clear();
                }
            }
            Ok(Event::End(ref e)) => {
                if in_query && e.local_name().as_ref() == b"research_query" {
                    return Some(query_text.trim().to_string());
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_query {
                    if let Ok(text) = std::str::from_utf8(e) {
                        query_text.push_str(text);
                    }
                }
            }
            Ok(Event::CData(ref e)) => {
                if in_query {
                    if let Ok(text) = std::str::from_utf8(e) {
                        query_text.push_str(text);
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                if e.local_name().as_ref() == b"research_query" {
                    // Check if there's a value attribute
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            if key == "value" || key == "text" {
                                return Some(
                                    std::str::from_utf8(&attr.value).unwrap_or("").to_string(),
                                );
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                // If XML parsing fails, return None - no fallback
                return None;
            }
            _ => {}
        }

        buf.clear();
    }

    None
}

/// Extracts the research task title from XML
pub fn extract_task_title(xml: &str) -> Option<String> {
    if xml.trim().is_empty() {
        return None;
    }

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                if e.local_name().as_ref() == b"research_task" {
                    // Look for title attribute
                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            if key == "title" {
                                return Some(
                                    std::str::from_utf8(&attr.value).unwrap_or("").to_string(),
                                );
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }

        buf.clear();
    }

    None
}
