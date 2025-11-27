import Foundation
import Combine
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
public final class VoiceDictationService: ObservableObject {
    public static let shared = VoiceDictationService()

    @Published public private(set) var isRecording = false
    @Published public private(set) var isTranscribing = false
    @Published public private(set) var audioLevels: [Float] = [0, 0, 0, 0, 0]
    @Published public private(set) var lastTranscriptionJob: TranscriptionJob?
    @Published public private(set) var lastTranscriptionError: Error?

    private let engine = AVAudioEngine()
    private var audioFileURL: URL?
    private var audioFile: AVAudioFile?
    private let serverFeatureService = ServerFeatureService()
    private let audioQueue = DispatchQueue(label: "com.plantocode.audio", qos: .userInitiated)
    private var recordingStartTime: Date?
    private var levelUpdateTimer: Timer?
    private var hasCompletedRecording: Bool = false
    private var lastRecordingDurationMs: Int64?
    private var transcriptionTask: Task<Void, Never>?
    #if canImport(UIKit)
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    #endif

    public var hasRecordableAudio: Bool {
        audioFileURL != nil && hasCompletedRecording
    }

    public var canRetryLastTranscription: Bool {
        lastTranscriptionJob != nil && hasRecordableAudio && !isRecording && !isTranscribing
    }

    private init() {
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                if self?.isRecording == true {
                    self?.stopRecording()
                }
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                // Stop recording if active - user can't record in background
                if self?.isRecording == true {
                    self?.stopRecording()
                }
                // NOTE: We intentionally do NOT cancel transcription here.
                // Transcription should complete in background using background task.
            }
        }
        #endif
    }

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

        hasCompletedRecording = false
        lastRecordingDurationMs = nil

        let recordingsDir = FileManager.default.temporaryDirectory.appendingPathComponent("VoiceRecordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)

        audioFileURL = recordingsDir.appendingPathComponent(UUID().uuidString).appendingPathExtension("wav")

        guard let audioFileURL = audioFileURL else {
            throw VoiceDictationError.fileCreationFailed
        }

        if engine.isRunning {
            engine.stop()
        }

        let inputNode = engine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        guard recordingFormat.channelCount > 0 else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        guard recordingFormat.sampleRate > 0 else {
            throw VoiceDictationError.audioFormatNotSupported
        }

        let targetSampleRate = recordingFormat.sampleRate > 0 ? recordingFormat.sampleRate : 48000.0

        let audioFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: targetSampleRate,
            channels: 1,
            interleaved: false
        )

        guard let format = audioFormat else {
            throw VoiceDictationError.audioFormatNotSupported
        }

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
        audioLevels = [0, 0, 0, 0, 0]

        if let startTime = recordingStartTime {
            lastRecordingDurationMs = Int64(Date().timeIntervalSince(startTime) * 1000)
        }

        hasCompletedRecording = true

        audioQueue.sync {
            audioFile = nil
        }

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

    public func cleanupOrphanedRecordings(olderThan: TimeInterval = 24 * 3600) {
        let recordingsDir = FileManager.default.temporaryDirectory.appendingPathComponent("VoiceRecordings", isDirectory: true)
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: recordingsDir,
            includingPropertiesForKeys: [.creationDateKey],
            options: .skipsHiddenFiles
        ) else { return }

        let cutoffDate = Date().addingTimeInterval(-olderThan)
        for fileURL in files {
            guard let attributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
                  let creationDate = attributes[.creationDate] as? Date,
                  creationDate < cutoffDate else { continue }
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    private func performTranscription(
        job: TranscriptionJob,
        timeoutSeconds: TimeInterval = 60
    ) async throws -> String {
        let audioData = try Data(contentsOf: job.audioFileURL)

        let response = try await serverFeatureService.transcribeAudio(
            audioData,
            durationMs: job.durationMs,
            model: job.model,
            language: job.language,
            prompt: job.prompt,
            temperature: job.temperature
        )

        return response.text
    }

    public func transcribe(
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                // Begin background task to ensure transcription completes even if app is backgrounded
                await MainActor.run {
                    self.beginBackgroundTask()
                }

                defer {
                    Task { @MainActor in
                        self.isTranscribing = false
                        self.transcriptionTask = nil
                        self.endBackgroundTaskIfNeeded()
                    }
                }

                await MainActor.run {
                    isTranscribing = true
                }

                do {
                    guard let audioFileURL = audioFileURL else {
                        continuation.finish(throwing: VoiceDictationError.noRecordingFound)
                        return
                    }

                    let durationMs = lastRecordingDurationMs ?? 1000

                    let job = TranscriptionJob(
                        id: UUID(),
                        audioFileURL: audioFileURL,
                        createdAt: Date(),
                        durationMs: durationMs,
                        model: model,
                        language: language,
                        prompt: prompt,
                        temperature: temperature
                    )

                    await MainActor.run {
                        self.lastTranscriptionJob = job
                        self.lastTranscriptionError = nil
                    }

                    let text = try await performTranscription(job: job)

                    if Task.isCancelled {
                        continuation.finish(throwing: VoiceDictationError.transcriptionCancelled)
                        return
                    }

                    continuation.yield(text)
                    continuation.finish()

                    try? FileManager.default.removeItem(at: audioFileURL)
                    await MainActor.run {
                        self.audioFileURL = nil
                        self.hasCompletedRecording = false
                        self.lastRecordingDurationMs = nil
                        self.lastTranscriptionJob = nil
                    }

                } catch let error as DataServiceError {
                    if case .timeout = error {
                        await MainActor.run {
                            self.lastTranscriptionError = VoiceDictationError.transcriptionTimeout
                        }
                        continuation.finish(throwing: VoiceDictationError.transcriptionTimeout)
                    } else {
                        await MainActor.run {
                            self.lastTranscriptionError = error
                        }
                        continuation.finish(throwing: error)
                    }
                } catch {
                    await MainActor.run {
                        self.lastTranscriptionError = error
                    }
                    continuation.finish(throwing: error)
                }
            }

            Task { @MainActor in
                self.transcriptionTask = task
            }
        }
    }

    public func retryLastTranscription(
        model: String? = nil,
        language: String? = nil,
        prompt: String? = nil,
        temperature: Double? = nil
    ) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                // Begin background task to ensure transcription completes even if app is backgrounded
                await MainActor.run {
                    self.beginBackgroundTask()
                }

                defer {
                    Task { @MainActor in
                        self.isTranscribing = false
                        self.transcriptionTask = nil
                        self.endBackgroundTaskIfNeeded()
                    }
                }

                await MainActor.run {
                    isTranscribing = true
                }

                do {
                    guard let previousJob = await MainActor.run(body: { lastTranscriptionJob }) else {
                        continuation.finish(throwing: VoiceDictationError.noRecordingFound)
                        return
                    }

                    let job = TranscriptionJob(
                        id: UUID(),
                        audioFileURL: previousJob.audioFileURL,
                        createdAt: Date(),
                        durationMs: previousJob.durationMs,
                        model: model ?? previousJob.model,
                        language: language ?? previousJob.language,
                        prompt: prompt ?? previousJob.prompt,
                        temperature: temperature ?? previousJob.temperature
                    )

                    await MainActor.run {
                        self.lastTranscriptionJob = job
                        self.lastTranscriptionError = nil
                    }

                    let text = try await performTranscription(job: job)

                    if Task.isCancelled {
                        continuation.finish(throwing: VoiceDictationError.transcriptionCancelled)
                        return
                    }

                    continuation.yield(text)
                    continuation.finish()

                    try? FileManager.default.removeItem(at: job.audioFileURL)
                    await MainActor.run {
                        self.audioFileURL = nil
                        self.hasCompletedRecording = false
                        self.lastRecordingDurationMs = nil
                        self.lastTranscriptionJob = nil
                    }

                } catch let error as DataServiceError {
                    if case .timeout = error {
                        await MainActor.run {
                            self.lastTranscriptionError = VoiceDictationError.transcriptionTimeout
                        }
                        continuation.finish(throwing: VoiceDictationError.transcriptionTimeout)
                    } else {
                        await MainActor.run {
                            self.lastTranscriptionError = error
                        }
                        continuation.finish(throwing: error)
                    }
                } catch {
                    await MainActor.run {
                        self.lastTranscriptionError = error
                    }
                    continuation.finish(throwing: error)
                }
            }

            Task { @MainActor in
                self.transcriptionTask = task
            }
        }
    }

    public func discardLastRecording() {
        if let url = audioFileURL {
            try? FileManager.default.removeItem(at: url)
        }
        audioFileURL = nil
        hasCompletedRecording = false
        lastRecordingDurationMs = nil
        lastTranscriptionJob = nil
        lastTranscriptionError = nil
    }

    public func cancelTranscription() {
        transcriptionTask?.cancel()
        transcriptionTask = nil
        endBackgroundTaskIfNeeded()
        Task { @MainActor in
            self.isTranscribing = false
        }
    }

    // MARK: - Background Task Handling

    #if canImport(UIKit)
    private func beginBackgroundTask() {
        guard backgroundTaskID == .invalid else { return }

        backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "VoiceTranscription") { [weak self] in
            // Expiration handler - iOS is forcing us to stop
            // The transcription network request will continue server-side,
            // but we won't receive the result. User can retry when app resumes.
            self?.endBackgroundTaskIfNeeded()
        }
    }

    private func endBackgroundTaskIfNeeded() {
        guard backgroundTaskID != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTaskID)
        backgroundTaskID = .invalid
    }
    #else
    private func beginBackgroundTask() {}
    private func endBackgroundTaskIfNeeded() {}
    #endif
}

// MARK: - Supporting Types

extension VoiceDictationService {
    public struct TranscriptionJob {
        let id: UUID
        let audioFileURL: URL
        let createdAt: Date
        let durationMs: Int64
        let model: String?
        let language: String?
        let prompt: String?
        let temperature: Double?
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
    case transcriptionCancelled
    case transcriptionTimeout

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
        case .transcriptionCancelled:
            return "Transcription was cancelled"
        case .transcriptionTimeout:
            return "Transcription request timed out"
        }
    }
}
