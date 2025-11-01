import Foundation
import Combine

@MainActor
public final class AppContainer: ObservableObject {
    private let manager: DataServicesManager

    public var plansService: PlansDataService {
        manager.plansService
    }

    public var filesService: FilesDataService {
        manager.filesService
    }

    public var sessionService: SessionDataService {
        manager.sessionService
    }

    public var terminalService: TerminalDataService {
        manager.terminalService
    }

    public var jobsService: JobsDataService {
        manager.jobsService
    }

    public var taskSyncService: TaskSyncDataService {
        manager.taskSyncService
    }

    public var sqliteService: SQLiteDataService {
        manager.sqliteService
    }

    public var serverFeatureService: ServerFeatureService {
        manager.serverFeatureService
    }

    public var speechTextServices: SpeechTextServices {
        manager.speechTextServices
    }

    public var settingsService: SettingsDataService {
        manager.settingsService
    }

    public var subscriptionManager: SubscriptionManager {
        manager.subscriptionManager
    }

    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var currentProject: ProjectInfo?
    @Published public var isInitializing: Bool = false
    @Published public var hasCompletedInitialLoad: Bool = false

    public init(baseURL: URL, deviceId: String) {
        // Use the core-managed singleton if available, otherwise create a new one
        if let coreManager = PlanToCodeCore.shared.dataServices {
            self.manager = coreManager
        } else {
            // Fallback: create new manager if core not initialized yet
            self.manager = DataServicesManager(baseURL: baseURL, deviceId: deviceId)
        }

        manager.$connectionStatus
            .receive(on: DispatchQueue.main)
            .assign(to: &$connectionStatus)

        manager.$currentProject
            .receive(on: DispatchQueue.main)
            .assign(to: &$currentProject)

        manager.$isInitializing
            .receive(on: DispatchQueue.main)
            .assign(to: &$isInitializing)

        manager.$hasCompletedInitialLoad
            .receive(on: DispatchQueue.main)
            .assign(to: &$hasCompletedInitialLoad)
    }

    public func setCurrentProject(_ project: ProjectInfo) {
        manager.setCurrentProject(project)
    }

    public func refreshCurrentProject() {
        manager.refreshCurrentProject()
    }

    public func testConnection() -> AnyPublisher<Bool, Never> {
        manager.testConnection()
    }

    public func setJobsViewActive(_ active: Bool) {
        manager.setJobsViewActive(active)
    }

    public func getAllSyncStatuses() -> AnyPublisher<ServicesSyncStatus, DataServiceError> {
        manager.getAllSyncStatuses()
    }

    public func invalidateAllCaches() {
        manager.invalidateAllCaches()
    }

    public func exportProjectData(_ project: ProjectInfo, format: ExportFormat = .json) -> AnyPublisher<URL, DataServiceError> {
        manager.exportProjectData(project, format: format)
    }
}
