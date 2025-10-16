import Foundation
import Core
import OSLog

@MainActor
public struct CommandRouter {

    public static func workflowsStartFileFinder(
        sessionId: String,
        taskDescription: String,
        projectDirectory: String,
        excludedPaths: [String],
        timeoutMs: Int
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "workflows.startFileFinder",
            params: [
                "sessionId": sessionId,
                "taskDescription": taskDescription,
                "projectDirectory": projectDirectory,
                "excludedPaths": excludedPaths,
                "timeoutMs": timeoutMs
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func workflowsStartWebSearch(
        sessionId: String,
        query: String,
        maxResults: Int,
        timeoutMs: Int
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "workflows.startWebSearch",
            params: [
                "sessionId": sessionId,
                "query": query,
                "maxResults": maxResults,
                "timeoutMs": timeoutMs
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func filesSearch(
        projectDirectory: String,
        query: String,
        includeContent: Bool,
        maxResults: Int
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "files.search",
            params: [
                "projectDirectory": projectDirectory,
                "query": query,
                "includeContent": includeContent,
                "maxResults": maxResults
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

// MARK: - Terminal Control

    public static func terminalStart(
        jobId: String? = nil,
        shell: String? = nil
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [:]
        if let jobId = jobId {
            params["jobId"] = jobId
        }
        if let shell = shell {
            params["shell"] = shell
        }

        let request = RpcRequest(
            method: "terminal.start",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalGetLog(
        sessionId: String,
        maxLines: Int? = nil
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = ["sessionId": sessionId]
        if let maxLines = maxLines {
            params["maxLines"] = maxLines
        }

        let request = RpcRequest(
            method: "terminal.getLog",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalDetach(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.detach",
            params: ["sessionId": sessionId]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalWriteData(
        sessionId: String,
        base64Data: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.write",
            params: [
                "sessionId": sessionId,
                "data": base64Data
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalKill(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.kill",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalResize(
        sessionId: String,
        cols: Int,
        rows: Int
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.resize",
            params: [
                "sessionId": sessionId,
                "cols": cols,
                "rows": rows
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalWrite(
        sessionId: String,
        text: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let base64 = text.data(using: .utf8)?.base64EncodedString() ?? ""
        let request = RpcRequest(
            method: "terminal.write",
            params: [
                "sessionId": sessionId,
                "data": base64
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalGetStatus(sessionId: String) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.getStatus",
            params: ["sessionId": sessionId]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalGetMetadata(sessionId: String) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.getMetadata",
            params: ["sessionId": sessionId]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalGetActiveSessions() -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.getActiveSessions",
            params: [:]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansList(
        sessionId: String? = nil,
        projectDirectory: String? = nil
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        guard let sessionId = sessionId, !sessionId.isEmpty else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.invalidState("sessionId is required"))
            }
        }

        var params: [String: Any] = [:]
        if let projectDirectory = projectDirectory {
            params["projectDirectory"] = projectDirectory
        }
        params["sessionId"] = sessionId

        let request = RpcRequest(
            method: "plans.list",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansGet(
        id: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.get",
            params: [
                "id": id
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansSave(
        id: String,
        content: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.save",
            params: [
                "id": id,
                "content": content
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansCreate(
        taskId: String,
        options: [String: Any]
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.create",
            params: [
                "taskId": taskId,
                "options": options
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansActivate(
        id: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.activate",
            params: [
                "id": id
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansDelete(
        id: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.delete",
            params: [
                "id": id
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func speechTranscribe(
        audioData: Data,
        format: String,
        sampleRate: Int
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "speech.transcribe",
            params: [
                "audioData": audioData.base64EncodedString(),
                "format": format,
                "sampleRate": sampleRate
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func textEnhance(
        text: String,
        sessionId: String,
        projectDirectory: String?
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "text": text,
            "sessionId": sessionId
        ]

        if let projectDirectory = projectDirectory {
            params["projectDirectory"] = projectDirectory
        }

        let request = RpcRequest(
            method: "text.enhance",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionCreate(
        name: String,
        projectDirectory: String,
        taskDescription: String?
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "name": name,
            "projectDirectory": projectDirectory,
            "includedFiles": [],
            "forceExcludedFiles": []
        ]

        if let taskDescription = taskDescription {
            params["taskDescription"] = taskDescription
        }

        let request = RpcRequest(
            method: "session.create",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionList(
        projectDirectory: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.list",
            params: [
                "projectDirectory": projectDirectory
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionGet(
        id: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.get",
            params: [
                "sessionId": id
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionUpdate(
        id: String,
        updates: [String: Any]
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.update",
            params: [
                "sessionId": id,
                "updateData": updates
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionUpdateTaskDescription(
        sessionId: String,
        taskDescription: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.updateTaskDescription",
            params: [
                "sessionId": sessionId,
                "taskDescription": taskDescription
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionUpdateMergeInstructions(
        sessionId: String,
        mergeInstructions: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.updateMergeInstructions",
            params: [
                "sessionId": sessionId,
                "mergeInstructions": mergeInstructions
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionDelete(
        id: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.delete",
            params: [
                "sessionId": id
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionDuplicate(
        sourceSessionId: String,
        newName: String?
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "sourceSessionId": sourceSessionId
        ]

        if let newName = newName {
            params["newName"] = newName
        }

        let request = RpcRequest(
            method: "session.duplicate",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionGetTaskDescriptionHistory(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.getTaskDescriptionHistory",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionSyncTaskDescriptionHistory(
        sessionId: String,
        history: [String]
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.syncTaskDescriptionHistory",
            params: [
                "sessionId": sessionId,
                "history": history
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionUpdateFiles(
        id: String,
        addIncluded: [String]?,
        removeIncluded: [String]?,
        addExcluded: [String]?,
        removeExcluded: [String]?
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "sessionId": id
        ]

        if let addIncluded = addIncluded {
            params["filesToAdd"] = addIncluded
        }

        if let removeIncluded = removeIncluded {
            params["filesToRemove"] = removeIncluded
        }

        if let addExcluded = addExcluded {
            params["excludedToAdd"] = addExcluded
        }

        if let removeExcluded = removeExcluded {
            params["excludedToRemove"] = removeExcluded
        }

        let request = RpcRequest(
            method: "session.updateFiles",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionGetFileRelationships(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.getFileRelationships",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionGetOverview(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.getOverview",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionGetContents(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "session.getContents",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func filesGetMetadata(
        projectDirectory: String?,
        filePaths: [String]
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "filePaths": filePaths
        ]

        if let projectDirectory = projectDirectory {
            params["projectDirectory"] = projectDirectory
        }

        let request = RpcRequest(
            method: "files.getMetadata",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func jobGet(
        jobId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "job.get",
            params: [
                "jobId": jobId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func jobList(
        projectDirectory: String? = nil,
        sessionId: String? = nil,
        statusFilter: [String]? = nil,
        taskTypeFilter: String? = nil,
        page: Int? = nil,
        pageSize: Int? = nil,
        filter: String? = nil
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        guard let sessionId = sessionId, !sessionId.isEmpty else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: DataServiceError.invalidState("sessionId is required"))
            }
        }

        var params: [String: Any] = [:]

        if let projectDirectory = projectDirectory {
            params["projectDirectory"] = projectDirectory
        }
        params["sessionId"] = sessionId
        if let statusFilter = statusFilter {
            params["statusFilter"] = statusFilter
        }
        if let taskTypeFilter = taskTypeFilter {
            params["taskTypeFilter"] = taskTypeFilter
        }
        if let page = page {
            params["page"] = page
        }
        if let pageSize = pageSize {
            params["pageSize"] = pageSize
        }
        if let filter = filter {
            params["filter"] = filter
        }

        let request = RpcRequest(
            method: "job.list",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    // MARK: - Settings

    public static func settingsGetProvidersWithModels() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.getProvidersWithModels", [:])
    }

    public static func settingsGetDefaultTaskModelSettings() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.getDefaultTaskModelSettings", [:])
    }

    public static func settingsGetProjectTaskModelSettings(projectDirectory: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.getProjectTaskModelSettings", ["projectDirectory": projectDirectory])
    }

    public static func settingsSetProjectTaskSetting(projectDirectory: String, taskKey: String, settingKey: String, value: Any) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.setProjectTaskSetting", [
            "projectDirectory": projectDirectory,
            "taskKey": taskKey,
            "settingKey": settingKey,
            "value": value
        ])
    }

    public static func settingsResetProjectTaskSetting(projectDirectory: String, taskKey: String, settingKey: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.resetProjectTaskSetting", [
            "projectDirectory": projectDirectory,
            "taskKey": taskKey,
            "settingKey": settingKey
        ])
    }

    public static func settingsGetAppSetting(key: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.getAppSetting", ["key": key])
    }

    public static func settingsSetAppSetting(key: String, value: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("settings.setAppSetting", ["key": key, "value": value])
    }

    // MARK: - System Prompts

    public static func systemPromptsGetProject(projectDirectory: String, taskType: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("systemPrompts.getProject", ["projectDirectory": projectDirectory, "taskType": taskType])
    }

    public static func systemPromptsSetProject(projectDirectory: String, taskType: String, systemPrompt: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("systemPrompts.setProject", ["projectDirectory": projectDirectory, "taskType": taskType, "systemPrompt": systemPrompt])
    }

    public static func systemPromptsResetProject(projectDirectory: String, taskType: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("systemPrompts.resetProject", ["projectDirectory": projectDirectory, "taskType": taskType])
    }

    public static func systemPromptsGetDefault(taskType: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("systemPrompts.getDefault", ["taskType": taskType])
    }

    public static func systemPromptsIsProjectCustomized(projectDirectory: String, taskType: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("systemPrompts.isProjectCustomized", ["projectDirectory": projectDirectory, "taskType": taskType])
    }

    // MARK: - Terminal

    public static func terminalGetAvailableShells() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("terminal.getAvailableShells", [:])
    }

    public static func terminalGetDefaultShell() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("terminal.getDefaultShell", [:])
    }

    public static func terminalSetDefaultShell(_ defaultShell: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("terminal.setDefaultShell", ["defaultShell": defaultShell])
    }

    // MARK: - Config

    public static func configRefreshRuntimeAIConfig() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("config.refreshRuntimeAIConfig", [:])
    }

    // MARK: - App

    public static func appSetProjectDirectory(_ projectDirectory: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("app.setProjectDirectory", ["projectDirectory": projectDirectory])
    }

    public static func appGetProjectDirectory() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("app.getProjectDirectory", [:])
    }

    public static func appGetActiveSessionId() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("app.getActiveSessionId", [:])
    }

    public static func appGetUserHomeDirectory() -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("app.getUserHomeDirectory", [:])
    }

    public static func appListFolders(_ path: String) -> AsyncThrowingStream<RpcResponse, Error> {
        invoke("app.listFolders", ["path": path])
    }

    // MARK: - Helper

    private static func invoke(_ method: String, _ params: [String: Any]) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(method: method, params: params)
        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func sessionUpdateFileBrowserState(
        sessionId: String,
        projectDirectory: String,
        searchTerm: String?,
        sortBy: String?,
        sortOrder: String?,
        filterMode: String?
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        var params: [String: Any] = [
            "sessionId": sessionId,
            "projectDirectory": projectDirectory
        ]

        if let searchTerm = searchTerm {
            params["searchTerm"] = searchTerm
        }
        if let sortBy = sortBy {
            params["sortBy"] = sortBy
        }
        if let sortOrder = sortOrder {
            params["sortOrder"] = sortOrder
        }
        if let filterMode = filterMode {
            params["filterMode"] = filterMode
        }

        let request = RpcRequest(
            method: "session.updateFileBrowserState",
            params: params
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }
}