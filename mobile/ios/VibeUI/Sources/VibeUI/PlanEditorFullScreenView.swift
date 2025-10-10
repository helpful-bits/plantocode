import SwiftUI
import Core

public struct PlanEditorFullScreenView: View {
    @Binding var text: String
    var onSave: ((String) -> Void)?
    public var isReadOnly: Bool = false
    public var languageHint: String = "markdown"

    @Environment(\.presentationMode) var presentationMode
    @State private var localText: String

    public init(text: Binding<String>, onSave: ((String) -> Void)? = nil, isReadOnly: Bool = false, languageHint: String = "markdown") {
        self._text = text
        self.onSave = onSave
        self.isReadOnly = isReadOnly
        self.languageHint = languageHint
        self._localText = State(initialValue: text.wrappedValue)
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.background
                    .ignoresSafeArea(.all)

                VStack {
                    PlanRunestoneEditorView(
                        text: $localText,
                        isReadOnly: isReadOnly,
                        languageHint: languageHint
                    )
                    .ignoresSafeArea(.keyboard)
                }
                .background(Color.codeBackground)
            }
            .navigationTitle(isReadOnly ? "View Prompt" : "Edit Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        presentationMode.wrappedValue.dismiss()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark")
                                .font(.caption)
                            Text("Close")
                                .small()
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }

                if !isReadOnly {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            text = localText
                            onSave?(localText)
                            presentationMode.wrappedValue.dismiss()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "checkmark")
                                    .font(.caption)
                                Text("Save")
                                    .small()
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                }
            }
        }
    }
}
