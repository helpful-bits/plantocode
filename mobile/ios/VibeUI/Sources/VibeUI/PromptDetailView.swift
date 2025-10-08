import SwiftUI
import Core

public struct PromptDetailView: View {
    public let promptData: PromptResponse
    @Environment(\.dismiss) private var dismiss

    public init(promptData: PromptResponse) {
        self.promptData = promptData
    }

    public var body: some View {
        NavigationStack {
            TabView {
                ScrollView {
                    Text(promptData.combinedPrompt)
                        .small()
                        .foregroundColor(Color.cardForeground)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Color.card)
                .tabItem {
                    Label("Combined", systemImage: "doc.text.magnifyingglass")
                }

                ScrollView {
                    Text(promptData.systemPrompt)
                        .small()
                        .foregroundColor(Color.cardForeground)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Color.card)
                .tabItem {
                    Label("System", systemImage: "gearshape.2")
                }

                ScrollView {
                    Text(promptData.userPrompt)
                        .small()
                        .foregroundColor(Color.cardForeground)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Color.card)
                .tabItem {
                    Label("User", systemImage: "person")
                }
            }
            .navigationTitle("Plan Prompt")
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
