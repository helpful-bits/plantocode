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

    // Use AVAudioRecorder for native AAC compression (much smaller files than WAV)
    private var audioRecorder: AVAudioRecorder?
    private var audioFileURL: URL?
    private let serverFeatureService = ServerFeatureService()
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

        // Use M4A (AAC) format for much smaller file sizes (~10x smaller than WAV)
        // A 5-minute WAV is ~50MB, but AAC is ~5MB - significantly faster upload
        audioFileURL = recordingsDir.appendingPathComponent(UUID().uuidString).appendingPathExtension("m4a")

        guard let audioFileURL = audioFileURL else {
            throw VoiceDictationError.fileCreationFailed
        }

        // AAC recording settings for optimal quality and small file size
        // 44.1kHz sample rate, mono, AAC codec with high quality
        let recordingSettings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            AVEncoderBitRateKey: 128000  // 128 kbps - good quality for speech
        ]

        do {
            audioRecorder = try AVAudioRecorder(url: audioFileURL, settings: recordingSettings)
            audioRecorder?.isMeteringEnabled = true  // Enable metering for audio levels
        } catch {
            throw VoiceDictationError.fileCreationFailed
        }

        guard let recorder = audioRecorder else {
            throw VoiceDictationError.fileCreationFailed
        }

        // Start recording
        guard recorder.record() else {
            throw VoiceDictationError.fileCreationFailed
        }

        isRecording = true
        recordingStartTime = Date()

        // Start timer to update audio levels for visualization
        levelUpdateTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.updateAudioLevelsFromRecorder()
            }
        }
    }

    public func stopRecording() {
        guard isRecording else { return }

        // Stop the level update timer
        levelUpdateTimer?.invalidate()
        levelUpdateTimer = nil

        // Stop the recorder
        audioRecorder?.stop()
        audioRecorder = nil

        isRecording = false
        audioLevels = [0, 0, 0, 0, 0]

        if let startTime = recordingStartTime {
            lastRecordingDurationMs = Int64(Date().timeIntervalSince(startTime) * 1000)
        }

        hasCompletedRecording = true

        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
        }
    }

    private func updateAudioLevelsFromRecorder() {
        guard let recorder = audioRecorder, recorder.isRecording else {
            audioLevels = [0, 0, 0, 0, 0]
            return
        }

        // Update meters to get current audio levels
        recorder.updateMeters()

        // Get average power in decibels (typically -160 to 0)
        let averagePower = recorder.averagePower(forChannel: 0)

        // Convert dB to linear scale (0 to 1)
        // -60 dB is essentially silence, 0 dB is max
        let minDb: Float = -60.0
        let normalizedLevel = max(0, (averagePower - minDb) / (-minDb))

        // Create animated levels with slight variations for each bar
        // This creates a more dynamic waveform effect
        let barCount = 5
        var newLevels: [Float] = []
        for _ in 0..<barCount {
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
                        self.lastTranscriptionError = nil
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
                        self.lastTranscriptionError = nil
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
