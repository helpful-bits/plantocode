import SwiftUI
import Core

public struct MergeInstructionsComposeView: View {
    @Binding var mergeInstructions: String
    let selectedPlanCount: Int
    let autoStartRecording: Bool

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var container: AppContainer

    @State private var composedText = ""
    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var isEditing: Bool = false
    @State private var forceSelectionApply: Bool = false
    @StateObject private var undoRedoManager = UndoRedoManager()

    public init(
        mergeInstructions: Binding<String>,
        selectedPlanCount: Int,
        autoStartRecording: Bool = false
    ) {
        self._mergeInstructions = mergeInstructions
        self.selectedPlanCount = selectedPlanCount
        self.autoStartRecording = autoStartRecording
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Info banner
                HStack(spacing: Theme.Spacing.sm) {
                    Image(systemName: "arrow.triangle.merge")
                        .font(.system(size: 14))
                        .foregroundColor(Color.primary)
                    Text("\(selectedPlanCount) plans selected for merge")
                        .small()
                        .foregroundColor(Color.foreground)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.1))

                // Task Editor with integrated voice, enhance, and undo/redo
                TaskEditorView(
                    text: $composedText,
                    selectedRange: $selectedRange,
                    isEditing: $isEditing,
                    forceSelectionApply: $forceSelectionApply,
                    undoRedoManager: undoRedoManager,
                    autoStartRecording: autoStartRecording,
                    placeholder: "Add instructions for how to merge these plans...\n\nFor example:\n• Prioritize the approach from plan 1\n• Keep the detailed file structure from plan 2\n• Focus on performance optimizations",
                    sessionId: container.sessionService.currentSession?.id ?? "unknown",
                    projectDirectory: container.sessionService.currentSession?.projectDirectory,
                    onInteraction: {},
                    onTextChanged: {},
                    showLanguagePicker: true,
                    showEnhanceButtons: true,
                    showUndoRedo: true
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.codeBackground)
            .navigationTitle("Merge Instructions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(Color.foreground)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Apply") {
                        applyInstructions()
                    }
                    .buttonStyle(CompactPrimaryButtonStyle())
                    .accessibilityLabel("Apply merge instructions")
                }
            }
            .onAppear {
                // Load existing instructions
                composedText = mergeInstructions
            }
        }
    }

    private func applyInstructions() {
        mergeInstructions = composedText.trimmingCharacters(in: .whitespacesAndNewlines)
        dismiss()
    }
}

#Preview {
    @State var instructions = ""

    return MergeInstructionsComposeView(
        mergeInstructions: $instructions,
        selectedPlanCount: 3,
        autoStartRecording: false
    )
    .environmentObject(AppContainer(
        baseURL: URL(string: "http://localhost:3000")!,
        deviceId: "preview-device"
    ))
}
