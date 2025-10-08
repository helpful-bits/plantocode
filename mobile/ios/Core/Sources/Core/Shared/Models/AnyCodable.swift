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

        // Handle non-JSON-safe types first by converting to string representations
        if let date = value as? Date {
            let dateString = ISO8601DateFormatter().string(from: date)
            try container.encode(dateString)
            return
        }

        if let data = value as? Data {
            let base64String = data.base64EncodedString()
            try container.encode(base64String)
            return
        }

        if let url = value as? URL {
            try container.encode(url.absoluteString)
            return
        }

        // Handle JSON-safe primitives and collections
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let b as Bool:
            try container.encode(b)
        case let i as Int:
            try container.encode(i)
        case let d as Double:
            try container.encode(d)
        case let s as String:
            try container.encode(s)
        case let arr as [Any]:
            let wrapped = arr.map { AnyCodable(any: $0) }
            try container.encode(wrapped)
        case let dict as [String: Any]:
            let wrapped = dict.mapValues { AnyCodable(any: $0) }
            try container.encode(wrapped)
        default:
            // Best-effort string fallback
            try container.encode(String(describing: value))
        }
    }
}