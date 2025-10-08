import SwiftUI
import Core

public struct SettingsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var container: AppContainer
  @StateObject private var settingsService = SettingsDataService()

  @State private var showRegion = false
  @State private var showDevices = false
  @State private var showAccount = false
  @State private var selectedCliTool = "claude"
  @State private var customCommand = ""
  @State private var additionalArgs = ""
  @State private var isLoadingCliSettings = false
  @State private var hasLoadedInitialSettings = false
  @FocusState private var focusedField: Field?

  enum Field {
    case customCommand
    case additionalArgs
  }

  public init() {}

  public var body: some View {
    NavigationStack {
      VStack {
        Form {
          Section("Active Project") {
            ProjectSelectionHeaderView(onProjectChanged: nil)
            .environmentObject(appState)
            .environmentObject(container)
          }

          Section("Account") {
            HStack {
              Image(systemName: "person.circle.fill")
                .font(.system(size: 20))
                .foregroundColor(.secondary)
              Text(appState.currentUser?.email ?? "Unknown")
                .paragraph()
                .foregroundColor(.primary)
            }

            Button("Sign Out", role: .destructive) {
              Task {
                await appState.signOut()
              }
            }
            .buttonStyle(DestructiveButtonStyle())
          }

          Section("Connection") {
            Button("Change Region") {
              showRegion = true
            }
            .buttonStyle(SecondaryButtonStyle())

            Button("Switch Device") {
              showDevices = true
            }
            .buttonStyle(SecondaryButtonStyle())
          }

          Section("AI Settings") {
            NavigationLink("Configure AI Models") {
              AISettingsView(dataService: container.settingsService)
                .environmentObject(appState)
                .environmentObject(container)
            }
          }

          Section(header: Text("Terminal"), footer: Text("CLI tool will auto-launch when opening terminal")) {
            Picker("CLI Tool", selection: $selectedCliTool) {
              Text("Claude Code").tag("claude")
              Text("Cursor").tag("cursor")
              Text("Codex").tag("codex")
              Text("Gemini").tag("gemini")
              Text("Custom").tag("custom")
            }
            .onChange(of: selectedCliTool) { newValue in
              if hasLoadedInitialSettings {
                saveCliTool(newValue)
              }
            }

            if selectedCliTool == "custom" {
              HStack {
                Text("Command:")
                  .font(.caption)
                  .foregroundColor(.secondary)
                TextField("custom-cli", text: $customCommand)
                  .textFieldStyle(RoundedBorderTextFieldStyle())
                  .autocapitalization(.none)
                  .disableAutocorrection(true)
                  .focused($focusedField, equals: .customCommand)
                  .onSubmit {
                    saveCustomCommand()
                    focusedField = nil
                  }
              }
            }

            HStack {
              Text("Args:")
                .font(.caption)
                .foregroundColor(.secondary)
              TextField("Additional arguments", text: $additionalArgs)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .focused($focusedField, equals: .additionalArgs)
                .onSubmit {
                  saveAdditionalArgs()
                  focusedField = nil
                }
            }
          }


          Section("Legal") {
            if let termsURL = URL(string: "https://vibemanager.app/terms") {
              Link("Terms of Service", destination: termsURL)
            }
            if let privacyURL = URL(string: "https://vibemanager.app/privacy") {
              Link("Privacy Policy", destination: privacyURL)
            }
          }
        }
      }
      .navigationTitle("Settings")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .navigationBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .buttonStyle(ToolbarButtonStyle())
        }
      }
      .sheet(isPresented: $showRegion) {
        ServerSelectionView(isModal: true)
      }
      .sheet(isPresented: $showDevices) {
        DeviceSelectionView()
      }
      .onAppear {
        loadCliToolSettings()
      }
    }
  }

  private func loadCliToolSettings() {
    isLoadingCliSettings = true
    Task {
      do {
        try await settingsService.loadCliToolSettings()
        await MainActor.run {
          selectedCliTool = settingsService.preferredCliTool ?? "claude"
          customCommand = settingsService.customCliCommand ?? ""
          additionalArgs = settingsService.cliAdditionalArgs ?? ""
          isLoadingCliSettings = false
          hasLoadedInitialSettings = true
        }
      } catch {
        await MainActor.run {
          isLoadingCliSettings = false
        }
      }
    }
  }

  private func saveCliTool(_ tool: String) {
    Task {
      try? await settingsService.saveCliToolPreference(tool)
    }
  }

  private func saveCustomCommand() {
    Task {
      try? await settingsService.saveCustomCliCommand(customCommand)
    }
  }

  private func saveAdditionalArgs() {
    Task {
      try? await settingsService.saveCliAdditionalArgs(additionalArgs)
    }
  }
}

// MARK: - Helper Views

private struct SettingRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack {
      Text(label)
        .small()
        .foregroundColor(.secondary)

      Spacer()

      Text(value)
        .paragraph()
        .foregroundColor(.primary)
    }
  }
}

#Preview {
  SettingsView()
    .environmentObject(AppState.shared)
}
