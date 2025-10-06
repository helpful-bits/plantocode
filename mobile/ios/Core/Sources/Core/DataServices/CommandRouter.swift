import Foundation
import Core

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

    public static func terminalOpen(
        command: String,
        cwd: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.open",
            params: [
                "command": command,
                "cwd": cwd
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalWrite(
        sessionId: String,
        input: String
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
                "input": input
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalClose(
        sessionId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.close",
            params: [
                "sessionId": sessionId
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func terminalExecute(
        command: String,
        cwd: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "terminal.execute",
            params: [
                "command": command,
                "cwd": cwd
            ]
        )

        return relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request)
    }

    public static func plansList(
        taskId: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "plans.list",
            params: [
                "taskId": taskId
            ]
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
        context: String
    ) -> AsyncThrowingStream<RpcResponse, Error> {
        guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
              let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
            return AsyncThrowingStream { continuation in
                continuation.finish(throwing: ServerRelayError.notConnected)
            }
        }

        let request = RpcRequest(
            method: "text.enhance",
            params: [
                "text": text,
                "context": context
            ]
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
}