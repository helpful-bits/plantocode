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
