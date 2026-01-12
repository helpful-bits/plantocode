import Foundation
import CommonCrypto

public enum FileHistoryCodecError: Error {
    case invalidState(String)
}

public struct FileHistoryEntryPayload: Codable, Equatable {
    public let includedFiles: String
    public let forceExcludedFiles: String
    public let timestampMs: Int64
    public let deviceId: String?
    public let opType: String?
    public let sequenceNumber: Int64
    public let version: Int64

    enum CodingKeys: String, CodingKey {
        case includedFiles
        case forceExcludedFiles
        case timestampMs
        case deviceId
        case opType
        case sequenceNumber
        case version
    }

    public init(
        includedFiles: String,
        forceExcludedFiles: String,
        timestampMs: Int64,
        deviceId: String?,
        opType: String?,
        sequenceNumber: Int64,
        version: Int64
    ) {
        self.includedFiles = includedFiles
        self.forceExcludedFiles = forceExcludedFiles
        self.timestampMs = timestampMs
        self.deviceId = deviceId
        self.opType = opType
        self.sequenceNumber = sequenceNumber
        self.version = version
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        includedFiles = try container.decode(String.self, forKey: .includedFiles)
        forceExcludedFiles = try container.decode(String.self, forKey: .forceExcludedFiles)
        timestampMs = try container.decode(Int64.self, forKey: .timestampMs)
        deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId)
        opType = try container.decodeIfPresent(String.self, forKey: .opType)
        sequenceNumber = (try? container.decode(Int64.self, forKey: .sequenceNumber)) ?? 0
        version = (try? container.decode(Int64.self, forKey: .version)) ?? 1
    }
}

public struct FileHistoryStatePayload: Codable {
    public var entries: [FileHistoryEntryPayload]
    public var currentIndex: Int64
    public var version: Int64
    public var checksum: String

    enum CodingKeys: String, CodingKey {
        case entries
        case currentIndex
        case version
        case checksum
    }
}

public enum FileHistoryStateCodec {
    public static func decodeState(from dict: [String: Any]) throws -> FileHistoryStatePayload {
        let sanitized = HistoryStateSanitizer.sanitizeForRPC(dict)
        guard JSONSerialization.isValidJSONObject(sanitized) else {
            throw FileHistoryCodecError.invalidState("Invalid file history state payload")
        }
        let data = try JSONSerialization.data(withJSONObject: sanitized)
        return try JSONDecoder().decode(FileHistoryStatePayload.self, from: data)
    }

    public static func encodeState(_ state: FileHistoryStatePayload) throws -> [String: Any] {
        let data = try JSONEncoder().encode(state)
        let obj = try JSONSerialization.jsonObject(with: data)
        guard let dict = obj as? [String: Any] else {
            throw FileHistoryCodecError.invalidState("Failed to encode file history state")
        }
        return dict
    }

    public static func computeChecksum(entries: [FileHistoryEntryPayload], currentIndex: Int64, version: Int64) -> String {
        struct ChecksumEntry: Encodable {
            let includedFiles: String
            let forceExcludedFiles: String
            let timestampMs: Int64
            let deviceId: String?
            let sequenceNumber: Int64
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case includedFiles
                case forceExcludedFiles
                case timestampMs
                case deviceId
                case sequenceNumber
                case version
            }
        }

        struct ChecksumPayload: Encodable {
            let currentIndex: Int64
            let entries: [ChecksumEntry]
            let version: Int64

            enum CodingKeys: String, CodingKey {
                case currentIndex
                case entries
                case version
            }
        }

        let checksumEntries = entries.map { entry in
            ChecksumEntry(
                includedFiles: entry.includedFiles,
                forceExcludedFiles: entry.forceExcludedFiles,
                timestampMs: entry.timestampMs,
                deviceId: entry.deviceId,
                sequenceNumber: entry.sequenceNumber,
                version: entry.version
            )
        }

        let payload = ChecksumPayload(currentIndex: currentIndex, entries: checksumEntries, version: version)
        guard let data = try? JSONEncoder().encode(payload) else {
            return ""
        }

        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }

        return hash.map { String(format: "%02x", $0) }.joined()
    }

    public static func parseFileList(from raw: String) -> [String] {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        if trimmed.hasPrefix("[") && trimmed.hasSuffix("]"),
           let data = trimmed.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [Any] {
            return JSONSanitizer.ensureUniqueStringArray(parsed)
        }

        return []
    }
}
