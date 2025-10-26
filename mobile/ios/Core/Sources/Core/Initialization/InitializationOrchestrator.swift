import Foundation
import OSLog

@MainActor
public final class InitializationOrchestrator: ObservableObject {
    public static let shared = InitializationOrchestrator()
    private let log = Logger(subsystem: "PlanToCode", category: "Initialization")

    // MARK: - Performance Targets (OPEN Items for Product Confirmation)
    //
    // These targets guide engineering verification without code enforcement:
    //
    // OPEN-1: Plans tab should appear without perceptible delay (≤200ms TTI from tab activation)
    // OPEN-2: Jobs tab should appear without perceptible delay (≤200ms)
    // OPEN-3: Job detail should be immediate (≤150ms with memory-first or prefetched data)
    // OPEN-4: Background strategy: live bootstrap + minimal memory prefetch (top 3 plans, top 10 jobs) + neighbor prefetch window 1
    // OPEN-5: Reasonable volumes: up to 500 jobs in list, up to 50 plans in list, typical plan content ≤500KB
    //
    // Strategy: Live-first bootstrap with conservative memory-only prefetching.
    // No disk caching to honor "less aggressive caching" directive.

    private let repo = BootstrapRepository()
    private let appState = AppState.shared
    private let multi = MultiConnectionManager.shared

    private init() {}

    public func run() async {
        appState.setBootstrapRunning()

        // Force reset to ensure clean state
        PlanToCodeCore.shared.dataServices?.hasCompletedInitialLoad = false
        log.info("Forced bootstrap reset for device switch")

        log.info("Bootstrap started")

        guard AuthService.shared.isAuthenticated else {
            appState.setBootstrapFailed("Unauthenticated")
            log.error("Bootstrap failed: unauthenticated")
            return
        }

        await multi.restoreConnections()
        log.info("Connection restore completed")

        // Start project sync service
        ProjectSyncService.shared.start()

        // Quick check: if no device is configured at all, don't wait for connection
        if multi.activeDeviceId == nil {
            appState.setBootstrapNeedsConfig(.init(projectMissing: true, sessionsEmpty: true, activeSessionMissing: true))
            log.info("No active device configured - showing configuration screen immediately")
            return
        }

        // Device is configured, wait briefly for connection (reduced from 20s to 5s)
        let connected = await awaitActiveDeviceConnected(timeoutSeconds: 8)
        guard connected else {
            appState.setBootstrapNeedsConfig(.init(projectMissing: true, sessionsEmpty: true, activeSessionMissing: true))
            log.warning("No active device connection established within timeout, routing to configuration")
            return
        }

        do {
            log.info("InitializationOrchestrator: fetching project directory via RPC")
            let projectDir: String?
            do {
                projectDir = try await repo.fetchProjectDirectory()
                log.info("InitializationOrchestrator: project directory fetched successfully")
            } catch {
                log.error("InitializationOrchestrator: fetchProjectDirectory failed - \(String(describing: error))")
                throw error
            }
            guard let pd = projectDir else {
                appState.setBootstrapNeedsConfig(.init(projectMissing: true, sessionsEmpty: true, activeSessionMissing: true))
                log.info("Missing project directory in desktop DB")
                return
            }

            log.info("InitializationOrchestrator: fetching sessions via RPC")
            let sessions: [Session]
            do {
                sessions = try await repo.fetchSessions(projectDirectory: pd)
                log.info("InitializationOrchestrator: sessions fetched successfully, count=\(sessions.count)")
            } catch {
                log.error("InitializationOrchestrator: fetchSessions failed - \(String(describing: error))")
                throw error
            }
            log.info("InitializationOrchestrator: fetching active session ID via RPC")
            let activeId: String?
            do {
                activeId = try await repo.fetchActiveSessionId()
                log.info("InitializationOrchestrator: active session ID fetched, present=\(activeId != nil)")
            } catch {
                log.error("InitializationOrchestrator: fetchActiveSessionId failed - \(String(describing: error))")
                throw error
            }

            if sessions.isEmpty {
                appState.setBootstrapNeedsConfig(.init(projectMissing: false, sessionsEmpty: true, activeSessionMissing: true))
                log.info("Project present but sessions empty")
                return
            }

            // Auto-select first session if no active session is set
            let finalActiveId = activeId ?? sessions.first?.id
            if activeId == nil, let firstId = sessions.first?.id {
                log.info("No active session set, auto-selecting first session: \(firstId)")
            }

            let project = ProjectInfo(name: (pd as NSString).lastPathComponent, directory: pd, hash: String(pd.hashValue))

            // Set project directory in AppState for UI routing
            appState.setSelectedProjectDirectory(pd)

            if let manager = PlanToCodeCore.shared.dataServices {
                manager.setCurrentProject(project)
                await manager.sessionService.setSessions(sessions, activeId: finalActiveId)
                manager.hasCompletedInitialLoad = true
            }

            // Trigger live bootstrap to prefetch data
            if let manager = PlanToCodeCore.shared.dataServices {
                Task {
                    await manager.performLiveBootstrap()
                }
            }

            appState.setBootstrapReady()
            log.info("Bootstrap ready (project and sessions applied, activeSessionId=\(finalActiveId ?? "none"))")
        } catch {
            appState.setBootstrapFailed(String(describing: error))
            log.error("Bootstrap failed: \(String(describing: error))")
        }
    }

    private func awaitActiveDeviceConnected(timeoutSeconds: Int) async -> Bool {
        log.info("Waiting for active device connection (timeout: \(timeoutSeconds)s)")
        let start = Date()
        while Date().timeIntervalSince(start) < Double(timeoutSeconds) {
            // Check if we have a connected device
            let hasConnected = multi.connectionStates.values.contains { state in
                if case .connected = state { return true }
                return false
            }

            // If a device is connected but no active device is set, try auto-assigning
            if hasConnected && multi.activeDeviceId == nil {
                let connected = multi.connectionStates.filter { _, state in
                    if case .connected = state { return true }
                    return false
                }.map { $0.key }

                if connected.count == 1, let deviceId = connected.first {
                    log.info("Auto-assigning single connected device: \(deviceId.uuidString)")
                    multi.setActive(deviceId)
                }
            }

            // Check if both conditions are met: connected state AND active device set
            if let active = multi.activeDeviceId,
               let state = multi.connectionStates[active],
               case .connected = state {
                log.info("Active device connection established: \(active.uuidString)")
                return true
            }

            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        log.warning("Connection timeout after \(timeoutSeconds)s - proceeding to configuration")
        return false
    }
}
