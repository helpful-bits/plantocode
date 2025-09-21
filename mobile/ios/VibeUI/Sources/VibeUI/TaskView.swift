import SwiftUI
import Core
import AVFoundation

public struct TaskView: View {
  @ObservedObject private var appState = AppState.shared
  @StateObject private var serverFeatureService = DataServicesManager(baseURL: URL(string: Config.serverURL)!, deviceId: DeviceManager.shared.getOrCreateDeviceID()).serverFeatureService

  @State private var taskText = ""
  @State private var isRecording = false
  @State private var isEnhancing = false
  @State private var isTranscribing = false
  @State private var errorMessage: String?
  @State private var showingFileManagement = false
  @State private var showingImplementationPlans = false
  @State private var audioRecorder: AVAudioRecorder?

  public init() {}

  public var body: some View {
    NavigationView {
      VStack(spacing: 20) {
        // User Header
        if let user = appState.currentUser {
          userHeader(user)
        }

        // Main Content
        VStack(spacing: 24) {
          // Welcome Section
          VStack(spacing: 12) {
            Text("Vibe Manager")
              .font(.largeTitle)
              .fontWeight(.bold)
              .foregroundColor(Color("CardForeground"))

            Text("Create, enhance, and manage your development tasks")
              .font(.body)
              .foregroundColor(Color("MutedForeground"))
              .multilineTextAlignment(.center)
          }

          // Quick Actions
          quickActionsSection()

          // Task Input Section
          taskInputSection()

          // Error Message
          if let errorMessage = errorMessage {
            StatusAlertView(variant: .destructive, title: "Error", message: errorMessage)
          }
        }
        .padding()

        Spacer()
      }
      .background(Color("Background"))
      .sheet(isPresented: $showingFileManagement) {
        FileManagementView()
      }
      .sheet(isPresented: $showingImplementationPlans) {
        ImplementationPlansView()
      }
    }
    .navigationTitle("Tasks")
    .onAppear {
      setupAudioSession()
    }
  }

  @ViewBuilder
  private func userHeader(_ user: User) -> some View {
    HStack(spacing: 12) {
      if let picture = user.picture, let url = URL(string: picture) {
        AsyncImage(url: url) { image in
          image
            .resizable()
            .scaledToFill()
        } placeholder: {
          Color("Muted").opacity(0.3)
        }
        .frame(width: 40, height: 40)
        .clipShape(Circle())
      }

      VStack(alignment: .leading) {
        Text(user.name ?? "User")
          .fontWeight(.semibold)
          .foregroundColor(Color("Foreground"))
        Text(user.email ?? "")
          .font(.caption)
          .foregroundColor(Color("MutedForeground"))
      }

      Spacer()

      Button("Sign Out", role: .destructive) {
        Task {
          await appState.signOut()
        }
      }
      .buttonStyle(.borderedProminent)
    }
    .padding()
  }

  @ViewBuilder
  private func quickActionsSection() -> some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Quick Actions")
        .font(.headline)
        .foregroundColor(Color("CardForeground"))

      HStack(spacing: 16) {
        QuickActionButton(
          title: "File Management",
          icon: "folder",
          color: .blue
        ) {
          showingFileManagement = true
        }

        QuickActionButton(
          title: "Implementation Plans",
          icon: "doc.text",
          color: .green
        ) {
          showingImplementationPlans = true
        }
      }
    }
  }

  @ViewBuilder
  private func taskInputSection() -> some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Create New Task")
        .font(.headline)
        .foregroundColor(Color("CardForeground"))

      VStack(spacing: 12) {
        // Text Input
        ZStack(alignment: .topLeading) {
          if taskText.isEmpty {
            Text("Describe your task or idea...")
              .foregroundColor(Color("MutedForeground"))
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
          }

          TextEditor(text: $taskText)
            .font(.body)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
        .frame(minHeight: 100)
        .background(Color("Card"))
        .cornerRadius(8)
        .overlay(
          RoundedRectangle(cornerRadius: 8)
            .stroke(Color("Border"), lineWidth: 1)
        )

        // Action Buttons
        HStack(spacing: 12) {
          // Microphone Button
          Button(action: toggleRecording) {
            HStack(spacing: 6) {
              Image(systemName: isRecording ? "mic.fill" : "mic")
                .foregroundColor(isRecording ? .red : .primary)
              Text(isRecording ? "Stop" : "Record")
            }
            .font(.caption)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isRecording ? Color.red.opacity(0.1) : Color("Secondary"))
            .foregroundColor(isRecording ? .red : Color("SecondaryForeground"))
            .cornerRadius(6)
          }
          .disabled(isTranscribing)

          // Enhance Button
          Button("Enhance") {
            enhanceText()
          }
          .font(.caption)
          .padding(.horizontal, 12)
          .padding(.vertical, 6)
          .background(Color("Primary"))
          .foregroundColor(.white)
          .cornerRadius(6)
          .disabled(taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isEnhancing)

          if isEnhancing || isTranscribing {
            ProgressView()
              .progressViewStyle(CircularProgressViewStyle(tint: Color("Primary")))
              .scaleEffect(0.8)
          }

          Spacer()

          // Create Task Button
          Button("Create Task") {
            createTask()
          }
          .font(.caption)
          .fontWeight(.medium)
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
          .background(Color("Primary"))
          .foregroundColor(.white)
          .cornerRadius(8)
          .disabled(taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
  }

  private func toggleRecording() {
    if isRecording {
      stopRecording()
    } else {
      startRecording()
    }
  }

  private func startRecording() {
    guard !isRecording else { return }

    // Request microphone permission
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      DispatchQueue.main.async {
        if granted {
          self.beginRecording()
        } else {
          self.errorMessage = "Microphone permission is required for voice input"
        }
      }
    }
  }

  private func beginRecording() {
    let audioFilename = getDocumentsDirectory().appendingPathComponent("recording.wav")

    let settings = [
      AVFormatIDKey: Int(kAudioFormatLinearPCM),
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
    ]

    do {
      audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
      audioRecorder?.record()
      isRecording = true
      errorMessage = nil
    } catch {
      errorMessage = "Failed to start recording: \(error.localizedDescription)"
    }
  }

  private func stopRecording() {
    guard isRecording else { return }

    audioRecorder?.stop()
    isRecording = false

    // Transcribe the recorded audio
    transcribeRecording()
  }

  private func transcribeRecording() {
    let audioFilename = getDocumentsDirectory().appendingPathComponent("recording.wav")

    guard let audioData = try? Data(contentsOf: audioFilename) else {
      errorMessage = "Failed to read recorded audio"
      return
    }

    isTranscribing = true
    errorMessage = nil

    Task {
      do {
        let response = try await serverFeatureService.transcribeAudio(audioData)
        await MainActor.run {
          isTranscribing = false
          if !response.text.isEmpty {
            if taskText.isEmpty {
              taskText = response.text
            } else {
              taskText += " " + response.text
            }
          }
        }
      } catch {
        await MainActor.run {
          isTranscribing = false
          errorMessage = "Transcription failed: \(error.localizedDescription)"
        }
      }
    }
  }

  private func enhanceText() {
    let textToEnhance = taskText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !textToEnhance.isEmpty else { return }

    isEnhancing = true
    errorMessage = nil

    Task {
      do {
        let response = try await serverFeatureService.enhanceText(textToEnhance)
        await MainActor.run {
          isEnhancing = false
          taskText = response.enhancedText
        }
      } catch {
        await MainActor.run {
          isEnhancing = false
          errorMessage = "Text enhancement failed: \(error.localizedDescription)"
        }
      }
    }
  }

  private func createTask() {
    let finalText = taskText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !finalText.isEmpty else { return }

    guard let deviceId = MultiConnectionManager.shared.activeDeviceId,
          let relayClient = MultiConnectionManager.shared.relayConnection(for: deviceId) else {
      errorMessage = "No active device connection"
      return
    }

    let sessionId = "mobile-session-\(UUID().uuidString)" // Generate unique session ID
    let projectDirectory = "/path/to/project" // TODO: Get actual project directory
    let relevantFiles: [String] = [] // TODO: Allow user to select relevant files

    let request = RpcRequest(
      method: "actions.createImplementationPlan",
      params: [
        "sessionId": AnyCodable(sessionId),
        "taskDescription": AnyCodable(finalText),
        "projectDirectory": AnyCodable(projectDirectory),
        "relevantFiles": AnyCodable(relevantFiles)
      ]
    )

    Task {
      do {
        var taskResult: [String: Any]?

        for try await response in relayClient.invoke(targetDeviceId: deviceId.uuidString, request: request) {
          if let error = response.error {
            await MainActor.run {
              errorMessage = "Task creation error: \(error.message)"
            }
            return
          }

          if let result = response.result?.value as? [String: Any] {
            taskResult = result
            if response.isFinal {
              break
            }
          }
        }

        await MainActor.run {
          if let result = taskResult {
            // Handle successful task creation
            if let jobId = result["jobId"] as? String {
              // Clear the task text
              taskText = ""

              // Show success message
              // Could also navigate to implementation plans view
              print("Task created successfully with job ID: \(jobId)")
            }
          }
        }

      } catch {
        await MainActor.run {
          errorMessage = "Failed to create task: \(error.localizedDescription)"
        }
      }
    }
  }

  private func setupAudioSession() {
    do {
      try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      print("Failed to setup audio session: \(error)")
    }
  }

  private func getDocumentsDirectory() -> URL {
    let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    return paths[0]
  }
}

private struct QuickActionButton: View {
  let title: String
  let icon: String
  let color: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(spacing: 8) {
        Image(systemName: icon)
          .font(.title2)
          .foregroundColor(color)

        Text(title)
          .font(.caption)
          .foregroundColor(Color("CardForeground"))
          .multilineTextAlignment(.center)
      }
      .padding(16)
      .frame(maxWidth: .infinity)
      .background(Color("Card"))
      .cornerRadius(12)
      .overlay(
        RoundedRectangle(cornerRadius: 12)
          .stroke(color.opacity(0.3), lineWidth: 1)
      )
    }
    .buttonStyle(PlainButtonStyle())
  }
}
