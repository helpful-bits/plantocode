// Canonical shared AnyCodable
import Foundation

public struct AnyCodable: Codable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(any value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let boolVal = try? container.decode(Bool.self) {
            self.value = boolVal
        } else if let intVal = try? container.decode(Int.self) {
            self.value = intVal
        } else if let doubleVal = try? container.decode(Double.self) {
            self.value = doubleVal
        } else if let stringVal = try? container.decode(String.self) {
            self.value = stringVal
        } else if let arrayVal = try? container.decode([AnyCodable].self) {
            self.value = arrayVal.map { $0.value }
        } else if let dictVal = try? container.decode([String: AnyCodable].self) {
            var dict: [String: Any] = [:]
            for (k, v) in dictVal { dict[k] = v.value }
            self.value = dict
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported AnyCodable value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        let sanitized = JSONSanitizer.sanitize(self.value)

        switch sanitized {
        case is NSNull:
            try container.encodeNil()
        case let b as Bool:
            try container.encode(b)
        case let i as Int:
            try container.encode(i)
        case let i8 as Int8:
            try container.encode(i8)
        case let i16 as Int16:
            try container.encode(i16)
        case let i32 as Int32:
            try container.encode(i32)
        case let i64 as Int64:
            try container.encode(i64)
        case let u as UInt:
            try container.encode(u)
        case let u8 as UInt8:
            try container.encode(u8)
        case let u16 as UInt16:
            try container.encode(u16)
        case let u32 as UInt32:
            try container.encode(u32)
        case let u64 as UInt64:
            try container.encode(u64)
        case let f as Float:
            try container.encode(f)
        case let d as Double:
            try container.encode(d)
        case let s as String:
            try container.encode(s)
        case let arr as [Any]:
            try container.encode(arr.map { AnyCodable(any: $0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable(any: $0) })
        case let n as NSNumber:
            // Fallback for Objective-C numeric values
            if CFGetTypeID(n) == CFBooleanGetTypeID() {
                try container.encode(n.boolValue)
            } else {
                let objCType = String(cString: n.objCType)
                if objCType == "q" { try container.encode(n.int64Value) }
                else if objCType == "Q" { try container.encode(n.uint64Value) }
                else if objCType == "d" { try container.encode(n.doubleValue) }
                else if objCType == "f" { try container.encode(Float(truncating: n)) }
                else { try container.encode(n.int64Value) }
            }
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(codingPath: container.codingPath,
                                      debugDescription: "Unsupported AnyCodable value after sanitization: \(type(of: value))")
            )
        }
    }
}