import Foundation

public struct ProviderInfo: Codable, Equatable {
    public let code: String
    public let name: String

    public init(code: String, name: String) {
        self.code = code
        self.name = name
    }
}

public struct ModelInfo: Codable, Equatable {
    public let id: String
    public let name: String
    public let provider: String
    public let providerName: String
    public let description: String?
    public let contextWindow: Int?
    public let priceInputPerMillion: String
    public let priceOutputPerMillion: String
    public let priceCacheRead: String?
    public let priceCacheWrite: String?

    public init(id: String, name: String, provider: String, providerName: String, description: String?, contextWindow: Int?, priceInputPerMillion: String, priceOutputPerMillion: String, priceCacheRead: String?, priceCacheWrite: String?) {
        self.id = id
        self.name = name
        self.provider = provider
        self.providerName = providerName
        self.description = description
        self.contextWindow = contextWindow
        self.priceInputPerMillion = priceInputPerMillion
        self.priceOutputPerMillion = priceOutputPerMillion
        self.priceCacheRead = priceCacheRead
        self.priceCacheWrite = priceCacheWrite
    }
}

public struct ProviderWithModels: Codable, Equatable {
    public let provider: ProviderInfo
    public let models: [ModelInfo]

    public init(provider: ProviderInfo, models: [ModelInfo]) {
        self.provider = provider
        self.models = models
    }
}

public struct TaskModelSettings: Codable, Equatable {
    public var model: String
    public var temperature: Double
    public var maxTokens: Int
    public var copyButtons: [CopyButton]?
    public var allowedModels: [String]?
    public var languageCode: String?  // For voice transcription (e.g., "en", "es", "fr")
    public var prompt: String?        // For voice transcription context/hints

    public init(model: String, temperature: Double, maxTokens: Int, copyButtons: [CopyButton]? = nil, allowedModels: [String]? = nil, languageCode: String? = nil, prompt: String? = nil) {
        self.model = model
        self.temperature = temperature
        self.maxTokens = maxTokens
        self.copyButtons = copyButtons
        self.allowedModels = allowedModels
        self.languageCode = languageCode
        self.prompt = prompt
    }
}

public typealias ProjectTaskSettings = [String: TaskModelSettings]

// MARK: - Provider Filtering

public extension Array where Element == ProviderWithModels {
    /// Filters providers and their models based on an allowed models list.
    /// If allowedModels is nil or empty, returns self unchanged.
    /// Otherwise, filters each provider's models to only include those in the allowed set,
    /// and removes providers that have no models left after filtering.
    func filtered(by allowedModels: [String]?) -> [ProviderWithModels] {
        guard let allowedModels = allowedModels, !allowedModels.isEmpty else {
            return self
        }

        let allowedSet = Set(allowedModels)

        return self
            .map { provider in
                ProviderWithModels(
                    provider: provider.provider,
                    models: provider.models.filter { allowedSet.contains($0.id) }
                )
            }
            .filter { !$0.models.isEmpty }
    }
}
