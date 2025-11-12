import Foundation

public enum HistoryStateSanitizer {
    private static let numericKeys: Set<String> = [
        "version","expectedVersion","currentIndex",
        "createdAt","updatedAt","timestamp","ts","startTime","endTime"
    ]

    public static func sanitizeForRPC(_ value: Any) -> Any {
        switch value {
        case let dict as [String: Any]:
            var out: [String: Any] = [:]
            for (k, v) in dict {
                if numericKeys.contains(k) {
                    out[k] = coerceToIntLike(v)
                } else {
                    out[k] = sanitizeForRPC(v)
                }
            }
            return out
        case let dict as [AnyHashable: Any]:
            var out: [String: Any] = [:]
            for (k, v) in dict {
                let key = String(describing: k)
                if numericKeys.contains(key) {
                    out[key] = coerceToIntLike(v)
                } else {
                    out[key] = sanitizeForRPC(v)
                }
            }
            return out
        case let arr as [Any]:
            return arr.map { sanitizeForRPC($0) }
        default:
            return JSONSanitizer.sanitize(value)
        }
    }

    private static func coerceToIntLike(_ v: Any) -> Any {
        if let b = v as? Bool { return b ? 1 : 0 }
        if let n = v as? NSNumber {
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return n.boolValue ? 1 : 0 }
            return n.int64Value
        }
        if let s = v as? String {
            if let i = Int64(s) { return i }
            if let d = Double(s) { return Int64(d) }
            return 0
        }
        if let i = v as? Int64 { return i }
        if let i = v as? Int { return Int64(i) }
        if let d = v as? Double { return Int64(d) }
        if let f = v as? Float { return Int64(f) }
        return 0
    }
}
