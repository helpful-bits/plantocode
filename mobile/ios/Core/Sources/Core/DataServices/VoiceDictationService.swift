import Foundation
import Combine
import AVFoundation

@MainActor
public final class VoiceDictationService: ObservableObject {
    public static let shared = VoiceDictationService()

    @Published public private(set) var isRecording = false

    private let engine = AVAudioEngine()
    private var audioFileURL: URL?
    private var audioFile: AVAudioFile?
    private let serverFeatureService = ServerFeatureService()
    private let audioQueue = DispatchQueue(label: "com.vibemanager.audio", qos: .userInitiated)

    private init() {}

    public func startRecording() async throws {
        guard !isRecording else { return }

        // Configure audio session for recording
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        // Create temporary WAV file URL
        let tempDirectory = FileManager.default.temporaryDirectory
        audioFileURL = tempDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("wav")

        guard let audioFileURL = audioFileURL else {
            throw VoiceDictationError.fileCreationFailed
        }

        // Set up audio format (16kHz mono PCM)
        let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        )

        guard let format = audioFormat else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        // Create audio file for writing
        do {
            audioFile = try AVAudioFile(forWriting: audioFileURL, settings: format.settings)
        } catch {
            throw VoiceDictationError.fileCreationFailed
        }

        // Get input node and install tap
        let inputNode = engine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            guard let self = self else { return }

            self.audioQueue.async {
                guard let audioFile = self.audioFile else { return }

                do {
                    // Convert to target format if needed
                    if recordingFormat != format {
                        guard let converter = AVAudioConverter(from: recordingFormat, to: format) else {
                            print("Failed to create audio converter")
                            return
                        }

                        // Calculate output frame capacity based on sample rate ratio with minimum capacity
                        let ratio = format.sampleRate / recordingFormat.sampleRate
                        let calculatedCapacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * ratio))
                        let outputFrameCapacity = max(calculatedCapacity + 64, 512)

                        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: outputFrameCapacity) else {
                            print("Failed to create converted buffer")
                            return
                        }

                        var error: NSError?
                        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                            outStatus.pointee = .haveData
                            return buffer
                        }

                        let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)

                        if status == .error {
                            print("Conversion error: \(error?.localizedDescription ?? "unknown")")
                            return
                        }

                        // Ensure we have data to write
                        guard convertedBuffer.frameLength > 0 else {
                            return
                        }

                        try audioFile.write(from: convertedBuffer)
                    } else {
                        guard buffer.frameLength > 0 else { return }
                        try audioFile.write(from: buffer)
                    }
                } catch {
                    print("Error writing audio buffer: \(error)")
                }
            }
        }

        // Start the engine
        try engine.start()
        isRecording = true
    }

    public func stopRecording() {
        guard isRecording else { return }

        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        isRecording = false

        // Wait for any pending audio writes to complete
        audioQueue.sync {
            audioFile = nil
        }

        // Deactivate audio session
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("Error deactivating audio session: \(error)")
        }
    }

    public func transcribe() -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    guard let audioFileURL = audioFileURL else {
                        continuation.finish(throwing: VoiceDictationError.noRecordingFound)
                        return
                    }

                    // Read WAV data from file
                    let audioData = try Data(contentsOf: audioFileURL)

                    // Call server feature service for transcription
                    let response = try await serverFeatureService.transcribeAudio(audioData, mimeType: "audio/wav")

                    // Yield the transcribed text
                    continuation.yield(response.text)
                    continuation.finish()

                    // Clean up temporary file
                    try? FileManager.default.removeItem(at: audioFileURL)
                    self.audioFileURL = nil

                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}

// MARK: - Error Types

public enum VoiceDictationError: Error, LocalizedError {
    case audioFormatNotSupported
    case fileCreationFailed
    case noRecordingFound
    case recordingInProgress

    public var errorDescription: String? {
        switch self {
        case .audioFormatNotSupported:
            return "Audio format not supported"
        case .fileCreationFailed:
            return "Failed to create audio file"
        case .noRecordingFound:
            return "No recording found to transcribe"
        case .recordingInProgress:
            return "Recording is already in progress"
        }
    }
}