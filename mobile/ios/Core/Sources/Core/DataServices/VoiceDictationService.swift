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
    private let audioQueue = DispatchQueue(label: "com.plantocode.audio", qos: .userInitiated)
    private var recordingStartTime: Date?

    private init() {}

    public func startRecording() async throws {
        guard !isRecording else {
            throw VoiceDictationError.recordingInProgress
        }

        let audio = AVAudioSession.sharedInstance()
        switch audio.recordPermission {
        case .undetermined:
            let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                audio.requestRecordPermission { cont.resume(returning: $0) }
            }
            guard granted else { throw VoiceDictationError.permissionDenied }
        case .denied:
            throw VoiceDictationError.permissionDenied
        case .granted:
            break
        @unknown default:
            throw VoiceDictationError.permissionDenied
        }

        // Configure audio session for recording
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)

        // Verify AVAudioSession is activated successfully
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        // Create temporary WAV file URL
        let tempDirectory = FileManager.default.temporaryDirectory
        audioFileURL = tempDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("wav")

        guard let audioFileURL = audioFileURL else {
            throw VoiceDictationError.fileCreationFailed
        }

        // Get input node first to check its format
        let inputNode = engine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        // Use the input format's sample rate for better compatibility
        // Most iOS devices use 48kHz or 44.1kHz
        let targetSampleRate = recordingFormat.sampleRate > 0 ? recordingFormat.sampleRate : 48000.0

        // Set up audio format to match device capabilities
        let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: false
        )

        guard let format = audioFormat else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        // Create audio file for writing
        do {
            audioFile = try AVAudioFile(
                forWriting: audioFileURL,
                settings: format.settings,
                commonFormat: .pcmFormatInt16,
                interleaved: false
            )
        } catch {
            throw VoiceDictationError.fileCreationFailed
        }

        // Verify engine.inputNode.outputFormat(forBus: 0) has channelCount > 0 and valid sampleRate
        guard recordingFormat.channelCount > 0 else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        guard recordingFormat.sampleRate > 0 else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            guard let self = self else { return }
            guard buffer.frameLength > 0 else { return }
            guard let bufferCopy = self.makePCMBufferCopy(buffer) else {
                return
            }
            self.audioQueue.async {
                guard let audioFile = self.audioFile else { return }

                do {
                    // Convert to target format if needed
                    if recordingFormat != format {
                        guard let converter = AVAudioConverter(from: recordingFormat, to: format) else {
                            return
                        }

                        // Calculate output frame capacity based on sample rate ratio
                        let ratio = format.sampleRate / recordingFormat.sampleRate
                        let outputFrameCapacity = AVAudioFrameCount(Double(bufferCopy.frameLength) * ratio) + 1024

                        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: outputFrameCapacity) else {
                            return
                        }

                        var error: NSError?
                        var inputBufferUsed = false
                        let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
                            if inputBufferUsed {
                                outStatus.pointee = .noDataNow
                                return nil
                            } else {
                                outStatus.pointee = .haveData
                                inputBufferUsed = true
                                return bufferCopy
                            }
                        }

                        let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)

                        // Check conversion status
                        if status == .error {
                            return
                        }

                        // Ensure we have converted data to write
                        guard convertedBuffer.frameLength > 0 else {
                            return
                        }

                        do {
                            try audioFile.write(from: convertedBuffer)
                        } catch {
                            // Continue without crashing
                        }
                    } else {
                        // No conversion needed, write directly
                        do {
                            try audioFile.write(from: bufferCopy)
                        } catch {
                            // Continue without crashing
                        }
                    }
                } catch {
                }
            }
        }

        // Start the engine
        try engine.start()
        isRecording = true
        recordingStartTime = Date()
    }

    public func stopRecording() {
        guard isRecording else { return }

        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        isRecording = false

        // Wait for any pending audio writes to complete
        audioQueue.sync {
            // Close the audio file properly
            audioFile = nil
        }

        // Deactivate audio session
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
        }
    }

    public func transcribe(
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    guard let audioFileURL = audioFileURL else {
                        continuation.finish(throwing: VoiceDictationError.noRecordingFound)
                        return
                    }

                    // Read WAV data from file
                    let audioData = try Data(contentsOf: audioFileURL)

                    // Calculate duration
                    let durationMs: Int64
                    if let startTime = recordingStartTime {
                        let duration = Date().timeIntervalSince(startTime)
                        durationMs = Int64(duration * 1000)
                    } else {
                        durationMs = 1000 // Fallback: 1 second
                    }

                    // Call server feature service for transcription
                    let response = try await serverFeatureService.transcribeAudio(
                        audioData,
                        durationMs: durationMs,
                        model: model,
                        language: language,
                        prompt: prompt,
                        temperature: temperature
                    )

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

private extension VoiceDictationService {
    /// Copies PCM data into a new buffer so work outside the tap never touches recycled memory.
    func makePCMBufferCopy(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        let capacity = max(buffer.frameCapacity, buffer.frameLength)
        guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: capacity) else {
            return nil
        }

        copy.frameLength = buffer.frameLength

        let sourceBuffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
        let destinationBuffers = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)

        guard sourceBuffers.count == destinationBuffers.count else {
            return nil
        }

        for index in 0..<sourceBuffers.count {
            let source = sourceBuffers[index]

            guard
                let sourceData = source.mData,
                let destinationData = destinationBuffers[index].mData
            else {
                return nil
            }

            let byteSize = Int(source.mDataByteSize)
            destinationBuffers[index].mDataByteSize = source.mDataByteSize
            memcpy(destinationData, sourceData, byteSize)
        }

        return copy
    }
}

public enum VoiceDictationError: Error, LocalizedError {
    case audioFormatNotSupported
    case fileCreationFailed
    case noRecordingFound
    case recordingInProgress
    case permissionDenied

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
        case .permissionDenied:
            return "Microphone permission denied."
        }
    }
}
