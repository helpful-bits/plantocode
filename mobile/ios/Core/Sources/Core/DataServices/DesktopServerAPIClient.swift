import Foundation
import Combine

/// Bridge that allows async/await interaction with the DesktopAPIClient command channel.
public final class DesktopServerAPIClient {
    private let desktopAPIClient: DesktopAPIClient

    public init(desktopAPIClient: DesktopAPIClient) {
        self.desktopAPIClient = desktopAPIClient
    }

    /// Execute a command against the connected desktop bridge and decode the response.
    /// - Parameters:
    ///   - command: Command identifier understood by the desktop.
    ///   - payload: Encodable payload to send.
    /// - Returns: Decoded response from the desktop bridge.
    public func executeCommand<Response: Decodable, Payload: Encodable>(
        command: String,
        payload: Payload,
        timeout: TimeInterval = 30.0
    ) async throws -> Response {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Response, Error>) in
            var cancellable: AnyCancellable?
            var didResume = false

            func resume(with result: Result<Response, Error>) {
                guard !didResume else { return }
                didResume = true
                cancellable?.cancel()
                cancellable = nil
                switch result {
                case .success(let value):
                    continuation.resume(returning: value)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }

            cancellable = desktopAPIClient
                .invoke(command: command, payload: payload, timeout: timeout)
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .failure(let error):
                            resume(with: .failure(error))
                        case .finished:
                            if !didResume {
                                resume(with: .failure(DesktopAPIError.invalidResponse))
                            }
                        }
                    },
                    receiveValue: { (value: Response) in
                        resume(with: .success(value))
                    }
                )
        }
    }
}
