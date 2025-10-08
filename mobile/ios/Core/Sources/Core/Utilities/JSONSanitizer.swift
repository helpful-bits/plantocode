import Foundation
import CoreGraphics

/// Utility for deep sanitization of arbitrary Swift values into JSON-compatible types.
/// Ensures all values can be safely serialized via JSONSerialization without runtime crashes.
public enum JSONSanitizer {

    /// Recursively sanitizes a value to ensure JSON compatibility.
    /// - Parameter value: The value to sanitize
    /// - Returns: A JSON-compatible version of the value
    public static func sanitize(_ value: Any) -> Any {
        // Handle optionals by unwrapping or converting to NSNull
        if let optional = value as? (any OptionalProtocol) {
            if let unwrapped = optional.wrappedValue {
                return sanitize(unwrapped)
            } else {
                return NSNull()
            }
        }

        // Handle String and Substring
        if let str = value as? String {
            return str
        }
        if let substr = value as? Substring {
            return String(substr)
        }

        // Handle Bool (must come before NSNumber to avoid bool->number conversion)
        if let bool = value as? Bool {
            return bool
        }

        // Handle NSNumber explicitly
        if let number = value as? NSNumber {
            return number
        }

        // Handle numeric types
        if let int = value as? Int {
            return int
        }
        if let int32 = value as? Int32 {
            return Int(int32)
        }
        if let int64 = value as? Int64 {
            return int64
        }
        if let double = value as? Double {
            return double
        }
        if let float = value as? Float {
            return Double(float)
        }

        // Handle Date - convert to ISO8601 string
        if let date = value as? Date {
            let formatter = ISO8601DateFormatter()
            return formatter.string(from: date)
        }

        // Handle Data - convert to base64 string
        if let data = value as? Data {
            return data.base64EncodedString()
        }

        // Handle URL - convert to absolute string
        if let url = value as? URL {
            return url.absoluteString
        }

        // Handle UUID - convert to string
        if let uuid = value as? UUID {
            return uuid.uuidString
        }

        // Handle NSRange - convert to dictionary
        if let range = value as? NSRange {
            return [
                "location": range.location,
                "length": range.length
            ]
        }

        // Handle Range<Int> - convert to dictionary
        if let range = value as? Range<Int> {
            return [
                "location": range.lowerBound,
                "length": range.upperBound - range.lowerBound
            ]
        }

        // Handle CoreGraphics types
        if let point = value as? CGPoint {
            return [
                "x": point.x,
                "y": point.y
            ]
        }
        if let size = value as? CGSize {
            return [
                "width": size.width,
                "height": size.height
            ]
        }
        if let rect = value as? CGRect {
            return [
                "x": rect.origin.x,
                "y": rect.origin.y,
                "width": rect.size.width,
                "height": rect.size.height
            ]
        }

        // Handle Error types - convert to string description
        if let error = value as? Error {
            return String(describing: error)
        }

        // Handle [String: Any] dictionaries - recursively sanitize
        if let dict = value as? [String: Any] {
            var sanitized: [String: Any] = [:]
            for (key, val) in dict {
                sanitized[key] = sanitize(val)
            }
            return sanitized
        }

        // Handle [AnyHashable: Any] dictionaries - convert keys to String and recursively sanitize
        if let dict = value as? [AnyHashable: Any] {
            var sanitized: [String: Any] = [:]
            for (key, val) in dict {
                let stringKey = String(describing: key)
                sanitized[stringKey] = sanitize(val)
            }
            return sanitized
        }

        // Handle [Any] arrays - recursively sanitize each element
        if let array = value as? [Any] {
            return array.map { sanitize($0) }
        }

        // Default case: stringify unknown types
        return String(describing: value)
    }

    /// Validates that a value is a valid JSON object compatible with JSONSerialization.
    /// - Parameter value: The value to validate
    /// - Returns: true if the value can be serialized to JSON, false otherwise
    public static func isValidJSONObject(_ value: Any) -> Bool {
        return JSONSerialization.isValidJSONObject(value)
    }
}

/// Protocol to detect optional types at runtime
private protocol OptionalProtocol {
    var wrappedValue: Any? { get }
}

extension Optional: OptionalProtocol {
    fileprivate var wrappedValue: Any? {
        switch self {
        case .none:
            return nil
        case .some(let wrapped):
            return wrapped
        }
    }
}
