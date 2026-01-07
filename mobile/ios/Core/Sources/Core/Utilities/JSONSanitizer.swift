import Foundation
import CoreGraphics

public enum JSONSanitizer {
    public static func sanitize(_ value: Any) -> Any {
        // NSNull passthrough
        if value is NSNull {
            return value
        }

        // Unwrap Optionals
        if let optional = value as? (any OptionalProtocol) {
            if let unwrapped = optional.wrappedValue {
                return sanitize(unwrapped)
            } else {
                return NSNull()
            }
        }

        // NSNumber first with CFBoolean check to avoid 0/1 -> Bool
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue
            }
            return number
        }

        // Native numeric types before Bool to prevent coercion
        if value is Int || value is Int8 || value is Int16 || value is Int32 || value is Int64 ||
           value is UInt || value is UInt8 || value is UInt16 || value is UInt32 || value is UInt64 {
            return value
        }
        if let float = value as? Float {
            if float.isNaN || float.isInfinite { return NSNull() }
            return Double(float)
        }
        if let double = value as? Double {
            if double.isNaN || double.isInfinite { return NSNull() }
            return double
        }

        // Bool
        if let bool = value as? Bool { return bool }

        // Strings
        if let str = value as? String { return str }
        if let substr = value as? Substring { return String(substr) }

        // Date -> ISO8601
        if let date = value as? Date {
            let formatter = ISO8601DateFormatter()
            return formatter.string(from: date)
        }

        // Data -> Base64
        if let data = value as? Data { return data.base64EncodedString() }

        // URL/UUID -> String
        if let url = value as? URL { return url.absoluteString }
        if let uuid = value as? UUID { return uuid.uuidString }

        // NSRange/Range<Int>
        if let range = value as? NSRange {
            return ["location": range.location, "length": range.length]
        }
        if let range = value as? Range<Int> {
            return ["location": range.lowerBound, "length": range.upperBound - range.lowerBound]
        }

        // CoreGraphics
        if let point = value as? CGPoint { return ["x": point.x, "y": point.y] }
        if let size = value as? CGSize { return ["width": size.width, "height": size.height] }
        if let rect = value as? CGRect {
            return ["x": rect.origin.x, "y": rect.origin.y, "width": rect.size.width, "height": rect.size.height]
        }

        // Error
        if let error = value as? Error { return String(describing: error) }

        // Dictionaries
        if let dict = value as? [String: Any] {
            var sanitized: [String: Any] = [:]
            for (k, v) in dict { sanitized[k] = sanitize(v) }
            return sanitized
        }
        if let dict = value as? [AnyHashable: Any] {
            var sanitized: [String: Any] = [:]
            for (k, v) in dict { sanitized[String(describing: k)] = sanitize(v) }
            return sanitized
        }

        // Arrays
        if let array = value as? [Any] { return array.map { sanitize($0) } }

        // Default
        return String(describing: value)
    }

    public static func isValidJSONObject(_ value: Any) -> Bool {
        JSONSerialization.isValidJSONObject(value)
    }

    // MARK: - String Array Sanitization

    /// Ensures the input is a flat array of valid, non-empty strings.
    /// Handles various edge cases:
    /// - If input is `[String]`, returns filtered for non-empty strings
    /// - If input is a String looking like a JSON array (starts `[`, ends `]`), attempts JSON decode to `[String]`
    /// - If input is a regular String, returns `[input]` only if valid path (non-empty, not JSON-looking)
    /// - If input is `[Any]`, compactMaps strings, flattens nested arrays recursively
    /// - Parameters:
    ///   - input: The value to sanitize (can be String, [String], [Any], or other)
    /// - Returns: A flat array of valid non-empty strings, or empty array if invalid
    public static func ensureStringArray(_ input: Any) -> [String] {
        // Handle string input
        if let stringValue = input as? String {
            let trimmed = stringValue.trimmingCharacters(in: .whitespacesAndNewlines)

            // Check if it looks like a JSON array
            if trimmed.hasPrefix("[") && trimmed.hasSuffix("]") {
                // Attempt to parse as JSON array
                if let data = trimmed.data(using: .utf8),
                   let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
                    return ensureStringArray(parsed)
                }
                // Failed to parse - return empty (invalid JSON-looking string)
                return []
            }

            // Regular string - return as single-element array if non-empty
            if !trimmed.isEmpty {
                return [trimmed]
            }
            return []
        }

        // Handle array of strings directly
        if let stringArray = input as? [String] {
            return stringArray
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { str in
                    // Filter out empty strings and strings that look like JSON arrays
                    !str.isEmpty && !(str.hasPrefix("[") && str.hasSuffix("]"))
                }
        }

        // Handle array of Any (may contain mixed types or nested arrays)
        if let anyArray = input as? [Any] {
            var result: [String] = []
            for element in anyArray {
                // Recursively process nested arrays
                if element is [Any] {
                    result.append(contentsOf: ensureStringArray(element))
                } else if let str = element as? String {
                    let trimmed = str.trimmingCharacters(in: .whitespacesAndNewlines)

                    // Check if this element is a stringified JSON array
                    if trimmed.hasPrefix("[") && trimmed.hasSuffix("]") {
                        // Attempt to parse and flatten
                        if let data = trimmed.data(using: .utf8),
                           let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
                            result.append(contentsOf: ensureStringArray(parsed))
                        }
                        // If parse fails, skip this malformed entry
                    } else if !trimmed.isEmpty {
                        result.append(trimmed)
                    }
                }
                // Skip non-string, non-array elements
            }
            return result
        }

        // Unknown type - return empty array
        return []
    }

    /// Convenience method that also deduplicates the result while preserving order
    /// - Parameter input: The value to sanitize
    /// - Returns: A deduplicated flat array of valid non-empty strings
    public static func ensureUniqueStringArray(_ input: Any) -> [String] {
        let strings = ensureStringArray(input)
        var seen = Set<String>()
        return strings.filter { str in
            if seen.contains(str) {
                return false
            }
            seen.insert(str)
            return true
        }
    }
}

private protocol OptionalProtocol { var wrappedValue: Any? { get } }
extension Optional: OptionalProtocol {
    fileprivate var wrappedValue: Any? {
        switch self {
        case .none: return nil
        case .some(let wrapped): return wrapped
        }
    }
}
