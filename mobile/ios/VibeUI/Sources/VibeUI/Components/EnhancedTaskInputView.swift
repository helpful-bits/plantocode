import SwiftUI
import Core

public struct EnhancedTaskInputView: View {
    @Binding var taskDescription: String
    @FocusState private var isFocused: Bool

    @StateObject private var voiceService = VoiceDictationService.shared
    @StateObject private var enhancementService = TextEnhancementService.shared

    @State private var showingLanguagePicker = false
    @State private var selectedLanguage = "en-US"
    @State private var recordingDuration: TimeInterval = 0
    @State private var timer: Timer?
    @State private var showDeepResearch = false
    @State private var showRefineTask = false

    let placeholder: String
    let onInteraction: () -> Void

    public init(
        taskDescription: Binding<String>,
        placeholder: String = "Describe your task...",
        onInteraction: @escaping () -> Void = {}
    ) {
        self._taskDescription = taskDescription
        self.placeholder = placeholder
        self.onInteraction = onInteraction
    }

    public var body: some View {
        VStack(spacing: 12) {
            // Text Editor
            ZStack(alignment: .topLeading) {
                TextEditor(text: $taskDescription)
                    .focused($isFocused)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                    .onChange(of: taskDescription) { _ in
                        onInteraction()
                    }

                if taskDescription.isEmpty {
                    Text(placeholder)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
            }

            // Voice Recording Controls
            HStack(spacing: 12) {
                // Record Button
                Button(action: toggleRecording) {
                    HStack(spacing: 6) {
                        Image(systemName: voiceService.isRecording ? "stop.circle.fill" : "mic.circle.fill")
                            .font(.system(size: 20))

                        if voiceService.isRecording {
                            Text(formatDuration(recordingDuration))
                                .font(.system(.caption, design: .monospaced))

                            // Simple audio level visualization
                            HStack(spacing: 2) {
                                ForEach(0..<5, id: \.self) { _ in
                                    Capsule()
                                        .fill(Color.red)
                                        .frame(width: 2, height: CGFloat.random(in: 4...12))
                                }
                            }
                        }
                    }
                    .foregroundColor(voiceService.isRecording ? .red : .blue)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(voiceService.isRecording ? Color.red.opacity(0.1) : Color.blue.opacity(0.1))
                    .cornerRadius(8)
                }

                if !voiceService.isRecording {
                    // Language Picker
                    Button(action: { showingLanguagePicker = true }) {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                            Text(languageCode(selectedLanguage))
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color(.systemGray5))
                        .cornerRadius(6)
                    }
                }

                Spacer()
            }

            // Enhancement Buttons
            HStack(spacing: 8) {
                // Deep Research Button
                Button(action: { showDeepResearch = true }) {
                    HStack(spacing: 4) {
                        Image(systemName: "magnifyingglass")
                        Text("Deep Research")
                    }
                    .font(.caption)
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.blue)
                    .cornerRadius(8)
                }
                .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                // Refine Task Button
                Button(action: refineTask) {
                    HStack(spacing: 4) {
                        if enhancementService.isEnhancing {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text("Refine Task")
                    }
                    .font(.caption)
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.purple)
                    .cornerRadius(8)
                }
                .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || enhancementService.isEnhancing)

                Spacer()
            }
        }
        .sheet(isPresented: $showingLanguagePicker) {
            LanguagePickerSheet(selectedLanguage: $selectedLanguage)
        }
        .alert("Deep Research", isPresented: $showDeepResearch) {
            Button("Cancel", role: .cancel) {}
            Button("Start Research") {
                // Implement deep research
                // This would call a service to perform web search and enhance the task
            }
        } message: {
            Text("This will search the web for relevant information to enhance your task description. This can be expensive in terms of API usage.")
        }
    }

    private func toggleRecording() {
        Task {
            if voiceService.isRecording {
                voiceService.stopRecording()
                timer?.invalidate()
                timer = nil
                recordingDuration = 0

                // Transcribe the recording
                do {
                    for try await text in voiceService.transcribe() {
                        await MainActor.run {
                            if taskDescription.isEmpty {
                                taskDescription = text
                            } else {
                                taskDescription += "\n\n" + text
                            }
                        }
                    }
                } catch {
                    print("Transcription error: \(error)")
                }
            } else {
                try? await voiceService.startRecording()

                // Start timer for duration display
                timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
                    recordingDuration += 0.1
                }
            }
        }
    }

    private func refineTask() {
        Task {
            do {
                let enhanced = try await enhancementService.enhance(text: taskDescription)
                await MainActor.run {
                    taskDescription = enhanced
                }
            } catch {
                print("Enhancement error: \(error)")
            }
        }
    }

    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func languageCode(_ code: String) -> String {
        switch code {
        case "en-US": return "EN"
        case "es-ES": return "ES"
        case "fr-FR": return "FR"
        case "de-DE": return "DE"
        default: return "EN"
        }
    }
}

// Language Picker Sheet
private struct LanguagePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedLanguage: String

    let languages = [
        ("en-US", "English"),
        ("es-ES", "Spanish"),
        ("fr-FR", "French"),
        ("de-DE", "German"),
        ("it-IT", "Italian"),
        ("pt-PT", "Portuguese"),
        ("ja-JP", "Japanese"),
        ("zh-CN", "Chinese (Simplified)"),
    ]

    var body: some View {
        NavigationStack {
            List(languages, id: \.0) { code, name in
                Button(action: {
                    selectedLanguage = code
                    dismiss()
                }) {
                    HStack {
                        Text(name)
                        Spacer()
                        if selectedLanguage == code {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
            }
            .navigationTitle("Select Language")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    @State var task = ""
    return EnhancedTaskInputView(taskDescription: $task)
        .padding()
}
