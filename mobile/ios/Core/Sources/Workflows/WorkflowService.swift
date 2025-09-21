import Foundation
import Combine

/// Main workflow service for initiating and managing desktop workflows from mobile
public class WorkflowService: ObservableObject {

    // MARK: - Properties

    private let baseURL: URL
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    @Published public private(set) var activeWorkflows: [UUID: WorkflowStatus] = [:]
    @Published public private(set) var workflowResults: [UUID: Any] = [:]

    private var streamingTasks: [UUID: URLSessionDataTask] = [:]
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(baseURL: URL) {
        self.baseURL = baseURL
        self.session = URLSession(configuration: .default)

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .convertToSnakeCase

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    // MARK: - Public API

    /// Start a file search workflow
    public func startFileSearch(
        params: FileSearchParams,
        onProgress: @escaping (FileSearchStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<FileSearchWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/file_search/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Start a research workflow
    public func startResearch(
        params: ResearchParams,
        onProgress: @escaping (ResearchStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<ResearchWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/research/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Start a task improvement workflow
    public func startTaskImprovement(
        params: TaskImprovementParams,
        onProgress: @escaping (TaskImprovementStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<TaskImprovementWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/task_improvement/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Start a voice dictation workflow
    public func startVoiceDictation(
        params: VoiceDictationParams,
        onProgress: @escaping (VoiceDictationStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<VoiceDictationWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/voice_dictation/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Start a plan generation workflow
    public func startPlanGeneration(
        params: PlanGenerationParams,
        onProgress: @escaping (PlanGenerationStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<PlanGenerationWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/plan_generation/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Start a merge workflow
    public func startMerge(
        params: MergeWorkflowParams,
        onProgress: @escaping (MergeStreamEvent) -> Void,
        completion: @escaping (Result<WorkflowResult<MergeWorkflowResult>, WorkflowError>) -> Void
    ) {
        startWorkflow(
            endpoint: "workflow/merge/start",
            params: params,
            onProgress: onProgress,
            completion: completion
        )
    }

    /// Cancel a running workflow
    public func cancelWorkflow(_ workflowId: UUID, completion: @escaping (Result<Void, WorkflowError>) -> Void) {
        let url = baseURL.appendingPathComponent("workflow/cancel/\(workflowId.uuidString)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error.localizedDescription)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(.invalidResponse))
                    return
                }

                if httpResponse.statusCode == 200 {
                    // Cancel streaming task if exists
                    self.streamingTasks[workflowId]?.cancel()
                    self.streamingTasks.removeValue(forKey: workflowId)

                    // Update status
                    self.activeWorkflows[workflowId] = .cancelled

                    completion(.success(()))
                } else {
                    let errorMessage = String(data: data ?? Data(), encoding: .utf8) ?? "Unknown error"
                    completion(.failure(.serverError(errorMessage)))
                }
            }
        }.resume()
    }

    /// Get status of a workflow
    public func getWorkflowStatus(_ workflowId: UUID, completion: @escaping (Result<WorkflowStatus, WorkflowError>) -> Void) {
        let url = baseURL.appendingPathComponent("workflow/status/\(workflowId.uuidString)")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error.localizedDescription)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse,
                      let data = data else {
                    completion(.failure(.invalidResponse))
                    return
                }

                if httpResponse.statusCode == 200 {
                    do {
                        let status = try self.decoder.decode(WorkflowStatus.self, from: data)
                        self.activeWorkflows[workflowId] = status
                        completion(.success(status))
                    } catch {
                        completion(.failure(.decodingError(error.localizedDescription)))
                    }
                } else {
                    let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                    completion(.failure(.serverError(errorMessage)))
                }
            }
        }.resume()
    }

    /// Get result of a completed workflow
    public func getWorkflowResult<T: Codable>(
        _ workflowId: UUID,
        resultType: T.Type,
        completion: @escaping (Result<WorkflowResult<T>, WorkflowError>) -> Void
    ) {
        let url = baseURL.appendingPathComponent("workflow/result/\(workflowId.uuidString)")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error.localizedDescription)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse,
                      let data = data else {
                    completion(.failure(.invalidResponse))
                    return
                }

                if httpResponse.statusCode == 200 {
                    do {
                        let result = try self.decoder.decode(WorkflowResult<T>.self, from: data)
                        self.workflowResults[workflowId] = result
                        completion(.success(result))
                    } catch {
                        completion(.failure(.decodingError(error.localizedDescription)))
                    }
                } else {
                    let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                    completion(.failure(.serverError(errorMessage)))
                }
            }
        }.resume()
    }

    /// Get list of all active workflows
    public func getAllActiveWorkflows(completion: @escaping (Result<[WorkflowSummary], WorkflowError>) -> Void) {
        let url = baseURL.appendingPathComponent("workflow/active")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error.localizedDescription)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse,
                      let data = data else {
                    completion(.failure(.invalidResponse))
                    return
                }

                if httpResponse.statusCode == 200 {
                    do {
                        let workflows = try self.decoder.decode([WorkflowSummary].self, from: data)
                        completion(.success(workflows))
                    } catch {
                        completion(.failure(.decodingError(error.localizedDescription)))
                    }
                } else {
                    let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                    completion(.failure(.serverError(errorMessage)))
                }
            }
        }.resume()
    }

    // MARK: - Private Methods

    private func startWorkflow<Params: Codable, StreamEvent: Codable, Result: Codable>(
        endpoint: String,
        params: Params,
        onProgress: @escaping (StreamEvent) -> Void,
        completion: @escaping (Swift.Result<WorkflowResult<Result>, WorkflowError>) -> Void
    ) {
        let url = baseURL.appendingPathComponent(endpoint)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try encoder.encode(params)
        } catch {
            completion(.failure(.encodingError(error.localizedDescription)))
            return
        }

        let task = session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(.networkError(error.localizedDescription)))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse,
                      let data = data else {
                    completion(.failure(.invalidResponse))
                    return
                }

                if httpResponse.statusCode == 200 {
                    do {
                        let workflowResponse = try self.decoder.decode(WorkflowStartResponse.self, from: data)
                        let workflowId = workflowResponse.workflowId

                        // Update status
                        self.activeWorkflows[workflowId] = .running

                        // Start streaming progress
                        self.startStreaming(
                            workflowId: workflowId,
                            onProgress: onProgress,
                            completion: completion
                        )

                    } catch {
                        completion(.failure(.decodingError(error.localizedDescription)))
                    }
                } else {
                    let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                    completion(.failure(.serverError(errorMessage)))
                }
            }
        }

        task.resume()
    }

    private func startStreaming<StreamEvent: Codable, Result: Codable>(
        workflowId: UUID,
        onProgress: @escaping (StreamEvent) -> Void,
        completion: @escaping (Swift.Result<WorkflowResult<Result>, WorkflowError>) -> Void
    ) {
        let url = baseURL.appendingPathComponent("workflow/stream/\(workflowId.uuidString)")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        let task = session.dataTask(with: request) { data, response, error in
            // This is a simplified streaming implementation
            // In a real implementation, you'd need to handle Server-Sent Events properly
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(.networkError(error.localizedDescription)))
                }
                return
            }

            guard let data = data else {
                DispatchQueue.main.async {
                    completion(.failure(.invalidResponse))
                }
                return
            }

            // Parse streaming data
            let lines = String(data: data, encoding: .utf8)?.components(separatedBy: .newlines) ?? []

            for line in lines {
                if line.hasPrefix("data: ") {
                    let jsonString = String(line.dropFirst(6))
                    if let jsonData = jsonString.data(using: .utf8) {
                        do {
                            if let streamEvent = try? self.decoder.decode(StreamEvent.self, from: jsonData) {
                                DispatchQueue.main.async {
                                    onProgress(streamEvent)
                                }
                            } else if let workflowResult = try? self.decoder.decode(WorkflowResult<Result>.self, from: jsonData) {
                                DispatchQueue.main.async {
                                    self.activeWorkflows[workflowId] = .completed
                                    self.workflowResults[workflowId] = workflowResult
                                    completion(.success(workflowResult))
                                }
                                return
                            }
                        } catch {
                            // Continue processing other events
                        }
                    }
                }
            }
        }

        streamingTasks[workflowId] = task
        task.resume()
    }
}

// MARK: - Supporting Types

public enum WorkflowStatus: String, Codable {
    case queued = "Queued"
    case running = "Running"
    case completed = "Completed"
    case failed = "Failed"
    case cancelled = "Cancelled"
    case paused = "Paused"
}

public enum WorkflowError: Error, LocalizedError {
    case networkError(String)
    case serverError(String)
    case encodingError(String)
    case decodingError(String)
    case invalidResponse
    case unauthorized
    case rateLimited
    case workflowNotFound(UUID)
    case validationError(String)

    public var errorDescription: String? {
        switch self {
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .encodingError(let message):
            return "Encoding error: \(message)"
        case .decodingError(let message):
            return "Decoding error: \(message)"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Unauthorized access"
        case .rateLimited:
            return "Rate limit exceeded"
        case .workflowNotFound(let id):
            return "Workflow not found: \(id)"
        case .validationError(let message):
            return "Validation error: \(message)"
        }
    }
}

public struct WorkflowStartResponse: Codable {
    public let workflowId: UUID
    public let status: WorkflowStatus
    public let estimatedDurationSeconds: Int?
}

public struct WorkflowSummary: Codable {
    public let id: UUID
    public let type: String
    public let status: WorkflowStatus
    public let createdAt: Date
    public let estimatedCompletion: Date?
    public let progress: WorkflowProgress?
}

// MARK: - Stream Event Types

public struct FileSearchStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: FileSearchEventData?
    public let timestamp: Date
}

public struct FileSearchEventData: Codable {
    // Define based on your stream event data structure
    public let type: String
    public let message: String?
    public let progress: Float?
    public let result: FileSearchResult?
}

public struct ResearchStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: ResearchEventData?
    public let timestamp: Date
}

public struct ResearchEventData: Codable {
    public let type: String
    public let message: String?
    public let progress: Float?
    public let finding: ResearchFinding?
}

public struct TaskImprovementStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: TaskImprovementEventData?
    public let timestamp: Date
}

public struct TaskImprovementEventData: Codable {
    public let type: String
    public let message: String?
    public let progress: Float?
    public let change: TextChange?
}

public struct VoiceDictationStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: VoiceDictationEventData?
    public let timestamp: Date
}

public struct VoiceDictationEventData: Codable {
    public let type: String
    public let message: String?
    public let progress: Float?
    public let segment: TranscriptionSegment?
}

public struct PlanGenerationStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: PlanGenerationEventData?
    public let timestamp: Date
}

public struct PlanGenerationEventData: Codable {
    public let type: String
    public let message: String?
    public let progress: Float?
}

public struct MergeStreamEvent: Codable {
    public let workflowId: UUID
    public let eventType: String
    public let data: MergeEventData?
    public let timestamp: Date
}

public struct MergeEventData: Codable {
    public let type: String
    public let message: String?
    public let progress: Float?
}

// MARK: - Plan Generation and Merge Types (Simplified)

public struct PlanGenerationParams: Codable {
    public let base: BaseWorkflowParams
    public let projectDescription: String
    public let planningScope: String
    public let technicalRequirements: [String]
    public let businessObjectives: [String]

    public init(
        base: BaseWorkflowParams,
        projectDescription: String,
        planningScope: String = "FullProject",
        technicalRequirements: [String] = [],
        businessObjectives: [String] = []
    ) {
        self.base = base
        self.projectDescription = projectDescription
        self.planningScope = planningScope
        self.technicalRequirements = technicalRequirements
        self.businessObjectives = businessObjectives
    }
}

public struct PlanGenerationWorkflowResult: Codable {
    public let implementationPlan: ImplementationPlan
    public let projectAnalysis: ProjectAnalysis
    public let timelineEstimation: TimelineEstimation
    public let costEstimation: CostEstimation
    public let recommendations: [String]
}

public struct ImplementationPlan: Codable {
    public let planId: UUID
    public let title: String
    public let description: String
    public let phases: [ProjectPhase]
    public let milestones: [Milestone]
    public let assumptions: [String]
    public let constraints: [String]
}

public struct ProjectPhase: Codable {
    public let phaseId: UUID
    public let name: String
    public let description: String
    public let durationWeeks: Float
    public let tasks: [Task]
    public let deliverables: [UUID]
}

public struct Task: Codable {
    public let taskId: UUID
    public let title: String
    public let description: String
    public let effortEstimateHours: Float
    public let priority: String
    public let acceptanceCriteria: [String]
    public let requiredSkills: [String]
}

public struct Milestone: Codable {
    public let milestoneId: UUID
    public let name: String
    public let description: String
    public let targetDate: Date?
    public let deliverables: [UUID]
}

public struct ProjectAnalysis: Codable {
    public let complexityAssessment: String
    public let feasibilityAnalysis: String
    public let technologyAssessment: String
}

public struct TimelineEstimation: Codable {
    public let totalDurationWeeks: Float
    public let criticalPath: [UUID]
    public let bufferTimeWeeks: Float
    public let estimationConfidence: String
}

public struct CostEstimation: Codable {
    public let totalCostUsd: Double
    public let costBreakdown: CostBreakdown
    public let costConfidence: String
}

public struct CostBreakdown: Codable {
    public let personnelCosts: Double
    public let infrastructureCosts: Double
    public let toolAndLicenseCosts: Double
    public let contingencyCosts: Double
}

public struct MergeWorkflowParams: Codable {
    public let base: BaseWorkflowParams
    public let sourcePlans: [SourcePlan]
    public let mergeStrategy: String
    public let conflictResolution: String
    public let validationRequirements: MergeValidationRequirements

    public init(
        base: BaseWorkflowParams,
        sourcePlans: [SourcePlan],
        mergeStrategy: String = "SmartMerge",
        conflictResolution: String = "AutoPriority",
        validationRequirements: MergeValidationRequirements = MergeValidationRequirements()
    ) {
        self.base = base
        self.sourcePlans = sourcePlans
        self.mergeStrategy = mergeStrategy
        self.conflictResolution = conflictResolution
        self.validationRequirements = validationRequirements
    }
}

public struct SourcePlan: Codable {
    public let planId: UUID
    public let planName: String
    public let planVersion: String
    public let planType: String
    public let priority: String
    public let sourceLocation: String
    public let lastModified: Date
    public let createdBy: String

    public init(
        planId: UUID,
        planName: String,
        planVersion: String = "1.0",
        planType: String = "ImplementationPlan",
        priority: String = "Medium",
        sourceLocation: String,
        lastModified: Date = Date(),
        createdBy: String
    ) {
        self.planId = planId
        self.planName = planName
        self.planVersion = planVersion
        self.planType = planType
        self.priority = priority
        self.sourceLocation = sourceLocation
        self.lastModified = lastModified
        self.createdBy = createdBy
    }
}

public struct MergeValidationRequirements: Codable {
    public let validateSyntax: Bool
    public let validateDependencies: Bool
    public let validateResources: Bool
    public let validateTimelines: Bool
    public let validationLevel: String

    public init(
        validateSyntax: Bool = true,
        validateDependencies: Bool = true,
        validateResources: Bool = true,
        validateTimelines: Bool = true,
        validationLevel: String = "Moderate"
    ) {
        self.validateSyntax = validateSyntax
        self.validateDependencies = validateDependencies
        self.validateResources = validateResources
        self.validateTimelines = validateTimelines
        self.validationLevel = validationLevel
    }
}

public struct MergeWorkflowResult: Codable {
    public let mergeSummary: MergeSummary
    public let mergedPlan: MergedPlan
    public let conflictResolutionReport: ConflictResolutionReport
    public let validationReport: ValidationReport
    public let recommendations: [String]
}

public struct MergeSummary: Codable {
    public let mergeId: UUID
    public let sourcePlansCount: UInt32
    public let conflictsDetected: UInt32
    public let conflictsResolved: UInt32
    public let mergeSuccess: Bool
    public let totalProcessingTimeMs: UInt64
}

public struct MergedPlan: Codable {
    public let planId: UUID
    public let planName: String
    public let planVersion: String
    public let mergeStrategyUsed: String
    public let createdAt: Date
}

public struct ConflictResolutionReport: Codable {
    public let conflictsDetected: [DetectedConflict]
    public let resolutionActions: [ResolutionAction]
    public let unresolvedConflicts: [UnresolvedConflict]
}

public struct DetectedConflict: Codable {
    public let conflictId: UUID
    public let conflictType: String
    public let description: String
    public let affectedPlans: [UUID]
    public let severity: String
    public let detectedAt: Date
}

public struct ResolutionAction: Codable {
    public let actionId: UUID
    public let conflictId: UUID
    public let actionType: String
    public let description: String
    public let appliedAt: Date
    public let success: Bool
}

public struct UnresolvedConflict: Codable {
    public let conflictId: UUID
    public let reason: String
    public let recommendedAction: String
    public let requiresManualIntervention: Bool
}

public struct ValidationReport: Codable {
    public let validationStatus: String
    public let validationResults: [ValidationResult]
    public let validationSummary: ValidationSummary
}

public struct ValidationResult: Codable {
    public let validationId: UUID
    public let validatorName: String
    public let validationType: String
    public let status: String
    public let message: String
    public let severity: String
}

public struct ValidationSummary: Codable {
    public let totalValidations: UInt32
    public let passed: UInt32
    public let failed: UInt32
    public let warnings: UInt32
    public let validationScore: Float
}