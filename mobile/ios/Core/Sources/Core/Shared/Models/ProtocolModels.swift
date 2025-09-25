import Foundation

// RPC Request/Response models matching desktop
public struct DesktopRpcRequest: Codable {
    public let method: String
    public let params: AnyCodable
    public let correlationId: String
    public let auth: String?

    public init(method: String, params: AnyCodable, correlationId: String, auth: String? = nil) {
        self.method = method
        self.params = params
        self.correlationId = correlationId
        self.auth = auth
    }
}

public struct DesktopRpcResponse: Codable {
    public let correlationId: String
    public let result: AnyCodable?
    public let error: String?

    public init(correlationId: String, result: AnyCodable? = nil, error: String? = nil) {
        self.correlationId = correlationId
        self.result = result
        self.error = error
    }
}

// Server Event model
public struct ServerEvent: Codable {
    public let id: String
    public let eventType: String
    public let data: AnyCodable
    public let timestamp: Date
    public let sequence: UInt64
    public let sourceDevice: String?
    public let userId: String?
    public let priority: UInt8

    // Alias for backward compatibility
    public var payload: AnyCodable { data }

    enum CodingKeys: String, CodingKey {
        case id, data, timestamp, sequence, priority
        case eventType = "event_type"
        case sourceDevice = "source_device"
        case userId = "user_id"
    }

    public init(id: String, eventType: String, data: AnyCodable, timestamp: Date, sequence: UInt64, sourceDevice: String? = nil, userId: String? = nil, priority: UInt8 = 0) {
        self.id = id
        self.eventType = eventType
        self.data = data
        self.timestamp = timestamp
        self.sequence = sequence
        self.sourceDevice = sourceDevice
        self.userId = userId
        self.priority = priority
    }
}

// Connection Handshake
public struct ConnectionHandshake: Codable, Equatable {
    public let sessionId: String
    public let clientId: String
    public let transport: String

    public init(sessionId: String, clientId: String, transport: String) {
        self.sessionId = sessionId
        self.clientId = clientId
        self.transport = transport
    }
}