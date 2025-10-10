import SwiftUI

public struct LanguagePickerSheet: View {
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

    public init(selectedLanguage: Binding<String>) {
        self._selectedLanguage = selectedLanguage
    }

    public var body: some View {
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
                    .buttonStyle(ToolbarButtonStyle())
                }
            }
        }
    }
}
