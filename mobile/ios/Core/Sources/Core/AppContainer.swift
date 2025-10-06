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

    @Published public var connectionStatus: ConnectionStatus = .disconnected
    @Published public var currentProject: ProjectInfo?

    public init(baseURL: URL, deviceId: String) {
        self.manager = DataServicesManager(baseURL: baseURL, deviceId: deviceId)

        manager.$connectionStatus
            .assign(to: &$connectionStatus)

        manager.$currentProject
            .assign(to: &$currentProject)
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

    public func connectDesktop(jwtToken: String) -> AnyPublisher<Void, DesktopAPIError> {
        manager.connectDesktop(jwtToken: jwtToken)
    }

    public func disconnectDesktop() {
        manager.disconnectDesktop()
    }

    public func connectTaskStream() {
        manager.connectTaskStream()
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
