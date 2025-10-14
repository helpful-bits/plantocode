import Foundation

/// Utility for replacing placeholders in template strings with dynamic values
public struct PlaceholderUtils {

    // MARK: - Public Methods

    /// Replace placeholders in a template string with provided data
    ///
    /// This method searches for placeholders in the format `{{KEY}}` or `{{ KEY }}`
    /// (with optional whitespace) and replaces them with corresponding values from the data dictionary.
    ///
    /// - Parameters:
    ///   - template: The template string containing placeholders
    ///   - data: Dictionary mapping placeholder keys to replacement values. Nil values are treated as empty strings.
    ///
    /// - Returns: The template string with all placeholders replaced
    ///
    /// - Note: The replacement is case-sensitive and handles whitespace inside braces.
    ///
    /// Example:
    /// ```swift
    /// let template = "Hello {{NAME}}, your code is {{ STATUS }}!"
    /// let data: [String: String?] = ["NAME": "Alice", "STATUS": "ready"]
    /// let result = PlaceholderUtils.replacePlaceholders(template: template, data: data)
    /// // result: "Hello Alice, your code is ready!"
    /// ```
    public static func replacePlaceholders(template: String, data: [String: String?]) -> String {
        var result = template

        for (key, value) in data {
            // Treat nil values as empty strings
            let replacementValue = value ?? ""

            // Create regex pattern that matches {{KEY}} or {{ KEY }} (with optional whitespace)
            // We need to escape special regex characters in the key
            let escapedKey = NSRegularExpression.escapedPattern(for: key)
            let pattern = "\\{\\{\\s*\(escapedKey)\\s*\\}\\}"

            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
                // If regex creation fails, fallback to simple replacement
                let placeholder = "{{\(key)}}"
                result = result.replacingOccurrences(of: placeholder, with: replacementValue)
                continue
            }

            // Replace all occurrences
            let nsResult = result as NSString
            let range = NSRange(location: 0, length: nsResult.length)
            result = regex.stringByReplacingMatches(
                in: result,
                options: [],
                range: range,
                withTemplate: NSRegularExpression.escapedTemplate(for: replacementValue)
            )
        }

        return result
    }
}
