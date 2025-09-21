import Foundation
import Combine

/// High-level workflow manager that provides convenient methods for common workflow operations
public class WorkflowManager: ObservableObject {

    // MARK: - Properties

    public let workflowService: WorkflowService
    private let sessionManager: MobileSessionManager
    private let deviceId: String

    @Published public private(set) var isConnected: Bool = false
    @Published public private(set) var activeWorkflowCount: Int = 0
    @Published public private(set) var recentResults: [WorkflowResultSummary] = []

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(baseURL: URL, deviceId: String) {
        self.workflowService = WorkflowService(baseURL: baseURL)
        self.sessionManager = MobileSessionManager(baseURL: baseURL, deviceId: deviceId)
        self.deviceId = deviceId

        setupBindings()
    }

    // MARK: - Session Management

    public func connect() async throws {
        try await sessionManager.establishSession()
        await MainActor.run {
            self.isConnected = true
        }
    }

    public func disconnect() {
        sessionManager.terminateSession()
        isConnected = false
    }

    // MARK: - Quick Actions

    /// Quick file search in project
    public func searchInProject(
        pattern: String,
        projectPath: String,
        fileTypes: [String] = [],
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<[FileSearchResult], WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let params = FileSearchParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            pattern: pattern,
            paths: [projectPath],
            fileTypes: fileTypes,
            caseSensitive: false,
            includeContent: true,
            maxResults: 100
        )

        workflowService.startFileSearch(
            params: params,
            onProgress: { event in
                // Extract progress information from stream event
                let progressText = "Searching files..."
                let progressPercent: Float = 0.0 // Would extract from event data
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let searchResult = workflowResult.result {
                        completion(.success(searchResult.results))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    /// Quick text improvement
    public func improveText(
        text: String,
        improvementType: ImprovementType = .clarity,
        targetAudience: TargetAudience = .general,
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<String, WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let params = TaskImprovementParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            originalText: text,
            improvementType: improvementType,
            targetAudience: targetAudience
        )

        workflowService.startTaskImprovement(
            params: params,
            onProgress: { event in
                let progressText = "Improving text..."
                let progressPercent: Float = 0.0
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let improvementResult = workflowResult.result {
                        completion(.success(improvementResult.improvedText))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    /// Quick voice transcription
    public func transcribeAudio(
        audioFilePath: String,
        language: LanguageCode = .english,
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<String, WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let params = VoiceDictationParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            audioFilePath: audioFilePath,
            audioFormat: .m4a, // Default for iOS
            language: language
        )

        workflowService.startVoiceDictation(
            params: params,
            onProgress: { event in
                let progressText = "Transcribing audio..."
                let progressPercent: Float = 0.0
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let transcriptionResult = workflowResult.result {
                        completion(.success(transcriptionResult.transcription.text))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    /// Quick research on a topic
    public func researchTopic(
        topic: String,
        depth: ResearchDepth = .standard,
        includeWebSearch: Bool = true,
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<ResearchWorkflowResult, WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let sources: [ResearchSource] = includeWebSearch ?
            [.webSearch(query: topic, domains: [], excludeDomains: [])] : []

        let params = ResearchParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            topic: topic,
            researchDepth: depth,
            sources: sources,
            includeWebSearch: includeWebSearch
        )

        workflowService.startResearch(
            params: params,
            onProgress: { event in
                let progressText = "Researching topic..."
                let progressPercent: Float = 0.0
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let researchResult = workflowResult.result {
                        completion(.success(researchResult))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    /// Generate implementation plan
    public func generatePlan(
        projectDescription: String,
        scope: String = "FullProject",
        requirements: [String] = [],
        objectives: [String] = [],
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<ImplementationPlan, WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let params = PlanGenerationParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            projectDescription: projectDescription,
            planningScope: scope,
            technicalRequirements: requirements,
            businessObjectives: objectives
        )

        workflowService.startPlanGeneration(
            params: params,
            onProgress: { event in
                let progressText = "Generating plan..."
                let progressPercent: Float = 0.0
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let planResult = workflowResult.result {
                        completion(.success(planResult.implementationPlan))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    /// Merge multiple plans
    public func mergePlans(
        plans: [SourcePlan],
        strategy: String = "SmartMerge",
        onProgress: @escaping (String, Float) -> Void = { _, _ in },
        completion: @escaping (Result<MergedPlan, WorkflowError>) -> Void
    ) {
        let sessionId = sessionManager.currentSessionId ?? UUID().uuidString
        let params = MergeWorkflowParams(
            base: BaseWorkflowParams(mobileSessionId: sessionId),
            sourcePlans: plans,
            mergeStrategy: strategy
        )

        workflowService.startMerge(
            params: params,
            onProgress: { event in
                let progressText = "Merging plans..."
                let progressPercent: Float = 0.0
                onProgress(progressText, progressPercent)
            },
            completion: { result in
                switch result {
                case .success(let workflowResult):
                    if let mergeResult = workflowResult.result {
                        completion(.success(mergeResult.mergedPlan))
                    } else {
                        completion(.failure(.invalidResponse))
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        )
    }

    // MARK: - Workflow Management

    public func cancelAllWorkflows() {
        for workflowId in workflowService.activeWorkflows.keys {
            workflowService.cancelWorkflow(workflowId) { _ in }
        }
    }

    public func getWorkflowHistory() -> [WorkflowResultSummary] {
        return recentResults
    }

    public func clearWorkflowHistory() {
        recentResults.removeAll()
    }

    // MARK: - Private Methods

    private func setupBindings() {
        workflowService.$activeWorkflows
            .map { $0.count }
            .assign(to: \.activeWorkflowCount, on: self)
            .store(in: &cancellables)

        // Monitor completed workflows and add to recent results
        workflowService.$workflowResults
            .sink { [weak self] results in
                guard let self = self else { return }

                // Convert to summaries and update recent results
                let summaries = results.compactMap { (id, result) -> WorkflowResultSummary? in
                    // This would need proper type handling in a real implementation
                    return WorkflowResultSummary(
                        id: id,
                        type: "Unknown", // Would determine from result type
                        completedAt: Date(),
                        success: true,
                        summary: "Workflow completed successfully"
                    )
                }

                self.recentResults = Array(summaries.suffix(20)) // Keep last 20 results
            }
            .store(in: &cancellables)
    }
}

// MARK: - Mobile Session Manager

public class MobileSessionManager {
    private let baseURL: URL
    private let deviceId: String

    public private(set) var currentSessionId: String?
    public private(set) var isConnected: Bool = false

    public init(baseURL: URL, deviceId: String) {
        self.baseURL = baseURL
        self.deviceId = deviceId
    }

    public func establishSession() async throws {
        let url = baseURL.appendingPathComponent("mobile/session/establish")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let sessionRequest = SessionEstablishRequest(
            deviceId: deviceId,
            deviceType: "iOS",
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            capabilities: [
                "workflows",
                "file_search",
                "voice_dictation",
                "text_improvement",
                "research",
                "plan_generation",
                "merge"
            ]
        )

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        request.httpBody = try encoder.encode(sessionRequest)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw WorkflowError.serverError("Failed to establish session")
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let sessionResponse = try decoder.decode(SessionEstablishResponse.self, from: data)

        currentSessionId = sessionResponse.sessionId
        isConnected = true
    }

    public func terminateSession() {
        guard let sessionId = currentSessionId else { return }

        let url = baseURL.appendingPathComponent("mobile/session/terminate/\(sessionId)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        URLSession.shared.dataTask(with: request).resume()

        currentSessionId = nil
        isConnected = false
    }
}

// MARK: - Supporting Types

public struct WorkflowResultSummary: Identifiable {
    public let id: UUID
    public let type: String
    public let completedAt: Date
    public let success: Bool
    public let summary: String
}

public struct SessionEstablishRequest: Codable {
    public let deviceId: String
    public let deviceType: String
    public let appVersion: String
    public let capabilities: [String]
}

public struct SessionEstablishResponse: Codable {
    public let sessionId: String
    public let authorizedWorkflows: [String]
    public let rateLimits: [String: Int]
    public let expiresAt: Date
}

// MARK: - Convenience Extensions

public extension WorkflowManager {

    /// Search for files containing specific text
    func searchForText(
        _ searchText: String,
        in projectPath: String,
        completion: @escaping (Result<[FileSearchResult], WorkflowError>) -> Void
    ) {
        searchInProject(
            pattern: searchText,
            projectPath: projectPath,
            completion: completion
        )
    }

    /// Improve text for specific audience
    func improveTextForAudience(
        _ text: String,
        audience: TargetAudience,
        completion: @escaping (Result<String, WorkflowError>) -> Void
    ) {
        improveText(
            text: text,
            improvementType: .clarity,
            targetAudience: audience,
            completion: completion
        )
    }

    /// Quick voice memo transcription
    func transcribeVoiceMemo(
        at path: String,
        completion: @escaping (Result<String, WorkflowError>) -> Void
    ) {
        transcribeAudio(
            audioFilePath: path,
            language: .english,
            completion: completion
        )
    }

    /// Research with web sources
    func webResearch(
        topic: String,
        completion: @escaping (Result<String, WorkflowError>) -> Void
    ) {
        researchTopic(
            topic: topic,
            depth: .standard,
            includeWebSearch: true
        ) { result in
            switch result {
            case .success(let research):
                completion(.success(research.executiveSummary))
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }
}