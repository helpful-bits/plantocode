import Foundation
import Combine
import AVFoundation

@MainActor
public final class VoiceDictationService: ObservableObject {
    public static let shared = VoiceDictationService()

    @Published public private(set) var isRecording = false
    @Published public private(set) var isTranscribing = false
    @Published public private(set) var audioLevels: [Float] = [0, 0, 0, 0, 0] // 5 bars for waveform

    private let engine = AVAudioEngine()
    private var audioFileURL: URL?
    private var audioFile: AVAudioFile?
    private let serverFeatureService = ServerFeatureService()
    private let audioQueue = DispatchQueue(label: "com.plantocode.audio", qos: .userInitiated)
    private var recordingStartTime: Date?
    private var levelUpdateTimer: Timer?

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

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .spokenAudio, options: [.allowBluetooth, .duckOthers, .defaultToSpeaker])

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

            // Calculate audio levels for visualization
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                self.updateAudioLevels(from: buffer)
            }

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
        audioLevels = [0, 0, 0, 0, 0] // Reset levels

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

    private func updateAudioLevels(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let channelDataCount = Int(buffer.frameLength)

        // Calculate RMS (Root Mean Square) for overall amplitude
        var sum: Float = 0
        for i in 0..<channelDataCount {
            let sample = channelData[i]
            sum += sample * sample
        }
        let rms = sqrt(sum / Float(channelDataCount))

        // Normalize to 0-1 range with boost for better visualization
        let normalizedLevel = min(rms * 20, 1.0)

        // Create animated levels with slight variations for each bar
        // This creates a more dynamic waveform effect
        let barCount = 5
        var newLevels: [Float] = []
        for i in 0..<barCount {
            // Add slight variation based on bar position for more natural look
            let variation = Float.random(in: 0.8...1.2)
            let level = normalizedLevel * variation
            newLevels.append(min(level, 1.0))
        }

        audioLevels = newLevels
    }

    public func transcribe(
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            Task {
                await MainActor.run {
                    isTranscribing = true
                }

                do {
                    guard let audioFileURL = audioFileURL else {
                        await MainActor.run {
                            isTranscribing = false
                        }
                        continuation.finish(throwing: VoiceDictationError.noRecordingFound)
                        return
                    }

                    let audioData = try Data(contentsOf: audioFileURL)

                    let durationMs: Int64
                    if let startTime = recordingStartTime {
                        let duration = Date().timeIntervalSince(startTime)
                        durationMs = Int64(duration * 1000)
                    } else {
                        durationMs = 1000
                    }

                    let response = try await serverFeatureService.transcribeAudio(
                        audioData,
                        durationMs: durationMs,
                        model: model,
                        language: language,
                        prompt: prompt,
                        temperature: temperature
                    )

                    continuation.yield(response.text)
                    continuation.finish()

                    try? FileManager.default.removeItem(at: audioFileURL)
                    self.audioFileURL = nil

                    await MainActor.run {
                        isTranscribing = false
                    }

                } catch {
                    await MainActor.run {
                        isTranscribing = false
                    }
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
